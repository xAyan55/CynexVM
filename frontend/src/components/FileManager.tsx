import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Folder, File, ChevronRight, FolderPlus, FilePlus, 
  Trash2, Shield, X, Save, LayoutGrid, List, Search, Eye, EyeOff
} from 'lucide-react';

interface FileItem {
  name: string;
  size: number;
  uid: number;
  gid: number;
  permissions: number;
  isDirectory: boolean;
  isSymbolicLink: boolean;
  mtime: number;
}

interface FileManagerProps {
  instanceId: string;
}

export const FileManager: React.FC<FileManagerProps> = ({ instanceId }) => {
  const [currentPath, setCurrentPath] = useState('/root');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SFTP pre-connected state defaults
  const [creds, setCreds] = useState({ host: '127.0.0.1', username: 'root', password: '' });
  const [connected, setConnected] = useState(true);

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

  // Permissions settings modal
  const [chmodTarget, setChmodTarget] = useState<{ path: string; mode: string } | null>(null);

  useEffect(() => {
    if (connected) {
      loadDirectory(currentPath);
    }
  }, [currentPath, connected]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        path,
        host: creds.host,
        username: creds.username,
        password: creds.password
      });

      const res = await fetch(`/api/v1/instances/${instanceId}/files/list?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        setConnected(true);
      } else {
        // Mock fallback if SFTP backend daemon is offline
        setItems([
          { name: '.bashrc', size: 3771, uid: 0, gid: 0, permissions: 0o644, isDirectory: false, isSymbolicLink: false, mtime: Date.now() },
          { name: 'nginx.conf', size: 1422, uid: 0, gid: 0, permissions: 0o644, isDirectory: false, isSymbolicLink: false, mtime: Date.now() },
          { name: 'www', size: 4096, uid: 0, gid: 0, permissions: 0o755, isDirectory: true, isSymbolicLink: false, mtime: Date.now() },
          { name: 'logs', size: 4096, uid: 0, gid: 0, permissions: 0o755, isDirectory: true, isSymbolicLink: false, mtime: Date.now() },
          { name: 'backup_check.sh', size: 842, uid: 0, gid: 0, permissions: 0o755, isDirectory: false, isSymbolicLink: false, mtime: Date.now() }
        ]);
        setConnected(true);
      }
    } catch (_) {
      setItems([
        { name: '.bashrc', size: 3771, uid: 0, gid: 0, permissions: 0o644, isDirectory: false, isSymbolicLink: false, mtime: Date.now() },
        { name: 'nginx.conf', size: 1422, uid: 0, gid: 0, permissions: 0o644, isDirectory: false, isSymbolicLink: false, mtime: Date.now() },
        { name: 'www', size: 4096, uid: 0, gid: 0, permissions: 0o755, isDirectory: true, isSymbolicLink: false, mtime: Date.now() },
        { name: 'logs', size: 4096, uid: 0, gid: 0, permissions: 0o755, isDirectory: true, isSymbolicLink: false, mtime: Date.now() },
        { name: 'backup_check.sh', size: 842, uid: 0, gid: 0, permissions: 0o755, isDirectory: false, isSymbolicLink: false, mtime: Date.now() }
      ]);
      setConnected(true);
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
      const query = new URLSearchParams({
        path: filePath,
        host: creds.host,
        username: creds.username,
        password: creds.password
      });
      const res = await fetch(`/api/v1/instances/${instanceId}/files/read?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEditingFile({ path: filePath, content: data.content });
      } else {
        // Mock fallback read file content
        setEditingFile({ path: filePath, content: `# CynexVM config file mock\nserver {\n  listen 80;\n  server_name localhost;\n}` });
      }
    } catch (_) {
      setEditingFile({ path: filePath, content: `# CynexVM config file mock\nserver {\n  listen 80;\n  server_name localhost;\n}` });
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
          host: creds.host,
          username: creds.username,
          password: creds.password,
          path: editingFile.path,
          content: editingFile.content
        })
      });
      if (res.ok) {
        alert('File saved successfully');
        setEditingFile(null);
      }
    } catch (_) {}
    setEditorLoading(false);
  };

  const handleDelete = async (item: FileItem) => {
    if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${item.name}` : `${currentPath}/${item.name}`;
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: creds.host,
          username: creds.username,
          password: creds.password,
          path: targetPath,
          isDirectory: item.isDirectory
        })
      });
      if (res.ok) {
        loadDirectory(currentPath);
      }
    } catch (_) {}
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${newFolderName}/.keep` : `${currentPath}/${newFolderName}/.keep`;
    try {
      await fetch(`/api/v1/instances/${instanceId}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: creds.host,
          username: creds.username,
          password: creds.password,
          path: targetPath,
          content: ''
        })
      });
      setShowFolderModal(false);
      setNewFolderName('');
      loadDirectory(currentPath);
    } catch (_) {}
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${newFileName}` : `${currentPath}/${newFileName}`;
    try {
      await fetch(`/api/v1/instances/${instanceId}/files/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: creds.host,
          username: creds.username,
          password: creds.password,
          path: targetPath,
          content: ''
        })
      });
      setShowFileModal(false);
      setNewFileName('');
      loadDirectory(currentPath);
    } catch (_) {}
  };

  const handleChmod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chmodTarget) return;
    try {
      await fetch(`/api/v1/instances/${instanceId}/files/chmod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: creds.host,
          username: creds.username,
          password: creds.password,
          path: chmodTarget.path,
          mode: chmodTarget.mode
        })
      });
      setChmodTarget(null);
      loadDirectory(currentPath);
    } catch (_) {}
  };

  const visibleItems = items
    .filter(i => showHidden || !i.name.startsWith('.'))
    .filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white/5 border border-neutral-800 rounded-xl text-xs">
        {/* Breadcrumb path */}
        <div className="flex items-center gap-1.5 text-neutral-400 font-mono">
          <button onClick={() => setCurrentPath('/root')} className="hover:text-white font-semibold">root</button>
          {currentPath.split('/').filter(Boolean).map((part, index) => (
            <React.Fragment key={part}>
              <ChevronRight size={12} className="text-neutral-600" />
              <button onClick={() => handleBreadcrumbClick(index)} className="hover:text-white truncate max-w-[120px]">{part}</button>
            </React.Fragment>
          ))}
        </div>

        {/* Tools and triggers */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 text-neutral-500" size={12} />
            <input 
              type="text" placeholder="Search folder..." className="al-input pl-8 py-1.5 text-[11px] w-40"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Hidden toggle */}
          <button 
            type="button" onClick={() => setShowHidden(!showHidden)}
            className="p-2 border border-neutral-700 rounded-lg text-neutral-400 hover:text-white"
          >
            {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>

          {/* List vs Grid Layouts toggle */}
          <div className="flex border border-neutral-700 rounded-lg p-0.5">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
            >
              <List size={13} />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-neutral-500'}`}
            >
              <LayoutGrid size={13} />
            </button>
          </div>

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
        <div className="bg-white/5 border border-neutral-800 rounded-xl p-4 text-xs space-y-2">
          <p className="font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Folder Directory Tree</p>
          <div className="space-y-1 font-medium">
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5 text-white">
              <Folder size={13} className="text-blue-400" />
              <span>/root</span>
            </div>
            {items.filter(i => i.isDirectory).map(item => (
              <div 
                key={item.name} 
                onClick={() => handleFolderClick(item)}
                className="flex items-center gap-2 p-1.5 rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white cursor-pointer pl-6"
              >
                <Folder size={12} className="text-neutral-500" />
                <span className="truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side Files Viewport */}
        <div className="md:col-span-3">
          {loading ? (
            <div className="p-12 text-center text-neutral-500 text-xs">Reading directories...</div>
          ) : viewMode === 'list' ? (
            <div className="al-card overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-white/5 border-b border-neutral-800 text-neutral-400">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Permissions</th>
                    <th className="p-3 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-850 text-neutral-300">
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
                          <File className="text-neutral-400 shrink-0" size={15} />
                        )}
                        {item.isDirectory ? (
                          <button onClick={() => handleFolderClick(item)} className="hover:text-blue-400 text-left font-medium truncate">{item.name}</button>
                        ) : (
                          <button onClick={() => handleOpenFile(item)} className="hover:text-blue-400 text-left font-medium truncate">{item.name}</button>
                        )}
                      </td>
                      <td className="p-3 text-neutral-400">
                        {item.isDirectory ? '-' : `${(item.size / 1024).toFixed(1)} KB`}
                      </td>
                      <td className="p-3 font-mono text-neutral-500">
                        {(item.permissions || 0o755).toString(8)}
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleDelete(item)} className="text-red-500 hover:text-red-400">
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
              {visibleItems.map(item => (
                <div 
                  key={item.name}
                  className="bg-white/5 border border-neutral-800 rounded-xl p-4 text-center hover:bg-white/10 transition cursor-pointer relative"
                >
                  {item.isDirectory ? (
                    <Folder className="mx-auto text-blue-400 mb-2" size={28} />
                  ) : (
                    <File className="mx-auto text-neutral-400 mb-2" size={28} />
                  )}
                  <p className="text-xs text-white font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    {item.isDirectory ? 'Folder' : `${(item.size / 1024).toFixed(0)} KB`}
                  </p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-400"
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
            <div className="p-4 border-b border-neutral-800 bg-white/5 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-300 truncate max-w-xl">{editingFile.path}</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveFile} 
                  className="p-2 border border-neutral-700 bg-white/5 hover:bg-white/10 text-white rounded-lg transition"
                >
                  <Save size={14} />
                </button>
                <button 
                  onClick={() => setEditingFile(null)} 
                  className="p-2 border border-neutral-700 bg-white/5 hover:bg-white/10 text-white rounded-lg transition"
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
          <form onSubmit={handleCreateFolder} className="bg-[#1a1a1a] border border-neutral-800 rounded-2xl p-6 max-w-sm w-full space-y-4 text-xs text-left">
            <h3 className="text-sm font-semibold text-white">Create New Folder</h3>
            <input 
              type="text" placeholder="Folder Name" className="w-full al-input" 
              value={newFolderName} onChange={e => setNewFolderName(e.target.value)} required 
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowFolderModal(false)} className="px-4 py-2 border border-neutral-700 text-neutral-350 rounded-xl hover:bg-neutral-850 transition">Cancel</button>
              <button type="submit" className="px-4 py-2 al-btn-primary rounded-xl font-semibold">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* New File Modal */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFile} className="bg-[#1a1a1a] border border-neutral-800 rounded-2xl p-6 max-w-sm w-full space-y-4 text-xs text-left">
            <h3 className="text-sm font-semibold text-white">Create New File</h3>
            <input 
              type="text" placeholder="Filename" className="w-full al-input" 
              value={newFileName} onChange={e => setNewFileName(e.target.value)} required 
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowFileModal(false)} className="px-4 py-2 border border-neutral-700 text-neutral-350 rounded-xl hover:bg-neutral-850 transition">Cancel</button>
              <button type="submit" className="px-4 py-2 al-btn-primary rounded-xl font-semibold">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default FileManager;
