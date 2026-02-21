import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import path from "path";
import Database from "better-sqlite3";

dotenv.config();

const db = new Database("database.sqlite");

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS video_metadata (
    video_key TEXT PRIMARY KEY,
    uploader_id TEXT,
    uploader_name TEXT,
    FOREIGN KEY (uploader_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS upload_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    size INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const app = express();
const PORT = 3000;

// R2 Configuration
const rawEndpoint = process.env.R2_ENDPOINT || "";
const rawBucketName = process.env.R2_BUCKET_NAME || "";

// Helper to get sanitized R2 config
const getR2Config = () => {
  try {
    if (!rawEndpoint) return null;
    const url = new URL(rawEndpoint.startsWith('http') ? rawEndpoint : `https://${rawEndpoint}`);
    return {
      endpoint: `${url.protocol}//${url.host}`,
      bucketName: rawBucketName.replace("your_bucket_name", "").trim(),
      publicUrl: (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "")
    };
  } catch (e) {
    console.error("Invalid R2_ENDPOINT:", rawEndpoint);
    return null;
  }
};

const r2Config = getR2Config();

const r2Client = new S3Client({
  region: "auto",
  endpoint: r2Config?.endpoint || "https://placeholder.r2.cloudflarestorage.com",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "placeholder",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "placeholder",
  },
});

const bucketName = r2Config?.bucketName || "";
const publicUrl = r2Config?.publicUrl || "";

// Multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

app.use(express.json());

// Global error handler for multer and other middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "File too large. Maximum size is 100MB." });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
});

// API Routes
app.get("/api/videos", async (req, res) => {
  try {
    if (!bucketName) {
      console.error("R2_BUCKET_NAME is not defined in environment variables");
      return res.status(500).json({ error: "R2 Bucket Name not configured. Please check your Secrets panel." });
    }

    console.log(`Fetching objects from bucket: ${bucketName}`);
    
    // Try listing with prefix first
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      // Prefix: "videos/", // Removed prefix to show all videos in the bucket for better visibility
    });

    const data = await r2Client.send(command);
    console.log(`Found ${data.Contents?.length || 0} objects in bucket`);

    const videos = (data.Contents || [])
      .filter(item => {
        if (!item.Key) return false;
        // Filter for common video extensions
        const ext = path.extname(item.Key).toLowerCase();
        return [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);
      })
      .map(item => {
        const url = publicUrl ? `${publicUrl}/${item.Key}` : "";
        const metadata = db.prepare("SELECT uploader_name FROM video_metadata WHERE video_key = ?").get(item.Key) as { uploader_name: string } | undefined;
        
        return {
          key: item.Key!,
          name: item.Key!.split("/").pop() || item.Key!,
          size: item.Size || 0,
          lastModified: item.LastModified?.toISOString() || new Date().toISOString(),
          url: url,
          uploader: metadata?.uploader_name || "Unknown"
        };
      });

    console.log(`Filtered to ${videos.length} video files`);
    res.json(videos);
  } catch (error: any) {
    console.error("Error listing videos from R2:", error);
    res.status(500).json({ 
      error: `Failed to connect to R2: ${error.message}. Please verify your R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.` 
    });
  }
});

app.post("/api/upload", upload.single("video"), async (req, res) => {
  try {
    if (!r2Config || !bucketName) {
      return res.status(500).json({ error: "R2 is not configured. Please check your environment variables." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    
    // Check monthly quota (10GB)
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const usage = db.prepare("SELECT SUM(size) as total FROM upload_history WHERE strftime('%Y-%m', timestamp) = ?").get(currentMonth) as { total: number | null };
    const totalUsage = usage?.total || 0;
    const limit = 10 * 1024 * 1024 * 1024; // 10GB

    if (totalUsage + file.size > limit) {
      return res.status(400).json({ error: "Monthly upload quota exceeded (10GB limit). Please try again next month." });
    }

    const { uploaderId, uploaderName } = req.body;
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${Date.now()}-${originalName}`;
    const key = `videos/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await r2Client.send(command);

    // Save metadata and history
    if (uploaderId && uploaderName) {
      db.prepare("INSERT INTO video_metadata (video_key, uploader_id, uploader_name) VALUES (?, ?, ?)").run(key, uploaderId, uploaderName);
    }
    db.prepare("INSERT INTO upload_history (size) VALUES (?)").run(file.size);

    res.json({
      success: true,
      key,
      url: publicUrl ? `${publicUrl}/${key}` : "",
    });
  } catch (error: any) {
    console.error("Error uploading video:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/videos/*", async (req, res) => {
  try {
    if (!r2Config || !bucketName) {
      return res.status(500).json({ error: "R2 is not configured. Please check your environment variables." });
    }

    const key = req.params[0];
    if (!key || !key.startsWith("videos/")) {
        return res.status(400).json({ error: "Invalid key" });
    }

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await r2Client.send(command);
    
    // Clean up metadata
    db.prepare("DELETE FROM video_metadata WHERE video_key = ?").run(key);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting video:", error);
    res.status(500).json({ error: error.message });
  }
});

app.patch("/api/videos/*", async (req, res) => {
  try {
    if (!r2Config || !bucketName) {
      return res.status(500).json({ error: "R2 is not configured. Please check your environment variables." });
    }

    const oldKey = req.params[0];
    const { newName } = req.body;

    if (!oldKey || !oldKey.startsWith("videos/") || !newName) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const extension = path.extname(oldKey);
    const sanitizedNewName = newName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const newKey = `videos/${sanitizedNewName}${sanitizedNewName.endsWith(extension) ? '' : extension}`;

    if (oldKey === newKey) {
      return res.json({ success: true, key: oldKey });
    }

    // 1. Copy to new key
    await r2Client.send(new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${oldKey}`,
      Key: newKey,
    }));

    // 2. Delete old key
    await r2Client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: oldKey,
    }));

    // 3. Update metadata
    db.prepare("UPDATE video_metadata SET video_key = ? WHERE video_key = ?").run(newKey, oldKey);

    res.json({ success: true, key: newKey });
  } catch (error: any) {
    console.error("Error renaming video:", error);
    res.status(500).json({ error: error.message });
  }
});

// User Management Routes
app.get("/api/users", (req, res) => {
  try {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users", (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    
    const id = uuidv4();
    db.prepare("INSERT INTO users (id, name) VALUES (?, ?)").run(id, name);
    res.json({ id, name });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/users/:id", (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/storage-usage", (req, res) => {
  console.log("GET /api/storage-usage");
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usage = db.prepare("SELECT SUM(size) as total FROM upload_history WHERE strftime('%Y-%m', timestamp) = ?").get(currentMonth) as { total: number | null };
    const response = { 
      used: usage?.total || 0,
      limit: 10 * 1024 * 1024 * 1024 // 10GB
    };
    console.log("Storage usage response:", response);
    res.json(response);
  } catch (error: any) {
    console.error("Error in /api/storage-usage:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/storage-history", (req, res) => {
  console.log("GET /api/storage-history");
  try {
    const history = db.prepare(`
      SELECT 
        strftime('%Y-%m', timestamp) as month,
        SUM(size) as total
      FROM upload_history
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all();
    console.log("Storage history response length:", history.length);
    res.json(history);
  } catch (error: any) {
    console.error("Error in /api/storage-history:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
