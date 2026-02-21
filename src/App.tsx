import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Video, Trash2, Play, Loader2, AlertCircle, CheckCircle2, X, Copy, Check, Moon, Sun, FileVideo, Search, Filter, ChevronLeft, ChevronRight, Edit3, LayoutDashboard, Library, Settings as SettingsIcon, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

interface VideoFile {
  key: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  uploader: string;
}

interface User {
  id: string;
  name: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'library' | 'settings'>('dashboard');
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUploader, setSelectedUploader] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [storageUsage, setStorageUsage] = useState<{ used: number; limit: number }>({ used: 0, limit: 10 * 1024 * 1024 * 1024 });
  const [storageHistory, setStorageHistory] = useState<{ month: string; total: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [preparingFile, setPreparingFile] = useState<{ file: File; name: string } | null>(null);
  const [renamingVideo, setRenamingVideo] = useState<{ key: string; name: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'size'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchVideos();
    fetchUsers();
    fetchStorageUsage();
    fetchStorageHistory();
  }, []);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/videos');
      if (!response.ok) throw new Error('Failed to fetch videos');
      const data = await response.json();
      setVideos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStorageUsage = async () => {
    try {
      const response = await fetch('/api/storage-usage');
      if (!response.ok) throw new Error('Failed to fetch storage usage');
      const data = await response.json();
      setStorageUsage(data);
    } catch (err: any) {
      console.error('Error fetching storage usage:', err);
    }
  };

  const fetchStorageHistory = async () => {
    try {
      const response = await fetch('/api/storage-history');
      if (!response.ok) throw new Error('Failed to fetch storage history');
      const data = await response.json();
      setStorageHistory(data);
    } catch (err: any) {
      console.error('Error fetching storage history:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
      if (data.length > 0 && !selectedUploader) {
        setSelectedUploader(data[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
    }
  };

  const handleAddUser = async (name: string) => {
    try {
      const response = await axios.post('/api/users', { name });
      setUsers(prev => [response.data, ...prev]);
      if (!selectedUploader) setSelectedUploader(response.data.id);
      setSuccess('User added successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await axios.delete(`/api/users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
      if (selectedUploader === id) setSelectedUploader(users.find(u => u.id !== id)?.id || '');
      setSuccess('User removed.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      setError('Please upload a valid video file.');
      return;
    }

    // Remove extension for the name input
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    setPreparingFile({ file, name: nameWithoutExt });
  };

  const handleUpload = async () => {
    if (!preparingFile) return;
    
    const { file, name } = preparingFile;
    const extension = file.name.substring(file.name.lastIndexOf('.'));
    const finalFileName = name.endsWith(extension) ? name : name + extension;

    try {
      setUploading(true);
      setUploadProgress(0);
      setError(null);
      setPreparingFile(null);

      const formData = new FormData();
      formData.append('video', file, finalFileName);
      
      const uploader = users.find(u => u.id === selectedUploader);
      if (uploader) {
        formData.append('uploaderId', uploader.id);
        formData.append('uploaderName', uploader.name);
      }

      const response = await axios.post('/api/upload', formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
          setUploadProgress(percentCompleted);
        }
      });

      setSuccess('Video uploaded successfully!');
      fetchVideos();
      fetchStorageUsage();
      fetchStorageHistory();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;

    try {
      const response = await fetch(`/api/videos/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete video');

      setVideos(videos.filter(v => v.key !== key));
      if (selectedVideo?.key === key) setSelectedVideo(null);
      setSuccess('Video deleted successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRename = async () => {
    if (!renamingVideo) return;

    try {
      setLoading(true);
      const response = await axios.patch(`/api/videos/${encodeURIComponent(renamingVideo.key)}`, {
        newName: renamingVideo.name
      });

      setSuccess('Video renamed successfully!');
      setRenamingVideo(null);
      fetchVideos();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // Search
    if (searchQuery) {
      result = result.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }

    // User Filter
    if (userFilter !== 'all') {
      result = result.filter(v => v.uploader === userFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      if (sortBy === 'oldest') return new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      if (sortBy === 'size') return b.size - a.size;
      return 0;
    });

    return result;
  }, [videos, searchQuery, sortBy, userFilter]);

  const totalPages = Math.ceil(filteredVideos.length / itemsPerPage);
  const paginatedVideos = filteredVideos.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 selection:bg-emerald-500/30 flex ${
      theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
    }`}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 transition-transform duration-300 transform border-r backdrop-blur-md ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:inset-0 ${
        theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white/80'
      }`}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center gap-3 border-b border-zinc-800/10 dark:border-zinc-200/10">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Video className="text-zinc-950 w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Bank Content</h1>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'dashboard' 
                  ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              Menu Utama
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'library' 
                  ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Library className="w-5 h-5" />
              Your Library
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'settings' 
                  ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <SettingsIcon className="w-5 h-5" />
              Setting
            </button>
          </nav>

          <div className="p-4 border-t border-zinc-800/10 dark:border-zinc-200/10 space-y-4">
            <div className="px-4 py-2 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <span>Monthly Storage</span>
                <span>{Math.round((storageUsage.used / storageUsage.limit) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(storageUsage.used / storageUsage.limit) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                {formatSize(storageUsage.used)} / {formatSize(storageUsage.limit)}
              </p>
            </div>

            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                theme === 'dark' ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className={`border-b backdrop-blur-md sticky top-0 z-20 transition-colors duration-300 ${
          theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white/80'
        }`}>
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h2 className="text-lg font-semibold capitalize lg:hidden">Bank Content</h2>
              <h2 className="text-lg font-semibold capitalize hidden lg:block">
                {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'library' ? 'Video Library' : 'Settings'}
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={fetchVideos}
                disabled={loading}
                className={`p-2 rounded-lg transition-all ${
                  theme === 'dark' ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'
                }`}
                title="Refresh library"
              >
                <Loader2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 px-4 py-2 rounded-lg font-medium transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload Video'}</span>
                <span className="sm:hidden">{uploading ? '' : 'Upload'}</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="video/*"
              className="hidden"
            />
          </div>
        </header>

        <main className="max-w-6xl w-full mx-auto px-6 py-12 flex-1">
        {/* Upload Progress Bar */}
        <AnimatePresence>
          {uploading && uploadProgress > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-8 p-6 rounded-2xl border shadow-xl transition-colors duration-300 ${
                theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <Upload className="w-5 h-5 text-emerald-500 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-medium">Uploading Video</h3>
                    <p className="text-xs text-zinc-500">Sending to Cloudflare R2...</p>
                  </div>
                </div>
                <span className="text-sm font-mono font-bold text-emerald-500">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Upload Preparation Modal */}
        <AnimatePresence>
          {preparingFile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden transition-colors duration-300 ${
                  theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold">Prepare Upload</h3>
                    <button 
                      onClick={() => setPreparingFile(null)}
                      className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-zinc-500" />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className={`p-4 rounded-2xl flex items-center gap-4 ${
                      theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-100'
                    }`}>
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                        <FileVideo className="w-6 h-6 text-emerald-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Original File</p>
                        <p className="font-medium truncate">{preparingFile.file.name}</p>
                        <p className="text-xs text-zinc-400">{formatSize(preparingFile.file.size)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500">Display Name</label>
                      <input
                        type="text"
                        value={preparingFile.name}
                        onChange={(e) => setPreparingFile({ ...preparingFile, name: e.target.value })}
                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                          theme === 'dark' 
                            ? 'bg-zinc-800 border-zinc-700 text-white' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        }`}
                        placeholder="Enter video name..."
                        autoFocus
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500">Uploader</label>
                      <select
                        value={selectedUploader}
                        onChange={(e) => setSelectedUploader(e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                          theme === 'dark' 
                            ? 'bg-zinc-800 border-zinc-700 text-white' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        }`}
                      >
                        {users.length === 0 && <option value="">No users found - Add in Settings</option>}
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                      {users.length === 0 && (
                        <p className="text-[10px] text-amber-500">Please add a user in the Settings menu first.</p>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setPreparingFile(null)}
                        className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                          theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-zinc-200 hover:bg-zinc-300'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={users.length === 0}
                        className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                      >
                        Start Upload
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Rename Modal */}
        <AnimatePresence>
          {renamingVideo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden transition-colors duration-300 ${
                  theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold">Rename Video</h3>
                    <button 
                      onClick={() => setRenamingVideo(null)}
                      className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-zinc-500" />
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-500">New Name</label>
                      <input
                        type="text"
                        value={renamingVideo.name}
                        onChange={(e) => setRenamingVideo({ ...renamingVideo, name: e.target.value })}
                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                          theme === 'dark' 
                            ? 'bg-zinc-800 border-zinc-700 text-white' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        }`}
                        placeholder="Enter new name..."
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setRenamingVideo(null)}
                        className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                          theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700' : 'bg-zinc-200 hover:bg-zinc-300'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRename}
                        className="flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Notifications */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error-alert"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto hover:text-red-300">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
          {success && (
            <motion.div
              key="success-alert"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm">{success}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Video Player Section */}
        {selectedVideo && (
          <motion.section
            key="video-player-section"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12"
          >
            <div className={`rounded-2xl overflow-hidden border shadow-2xl transition-colors duration-300 ${
              theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
            }`}>
              <div className="aspect-video bg-black relative group">
                <video
                  src={selectedVideo.url}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h2 className={`text-lg font-medium transition-colors duration-300 ${
                    theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'
                  }`}>{selectedVideo.name}</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    Uploaded by <span className="text-emerald-500 font-medium">{selectedVideo.uploader}</span> • {formatSize(selectedVideo.size)} • {new Date(selectedVideo.lastModified).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(selectedVideo.url, 'selected')}
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                      theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400' : 'hover:bg-zinc-100 text-zinc-500 hover:text-emerald-600'
                    }`}
                    title="Copy video URL"
                  >
                    {copiedKey === 'selected' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    <span className="text-sm font-medium">{copiedKey === 'selected' ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                  <button
                    onClick={() => setSelectedVideo(null)}
                    className={`p-2 rounded-lg transition-colors ${
                      theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {activeTab === 'dashboard' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            <div className="text-center max-w-2xl mx-auto space-y-6">
              <h2 className="text-4xl font-bold tracking-tight">Welcome to Bank Content</h2>
              <p className="text-zinc-500 text-lg leading-relaxed">
                Your private vault for high-quality video content. Securely store, manage, and preview your assets with Cloudflare R2 integration.
              </p>
              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-2xl font-bold shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-3"
                >
                  <Upload className="w-5 h-5" />
                  Upload New Video
                </button>
                <button
                  onClick={() => setActiveTab('library')}
                  className={`px-8 py-4 rounded-2xl font-bold transition-all border ${
                    theme === 'dark' ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-white border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  Browse Library
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`p-6 rounded-3xl border ${
                theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
              }`}>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">Monthly Quota</p>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-3xl font-bold">{Math.round((storageUsage.used / storageUsage.limit) * 100)}%</span>
                  <span className="text-sm text-zinc-500">Used</span>
                </div>
                <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4">
                  <motion.div 
                    className="h-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(storageUsage.used / storageUsage.limit) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-zinc-500">
                  {formatSize(storageUsage.used)} of {formatSize(storageUsage.limit)} uploaded this month.
                </p>
              </div>

              <div className={`p-6 rounded-3xl border ${
                theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
              }`}>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">Total Videos</p>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-3xl font-bold">{videos.length}</span>
                  <span className="text-sm text-zinc-500">Files</span>
                </div>
                <p className="text-sm text-zinc-500 mt-6">
                  Manage all your assets in the Library tab.
                </p>
              </div>

              <div className={`p-6 rounded-3xl border ${
                theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
              }`}>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-4">Active Users</p>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-3xl font-bold">{users.length}</span>
                  <span className="text-sm text-zinc-500">Profiles</span>
                </div>
                <p className="text-sm text-zinc-500 mt-6">
                  Add more uploaders in Settings.
                </p>
              </div>
            </div>

            {videos.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold px-2">Recently Uploaded</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {videos.slice(0, 3).map((video) => (
                    <div 
                      key={video.key}
                      className={`group border rounded-2xl overflow-hidden transition-all hover:shadow-xl ${
                        theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <div className="aspect-video relative bg-zinc-800">
                        {video.url && (
                          <video src={video.url} className="w-full h-full object-cover opacity-80" muted />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button
                            onClick={() => {
                              setSelectedVideo(video);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-zinc-950 shadow-lg transform scale-90 group-hover:scale-100 transition-transform"
                          >
                            <Play className="w-6 h-6 fill-current" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <h4 className="font-medium truncate">{video.name}</h4>
                        <p className="text-xs text-zinc-500 mt-1">By {video.uploader}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'library' && (
          <section>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Your Library</h2>
                <p className="text-sm text-zinc-500">{filteredVideos.length} videos found</p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search videos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                      theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
                    }`}
                  />
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4 text-zinc-500" />
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className={`flex-1 sm:flex-none px-3 py-2 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                      theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
                    }`}
                  >
                    <option value="all">All Users</option>
                    {Array.from(new Set(videos.map(v => v.uploader))).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className={`flex-1 sm:flex-none px-3 py-2 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                      theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-900'
                    }`}
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="size">Largest Size</option>
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-zinc-500 animate-pulse">Scanning your vault...</p>
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className={`text-center py-24 border-2 border-dashed rounded-3xl transition-colors duration-300 ${
                theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
              }`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors duration-300 ${
                  theme === 'dark' ? 'bg-zinc-900' : 'bg-zinc-100'
                }`}>
                  <Video className={`w-8 h-8 ${theme === 'dark' ? 'text-zinc-700' : 'text-zinc-400'}`} />
                </div>
                <h3 className={`text-lg font-medium transition-colors duration-300 ${
                  theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'
                }`}>
                  {searchQuery || userFilter !== 'all' ? 'No matching videos' : 'No videos yet'}
                </h3>
                <p className="text-zinc-500 mt-2 max-w-xs mx-auto">
                  {searchQuery || userFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Upload your first video to see it here.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedVideos.map((video) => (
                    <motion.div
                      key={video.key}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`group border rounded-2xl overflow-hidden transition-all hover:shadow-xl hover:shadow-black/10 ${
                        theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700' : 'bg-white border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className={`aspect-video relative overflow-hidden transition-colors duration-300 ${
                        theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'
                      }`}>
                        {/* Video Preview / Thumbnail Simulation */}
                        {video.url ? (
                          <video 
                            src={video.url} 
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                            onMouseOver={e => {
                              const v = e.target as HTMLVideoElement;
                              v.play().catch(() => {}); // Ignore play errors
                            }}
                            onMouseOut={e => {
                              const v = e.target as HTMLVideoElement;
                              v.pause();
                              v.currentTime = 0;
                            }}
                            muted
                            playsInline
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs text-center p-4">
                            Public URL not configured
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-100 group-hover:opacity-0 transition-opacity pointer-events-none">
                          <Play className="w-10 h-10 text-white fill-white/20" />
                        </div>
                        
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={() => setSelectedVideo(video)}
                            className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-zinc-950 transform scale-90 group-hover:scale-100 transition-transform shadow-lg"
                          >
                            <Play className="w-6 h-6 fill-current" />
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className={`font-medium truncate transition-colors duration-300 ${
                              theme === 'dark' ? 'text-zinc-200' : 'text-zinc-900'
                            }`} title={video.name}>
                              {video.name}
                            </h3>
                            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mt-0.5">By {video.uploader}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setRenamingVideo({ key: video.key, name: video.name })}
                              className={`p-1.5 rounded-lg transition-all ${
                                theme === 'dark' ? 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                              }`}
                              title="Rename Video"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => copyToClipboard(video.url, video.key)}
                              className={`p-1.5 rounded-lg transition-all ${
                                copiedKey === video.key 
                                  ? 'text-emerald-400 bg-emerald-400/10' 
                                  : theme === 'dark' ? 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                              }`}
                              title="Copy Link"
                            >
                              {copiedKey === video.key ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDelete(video.key)}
                              className={`p-1.5 rounded-lg transition-all ${
                                theme === 'dark' ? 'text-zinc-500 hover:text-red-400 hover:bg-red-400/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'
                              }`}
                              title="Delete Video"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 text-xs text-zinc-500">
                          <span>{formatSize(video.size)}</span>
                          <span>{new Date(video.lastModified).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center mt-12 gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={`p-2 rounded-xl border transition-all disabled:opacity-30 ${
                        theme === 'dark' ? 'border-zinc-800 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i + 1)}
                          className={`w-10 h-10 rounded-xl font-medium transition-all ${
                            currentPage === i + 1
                              ? 'bg-emerald-500 text-zinc-950'
                              : theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className={`p-2 rounded-xl border transition-all disabled:opacity-30 ${
                        theme === 'dark' ? 'border-zinc-800 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'settings' && (
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl mx-auto space-y-8"
          >
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Settings</h2>
              <p className="text-zinc-500">Manage users and application preferences.</p>
            </div>

            <div className={`p-6 rounded-3xl border ${
              theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
            }`}>
              <h3 className="text-lg font-medium mb-4">User Management</h3>
              <div className="space-y-4">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('userName') as HTMLInputElement;
                    if (input.value) {
                      handleAddUser(input.value);
                      input.value = '';
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="userName"
                    type="text"
                    placeholder="Enter new user name..."
                    className={`flex-1 px-4 py-2 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 ${
                      theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-bold transition-all active:scale-95"
                  >
                    Add User
                  </button>
                </form>

                <div className="space-y-2">
                  {users.map(user => (
                    <div 
                      key={user.id}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-100'
                      }`}
                    >
                      <span className="font-medium">{user.name}</span>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="text-center py-4 text-zinc-500 text-sm italic">No users added yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-3xl border ${
              theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
            }`}>
              <h3 className="text-lg font-medium mb-4">Storage Usage History</h3>
              <div className="space-y-3">
                {storageHistory.map((item) => (
                  <div 
                    key={item.month}
                    className={`flex items-center justify-between p-3 rounded-xl ${
                      theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-100'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{new Date(item.month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                      <div className="w-32 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500" 
                          style={{ width: `${Math.min(100, (item.total / (10 * 1024 * 1024 * 1024)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-bold text-emerald-500">{formatSize(item.total)}</span>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">/ 10GB Limit</p>
                    </div>
                  </div>
                ))}
                {storageHistory.length === 0 && (
                  <p className="text-center py-4 text-zinc-500 text-sm italic">No upload history found.</p>
                )}
              </div>
            </div>

            <div className={`p-6 rounded-3xl border ${
              theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
            }`}>
              <h3 className="text-lg font-medium mb-4">Appearance</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Theme Mode</p>
                  <p className="text-xs text-zinc-500">Switch between light and dark interface.</p>
                </div>
                <button
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                    theme === 'dark' ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  <span className="text-sm font-medium capitalize">{theme} Mode</span>
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </main>

      {/* Footer */}
      <footer className={`max-w-6xl mx-auto px-6 py-12 border-t text-center transition-colors duration-300 ${
        theme === 'dark' ? 'border-zinc-900 text-zinc-600' : 'border-zinc-200 text-zinc-400'
      }`}>
        <p className="text-sm">
          Powered by Branerfit • Created by Rizki
        </p>
      </footer>
      </div>
    </div>
  );
}
