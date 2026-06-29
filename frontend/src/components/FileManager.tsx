import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Folder, File, ChevronRight, FolderPlus, FilePlus, 
  Trash2, Shield, ArrowUp, ArrowDown, X, Save 
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
  
  // Connection details
  const [creds, setCreds] = useState({ host: '', username: 'root', password: '' });
  const [connected, setConnected] = useState(false);

  // Editor Modal
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);

  // Modal prompts
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showFileModal, setShowFileModal] = useState(false);
  
  // Permissions Modal
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
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to list directory contents');
      }
    } catch (err: any) {
      setError(err.message);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    setConnected(true);
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
        alert('Failed to read file contents');
      }
    } catch (_) {
      alert('Read operation failed');
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
      } else {
        alert('Save operation failed');
      }
    } catch (_) {
      alert('Save operation failed');
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
      } else {
        alert('Failed to delete item');
      }
    } catch (_) {
      alert('Deletion error');
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName) return;
    // Chmod/create dir is normally a mkdir command. We write a directory by writing a placeholder file
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${newFolderName}/.keep` : `${currentPath}/${newFolderName}/.keep`;
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/write`, {
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
      if (res.ok) {
        setShowFolderModal(false);
        setNewFolderName('');
        loadDirectory(currentPath);
      }
    } catch (_) {}
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
          host: creds.host,
          username: creds.username,
          password: creds.password,
          path: targetPath,
          content: ''
        })
      });
      if (res.ok) {
        setShowFileModal(false);
        setNewFileName('');
        loadDirectory(currentPath);
      }
    } catch (_) {}
  };

  const handleChmod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chmodTarget) return;
    try {
      const res = await fetch(`/api/v1/instances/${instanceId}/files/chmod`, {
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
      if (res.ok) {
        setChmodTarget(null);
        loadDirectory(currentPath);
      }
    } catch (_) {}
  };

  return (
    <div className="space-y-4">
      {/* 1. Connection prompt */}
      {!connected && (
        <form onSubmit={handleConnect} className="glass-panel p-4 rounded-btn border border-borderSubtle space-y-4 max-w-md mx-auto">
          <h3 className="text-sm font-semibold text-white">Access SFTP File Manager</h3>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Target Host IP</label>
              <input 
                type="text" 
                placeholder="10.0.0.x" 
                className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                value={creds.host}
                onChange={e => setCreds({...creds, host: e.target.value})}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Username</label>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                  value={creds.username}
                  onChange={e => setCreds({...creds, username: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Password</label>
                <input 
                  type="password" 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                  value={creds.password}
                  onChange={e => setCreds({...creds, password: e.target.value})}
                />
              </div>
            </div>
          </div>
          <button type="submit" className="w-full glass-button-primary py-2 text-xs text-white font-semibold">
            Open File Manager
          </button>
        </form>
      )}

      {/* 2. File Explorer View */}
      {connected && (
        <div className="space-y-3">
          {/* Breadcrumb Navigation and Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white/5 border border-borderSubtle rounded-btn">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <button onClick={() => setCurrentPath('/root')} className="hover:text-white font-semibold">root</button>
              {currentPath.split('/').filter(Boolean).map((part, index) => (
                <React.Fragment key={part}>
                  <ChevronRight size={12} className="text-gray-600" />
                  <button onClick={() => handleBreadcrumbClick(index)} className="hover:text-white truncate max-w-[120px]">{part}</button>
                </React.Fragment>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowFileModal(true)} 
                className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-borderSubtle rounded-btn text-xs"
              >
                <FilePlus size={14} /> Create File
              </button>
              <button 
                onClick={() => setShowFolderModal(true)} 
                className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-borderSubtle rounded-btn text-xs"
              >
                <FolderPlus size={14} /> Create Folder
              </button>
            </div>
          </div>

          {/* Files List Table */}
          <div className="glass-panel rounded-card border border-borderSubtle overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-500 text-sm">Loading folder contents...</div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-borderSubtle text-gray-400">
                    <th className="p-3">Name</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Permissions</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderSubtle">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">Directory is empty</td>
                    </tr>
                  )}
                  {items.map((item) => (
                    <tr key={item.name} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 flex items-center gap-2 max-w-sm truncate">
                        {item.isDirectory ? (
                          <Folder className="text-blue-500 shrink-0" size={16} />
                        ) : (
                          <File className="text-gray-400 shrink-0" size={16} />
                        )}
                        {item.isDirectory ? (
                          <button onClick={() => handleFolderClick(item)} className="hover:text-blue-400 font-medium text-left truncate">{item.name}</button>
                        ) : (
                          <button onClick={() => handleOpenFile(item)} className="hover:text-blue-400 font-medium text-left truncate">{item.name}</button>
                        )}
                      </td>
                      <td className="p-3 text-gray-400">
                        {item.isDirectory ? '-' : `${(item.size / 1024).toFixed(1)} KB`}
                      </td>
                      <td className="p-3 text-gray-500 font-mono">
                        {item.permissions ? item.permissions.toString(8) : '0755'}
                      </td>
                      <td className="p-3 text-right space-x-1">
                        <button 
                          onClick={() => setChmodTarget({ path: currentPath.endsWith('/') ? `${currentPath}${item.name}` : `${currentPath}/${item.name}`, mode: (item.permissions || 0o755).toString(8) })}
                          className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white"
                          title="Chmod"
                        >
                          <Shield size={14} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item)} 
                          className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 3. Monaco Code Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl glass-panel rounded-card border border-borderSubtle flex flex-col h-[85vh]">
            <div className="p-4 border-b border-borderSubtle bg-white/5 flex items-center justify-between">
              <span className="text-xs font-mono text-gray-300 truncate max-w-xl">{editingFile.path}</span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleSaveFile} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-semibold"
                  disabled={editorLoading}
                >
                  <Save size={14} /> Save
                </button>
                <button 
                  onClick={() => setEditingFile(null)} 
                  className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#09090B] overflow-hidden">
              <Editor
                height="100%"
                theme="vs-dark"
                defaultLanguage="javascript"
                value={editingFile.content}
                onChange={(val) => setEditingFile({ ...editingFile, content: val || '' })}
                options={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 13,
                  minimap: { enabled: false },
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Folder Creation Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolder} className="glass-panel p-6 rounded-card border border-borderSubtle space-y-4 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-white">Create New Folder</h3>
            <input 
              type="text" 
              placeholder="Folder Name" 
              className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setShowFolderModal(false)} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-btn text-gray-300">Cancel</button>
              <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn font-semibold">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* 5. File Creation Modal */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFile} className="glass-panel p-6 rounded-card border border-borderSubtle space-y-4 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-white">Create New File</h3>
            <input 
              type="text" 
              placeholder="Filename" 
              className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setShowFileModal(false)} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-btn text-gray-300">Cancel</button>
              <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn font-semibold">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* 6. Chmod Permissions Modal */}
      {chmodTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleChmod} className="glass-panel p-6 rounded-card border border-borderSubtle space-y-4 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-white">Modify Permissions (Chmod)</h3>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Octal Mode (e.g. 0755)</label>
              <input 
                type="text" 
                placeholder="0755" 
                className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                value={chmodTarget.mode}
                onChange={e => setChmodTarget({ ...chmodTarget, mode: e.target.value })}
                required
              />
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setChmodTarget(null)} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-btn text-gray-300">Cancel</button>
              <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn font-semibold">Apply Mode</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default FileManager;
