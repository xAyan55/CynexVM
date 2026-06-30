import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Folder, File, ChevronRight, FolderPlus, FilePlus, 
  Trash2, X, Save, LayoutGrid, List, Search, Eye, EyeOff, Upload
} from 'lucide-react';

interface FileItem {
  name: string;
  size: number;
  uid: number;
  gid: number;
  permissions: string;
  isDirectory: boolean;
  isSymbolicLink?: boolean;
  updatedAt?: string;
}

interface FileManagerProps {
  instanceId: string;
}

export const FileManager: React.FC<FileManagerProps> = ({ instanceId }) => {
  const [currentPath, setCurrentPath] = useState('/root');
  const [pathInput, setPathInput] = useState('/root');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View state options
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  // Monaco Editor popup
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);

  // Modals dialogs
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showFileModal, setShowFileModal] = useState(false);

  // Uploading state
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDirectory(currentPath);
    setPathInput(currentPath);
  }, [currentPath]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ path });
      const res = await fetch(`/api/v1/instances/${instanceId}/files/list?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Failed to read directory');
        setItems([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to list directory contents');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderClick = (item: FileItem) => {
    const nextPath = currentPath.endsWith('/') 
      ? `${currentPath}${item.name}` 
      : `${currentPath}/${item.name}`;
    setCurrentPath(nextPath);
  };

  const handleBreadcrumbClick = (index: number) => {
    const parts = currentPath.split('/').filter(Boolean);
    const targetPath = '/' + parts.slice(0, index + 1).join('/');
    setCurrentPath(targetPath);
  };

  const handleOpenFile = async (item: FileItem) => {
    setEditorLoading(true);
    const filePath = currentPath.endsWith('/') ? `${currentPath}${item.name}` : `${currentPath}/${item.name}`;
    try {
      const query = new URLSearchParams({ path: filePath });
      const res = await fetch(`/api/v1/instances/${instanceId}/files/read?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEditingFile({ path: filePath, content: data.content });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to read file');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to open file');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setEditorLoading(true);
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: editingFile.path,
          content: editingFile.content
        })
      });
      if (res.ok) {
        alert('File saved successfully');
        setEditingFile(null);
        loadDirectory(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to save file');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save file');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${item.name}` : `${currentPath}/${item.name}`;
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      if (res.ok) {
        loadDirectory(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to delete file');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${newFolderName}/.keep` : `${currentPath}/${newFolderName}/.keep`;
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          content: ''
        })
      });
      if (res.ok) {
        setShowFolderModal(false);
        setNewFolderName('');
        loadDirectory(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create folder');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create folder');
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${newFileName}` : `${currentPath}/${newFileName}`;
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: targetPath,
          content: ''
        })
      });
      if (res.ok) {
        setShowFileModal(false);
        setNewFileName('');
        loadDirectory(currentPath);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create file');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create file');
    }
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const relativePath = file.webkitRelativePath || file.name;
        const targetPath = currentPath.endsWith('/') 
          ? `${currentPath}${relativePath}` 
          : `${currentPath}/${relativePath}`;

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const resString = reader.result as string;
            resolve(resString.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const uploadRes = await fetch(`/api/v1/instances/${instanceId}/files/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: targetPath,
            base64Content: base64
          })
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json();
          throw new Error(errData.error || `Failed to upload ${file.name}`);
        }
      }
      loadDirectory(currentPath);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const visibleItems = items
    .filter(i => showHidden || !i.name.startsWith('.'))
    .filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Hidden Upload Inputs */}
      <input 
        type="file" 
        id="file-upload-input" 
        multiple 
        className="hidden" 
        onChange={handleUploadFiles} 
      />
      <input 
        type="file" 
        id="folder-upload-input" 
        className="hidden" 
        onChange={handleUploadFiles}
        {...{ webkitdirectory: "", directory: "", multiple: true }} 
      />

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white/5 border border-neutral-200/10 dark:border-white/5 rounded-2xl text-xs">
        <div className="flex items-center gap-3">
          {/* Breadcrumb path */}
          <div className="flex items-center gap-1 text-neutral-400 font-mono border border-neutral-200/10 dark:border-white/5 px-2 py-1 rounded-xl bg-neutral-900/20 shrink-0">
            <button onClick={() => setCurrentPath('/')} className="hover:text-white font-semibold">/</button>
            {currentPath.split('/').filter(Boolean).map((part, index) => (
              <React.Fragment key={part}>
                <ChevronRight size={10} className="text-neutral-600" />
                <button onClick={() => handleBreadcrumbClick(index)} className="hover:text-white truncate max-w-[100px]">{part}</button>
              </React.Fragment>
            ))}
          </div>

          {/* Editable Path Input */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (pathInput.trim()) {
                setCurrentPath(pathInput.trim());
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input 
              type="text" 
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              className="al-input py-1 px-3 w-48 font-mono text-[11px] bg-neutral-900/40"
              placeholder="Go to path..."
            />
            <button type="submit" className="al-btn al-btn-secondary py-1 px-2 text-[10px] uppercase font-bold tracking-wider">Go</button>
          </form>
        </div>

        {/* Tools and triggers */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-neutral-500" size={12} />
            <input 
              type="text" placeholder="Search folder..." className="al-input pl-8 py-1.5 text-[11px] w-40 bg-neutral-900/40"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Hidden toggle */}
          <button 
            type="button" onClick={() => setShowHidden(!showHidden)}
            className="p-2 border border-neutral-200/10 dark:border-white/5 rounded-xl text-neutral-450 hover:text-white"
          >
            {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>

          {/* List vs Grid Layouts toggle */}
          <div className="flex border border-neutral-200/10 dark:border-white/5 rounded-xl p-0.5">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
            >
              <List size={13} />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
            >
              <LayoutGrid size={13} />
            </button>
          </div>

          <button 
            onClick={() => document.getElementById('file-upload-input')?.click()} 
            disabled={uploading}
            className="al-btn al-btn-secondary py-1.5 text-[11px] flex items-center gap-1.5"
          >
            <Upload size={12} /> {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
          
          <button 
            onClick={() => document.getElementById('folder-upload-input')?.click()} 
            disabled={uploading}
            className="al-btn al-btn-secondary py-1.5 text-[11px] flex items-center gap-1.5"
          >
            <FolderPlus size={12} /> {uploading ? 'Uploading...' : 'Upload Folder'}
          </button>

          <button onClick={() => setShowFileModal(true)} className="al-btn al-btn-secondary py-1.5 text-[11px]">
            + File
          </button>
          
          <button onClick={() => setShowFolderModal(true)} className="al-btn al-btn-secondary py-1.5 text-[11px]">
            + Folder
          </button>
        </div>
      </div>

      {/* Main directories and grid view options */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Side Tree Navigation */}
        <div className="bg-white/5 border border-neutral-200/10 dark:border-white/5 rounded-2xl p-4 text-xs space-y-2 h-fit">
          <p className="font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Folder Directory Tree</p>
          <div className="space-y-1 font-medium">
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5 text-white">
              <Folder size={13} className="text-blue-500" />
              <span>/</span>
            </div>
            {items.filter(i => i.isDirectory).map(item => (
              <div 
                key={item.name} 
                onClick={() => handleFolderClick(item)}
                className="flex items-center gap-2 p-1.5 rounded-lg text-neutral-450 hover:bg-white/5 hover:text-white cursor-pointer pl-6 transition"
              >
                <Folder size={12} className="text-neutral-500" />
                <span className="truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side Files Viewport */}
        <div className="md:col-span-3">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-xs font-semibold mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-12 text-center text-neutral-500 text-xs">Reading directories...</div>
          ) : viewMode === 'list' ? (
            <div className="al-card overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-white/5 border-b border-neutral-200/10 dark:border-white/5 text-neutral-400">
                  <tr>
                    <th className="p-3 font-semibold">Name</th>
                    <th className="p-3 font-semibold">Size</th>
                    <th className="p-3 font-semibold">Permissions</th>
                    <th className="p-3 font-semibold text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/10 dark:divide-white/5 text-neutral-300">
                  {visibleItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-neutral-500">Folder is empty</td>
                    </tr>
                  )}
                  {visibleItems.map(item => (
                    <tr key={item.name} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 flex items-center gap-2 max-w-sm truncate">
                        {item.isDirectory ? (
                          <Folder className="text-blue-500 shrink-0" size={15} />
                        ) : (
                          <File className="text-neutral-450 shrink-0" size={15} />
                        )}
                        {item.isDirectory ? (
                          <button onClick={() => handleFolderClick(item)} className="hover:text-blue-500 text-left font-medium truncate">{item.name}</button>
                        ) : (
                          <button onClick={() => handleOpenFile(item)} className="hover:text-blue-500 text-left font-medium truncate">{item.name}</button>
                        )}
                      </td>
                      <td className="p-3 text-neutral-450">
                        {item.isDirectory ? '-' : `${(item.size / 1024).toFixed(1)} KB`}
                      </td>
                      <td className="p-3 font-mono text-neutral-500">
                        {item.permissions}
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleDelete(item)} className="text-rose-500 hover:text-rose-600 transition p-1 rounded-lg hover:bg-rose-500/10">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid layout options */
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {visibleItems.length === 0 && (
                <div className="col-span-full al-card p-12 text-center text-neutral-500">Folder is empty</div>
              )}
              {visibleItems.map(item => (
                <div 
                  key={item.name}
                  onClick={() => item.isDirectory ? handleFolderClick(item) : handleOpenFile(item)}
                  className="bg-white/5 border border-neutral-200/10 dark:border-white/5 rounded-2xl p-4 text-center hover:bg-white/10 transition cursor-pointer relative group"
                >
                  {item.isDirectory ? (
                    <Folder className="mx-auto text-blue-500 mb-2" size={28} />
                  ) : (
                    <File className="mx-auto text-neutral-450 mb-2" size={28} />
                  )}
                  <p className="text-xs text-white font-medium truncate px-2">{item.name}</p>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    {item.isDirectory ? 'Folder' : `${(item.size / 1024).toFixed(0)} KB`}
                  </p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                    className="absolute top-2 right-2 text-rose-500 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition p-1 hover:bg-rose-500/10 rounded-lg"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monaco Code Editor Dialog Popup */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl al-card flex flex-col h-[85vh] overflow-hidden bg-[#121212]">
            <div className="p-4 border-b border-neutral-200/10 dark:border-white/5 bg-white/5 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-300 truncate max-w-xl">{editingFile.path}</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveFile} 
                  disabled={editorLoading}
                  className="p-2 border border-neutral-200/10 dark:border-white/5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition"
                >
                  <Save size={14} />
                </button>
                <button 
                  onClick={() => setEditingFile(null)} 
                  className="p-2 border border-neutral-200/10 dark:border-white/5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={editingFile.content}
                onChange={(value) => setEditingFile({ ...editingFile, content: value || '' })}
              />
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolder} className="bg-[#1a1a1a] border border-neutral-200/10 dark:border-white/5 rounded-2xl p-6 max-w-sm w-full space-y-4 text-xs text-left">
            <h3 className="text-sm font-semibold text-white">Create New Folder</h3>
            <input 
              type="text" placeholder="Folder Name" className="w-full al-input" 
              value={newFolderName} onChange={e => setNewFolderName(e.target.value)} required 
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowFolderModal(false)} className="px-4 py-2 border border-neutral-200/10 dark:border-white/5 text-neutral-350 rounded-xl hover:bg-neutral-800 transition">Cancel</button>
              <button type="submit" className="px-4 py-2 al-btn-primary rounded-xl font-semibold">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* New File Modal */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFile} className="bg-[#1a1a1a] border border-neutral-200/10 dark:border-white/5 rounded-2xl p-6 max-w-sm w-full space-y-4 text-xs text-left">
            <h3 className="text-sm font-semibold text-white">Create New File</h3>
            <input 
              type="text" placeholder="Filename" className="w-full al-input" 
              value={newFileName} onChange={e => setNewFileName(e.target.value)} required 
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowFileModal(false)} className="px-4 py-2 border border-neutral-200/10 dark:border-white/5 text-neutral-350 rounded-xl hover:bg-neutral-800 transition">Cancel</button>
              <button type="submit" className="px-4 py-2 al-btn-primary rounded-xl font-semibold">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default FileManager;
