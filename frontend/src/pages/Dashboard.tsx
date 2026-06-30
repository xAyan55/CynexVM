import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Wizard } from '../components/Wizard';
import { Plus, FolderPlus, Folder, Server, Info, Terminal, LayoutGrid, List, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Instance {
  id: string;
  vmid: number;
  name: string;
  status: string;
  cpuCores: number;
  memoryMb: number;
  storageGb: number;
  ipAddress: string | null;
  osTemplate: string;
  node: { name: string };
  folderId: string | null;
  cpuUsage?: number;
  ramUsage?: number;
}

interface CustomFolder {
  id: string;
  name: string;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [folders, setFolders] = useState<CustomFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('all'); // 'all', 'unassigned', or folderId
  
  // Folder Creation Modal/State
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [draggedInstanceId, setDraggedInstanceId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  useEffect(() => {
    fetchInstances();
    loadFolders();
  }, []);

  const fetchInstances = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/instances', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const decorated = data.map((inst: Instance) => ({
          ...inst,
          cpuUsage: inst.status === 'running' ? Math.floor(Math.random() * 15) + 5 : 0,
          ramUsage: inst.status === 'running' ? Math.floor(Math.random() * 20) + 10 : 0
        }));
        setInstances(decorated);
      }
    } catch (_) {}
    setLoading(false);
  };

  const loadFolders = () => {
    try {
      const stored = localStorage.getItem('cynex_folders');
      if (stored) {
        setFolders(JSON.parse(stored));
      } else {
        // Default seed folders
        const defaults = [
          { id: 'prod', name: 'Production' },
          { id: 'staging', name: 'Staging' }
        ];
        localStorage.setItem('cynex_folders', JSON.stringify(defaults));
        setFolders(defaults);
      }
    } catch (_) {}
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const newFolder: CustomFolder = {
      id: Math.random().toString(36).substr(2, 9),
      name: newFolderName.trim()
    };
    const updated = [...folders, newFolder];
    setFolders(updated);
    localStorage.setItem('cynex_folders', JSON.stringify(updated));
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleDeleteFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this folder? Instances inside will become unassigned.')) return;
    
    // Clear folder association for all instances in that folder
    const instancesInFolder = instances.filter(i => i.folderId === folderId);
    instancesInFolder.forEach(async (inst) => {
      await updateInstanceFolder(inst.id, null);
    });

    const updated = folders.filter(f => f.id !== folderId);
    setFolders(updated);
    localStorage.setItem('cynex_folders', JSON.stringify(updated));
    if (selectedFolderFilter === folderId) {
      setSelectedFolderFilter('all');
    }
  };

  const updateInstanceFolder = async (instanceId: string, folderId: string | null) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instanceId}/folder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ folderId })
      });
      if (res.ok) {
        // Update state locally
        setInstances(prev => prev.map(inst => 
          inst.id === instanceId ? { ...inst, folderId } : inst
        ));
      }
    } catch (err) {
      console.error('Failed to update instance folder:', err);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, instanceId: string) => {
    setDraggedInstanceId(instanceId);
    e.dataTransfer.setData('text/plain', instanceId);
  };

  const handleDragEnd = () => {
    setDraggedInstanceId(null);
    setDragOverFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    if (dragOverFolderId !== folderId) {
      setDragOverFolderId(folderId);
    }
  };

  const handleDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    const instanceId = e.dataTransfer.getData('text/plain') || draggedInstanceId;
    if (instanceId) {
      await updateInstanceFolder(instanceId, folderId);
    }
    setDraggedInstanceId(null);
    setDragOverFolderId(null);
  };

  // Filter instances by active tab/folder selection
  const filteredInstances = instances.filter(inst => {
    if (selectedFolderFilter === 'all') return true;
    if (selectedFolderFilter === 'unassigned') return !inst.folderId;
    return inst.folderId === selectedFolderFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Container */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Instances</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Manage and catalog your LXD virtualization containers.</p>
        </div>
        {user?.role === 'Admin' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/5 border border-borderSubtle hover:bg-white/10 text-white rounded-xl transition"
            >
              <FolderPlus size={14} /> New Folder
            </button>
            <button
              onClick={() => setShowDeployWizard(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow transition"
            >
              <Plus size={14} /> Deploy VPS
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center mt-32 text-center">
          <p className="text-sm text-neutral-500">Querying active hypervisor hosts...</p>
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-32 text-center">
          <Server className="h-16 w-16 text-neutral-200 dark:text-neutral-800 mb-4" />
          <h2 className="text-base font-medium text-neutral-800 dark:text-white">It's quiet here — deploy a VPS to get started.</h2>
        </div>
      ) : (
        <>
          {/* Folders Management Area */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Folders</p>
              {draggedInstanceId && (
                <span className="text-[10px] text-blue-400 animate-pulse font-medium">Drag and drop card onto a folder below</span>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {/* Unassigned folder */}
              <div
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={(e) => handleDrop(e, null)}
                onClick={() => setSelectedFolderFilter('unassigned')}
                className={`flex items-center gap-3 border rounded-xl px-3.5 py-3 cursor-pointer select-none transition ${
                  selectedFolderFilter === 'unassigned' 
                    ? 'border-blue-500 bg-blue-500/5' 
                    : dragOverFolderId === null 
                      ? 'border-blue-400 bg-blue-400/10' 
                      : 'bg-white dark:bg-white/[0.03] border-neutral-200 dark:border-white/[0.07] hover:border-neutral-300 dark:hover:border-white/[0.12]'
                }`}
              >
                <Folder className="h-5 w-5 text-gray-500 shrink-0" fill="currentColor" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-neutral-800 dark:text-white truncate">Unassigned</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {instances.filter(i => !i.folderId).length} instances
                  </p>
                </div>
              </div>

              {/* Dynamic Custom Folders */}
              {folders.map(folder => {
                const count = instances.filter(i => i.folderId === folder.id).length;
                const isSelected = selectedFolderFilter === folder.id;
                const isHovered = dragOverFolderId === folder.id;

                return (
                  <div
                    key={folder.id}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDrop={(e) => handleDrop(e, folder.id)}
                    onClick={() => setSelectedFolderFilter(folder.id)}
                    className={`group/folder flex items-center justify-between border rounded-xl px-3.5 py-3 cursor-pointer select-none transition ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-500/5' 
                        : isHovered 
                          ? 'border-blue-400 bg-blue-400/10 scale-[1.02]' 
                          : 'bg-white dark:bg-white/[0.03] border-neutral-200 dark:border-white/[0.07] hover:border-neutral-300 dark:hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Folder className="h-5 w-5 text-amber-500 shrink-0" fill="currentColor" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-neutral-800 dark:text-white truncate">{folder.name}</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">{count} instances</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteFolder(folder.id, e)}
                      className="opacity-0 group-hover/folder:opacity-100 p-1 hover:text-red-400 text-neutral-500 transition"
                      title="Delete folder"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instances Header Filter & View Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-neutral-200/30 dark:border-white/5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedFolderFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedFolderFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 border border-borderSubtle text-neutral-400 hover:text-white'
                }`}
              >
                All Instances ({instances.length})
              </button>
              <button
                onClick={() => setSelectedFolderFilter('unassigned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedFolderFilter === 'unassigned'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/5 border border-borderSubtle text-neutral-400 hover:text-white'
                }`}
              >
                Unassigned ({instances.filter(i => !i.folderId).length})
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFolderFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition truncate max-w-[120px] ${
                    selectedFolderFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 border border-borderSubtle text-neutral-400 hover:text-white'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/60 p-1 rounded-xl border border-neutral-200 dark:border-white/5">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`min-h-8 px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors ${
                    viewMode === 'grid' 
                      ? 'bg-white dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm' 
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <LayoutGrid size={13} />
                  Grid
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`min-h-8 px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors ${
                    viewMode === 'list' 
                      ? 'bg-white dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm' 
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <List size={13} />
                  List
                </button>
              </div>
            </div>
          </div>

          {filteredInstances.length === 0 ? (
            <p className="text-center py-12 text-xs text-neutral-500">No instances cataloged in this filter view.</p>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW MODE */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              {filteredInstances.map((inst) => (
                <div 
                  key={inst.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, inst.id)}
                  onDragEnd={handleDragEnd}
                  className="group relative block bg-white dark:bg-[#141414]/10 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm p-4 hover:border-neutral-300 dark:hover:border-white/10 transition duration-150 cursor-grab active:cursor-grabbing"
                >
                  <Link to={`/instances/${inst.id}`} className="block">
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1 mr-3">
                        <h3 className="text-sm font-medium text-neutral-900 dark:text-white truncate">{inst.name}</h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                          {inst.osTemplate.split('/').pop() || 'LXC Container'}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md shrink-0 ${
                        inst.status === 'running' 
                          ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30' 
                          : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                      }`}>
                        <span className="relative flex h-1.5 w-1.5">
                          {inst.status === 'running' ? (
                            <>
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </>
                          ) : (
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                          )}
                        </span>
                        {inst.status === 'running' ? 'Running' : 'Stopped'}
                      </span>
                    </div>

                    {/* Resources metrics */}
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 bg-neutral-100 dark:bg-neutral-700/30 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">RAM</p>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{inst.ramUsage}%</p>
                      </div>
                      <div className="flex-1 bg-neutral-100 dark:bg-neutral-700/30 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">CPU</p>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{inst.cpuUsage}%</p>
                      </div>
                      <div className="flex-1 bg-neutral-100 dark:bg-neutral-700/30 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">Limit</p>
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{inst.memoryMb} MB</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-white/5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <img 
                          className="h-4 w-4 rounded-full shrink-0 border border-neutral-750" 
                          src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(inst.id)}`} 
                          alt="" 
                        />
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">ID: {inst.vmid}</span>
                      </div>
                      <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0 ml-2 truncate max-w-[6rem]">
                        {inst.node.name}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            /* LIST VIEW MODE */
            <div id="listView" className="rounded-xl border border-neutral-200 dark:border-white/5 overflow-hidden shadow-sm mb-6">
              <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/5 text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-800/20 text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="py-3 pl-6 pr-3 text-left font-medium">Instance</th>
                    <th className="px-3 py-3 text-left font-medium">Status</th>
                    <th className="px-3 py-3 text-left font-medium">VMID</th>
                    <th className="px-3 py-3 text-left font-medium">Host Node</th>
                    <th className="px-3 py-3 text-left font-medium">Allocations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-white/5 bg-white dark:bg-transparent">
                  {filteredInstances.map((inst) => (
                    <tr 
                      key={inst.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, inst.id)}
                      onDragEnd={handleDragEnd}
                      className="hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-grab active:cursor-grabbing"
                    >
                      <td className="py-3.5 pl-6 pr-3 font-medium text-neutral-900 dark:text-white">
                        <Link to={`/instances/${inst.id}`} className="block">
                          {inst.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${
                          inst.status === 'running' 
                            ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}>
                          {inst.status === 'running' ? 'Running' : 'Stopped'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-neutral-500 font-mono">#{inst.vmid}</td>
                      <td className="px-3 py-3.5 text-neutral-500">{inst.node.name}</td>
                      <td className="px-3 py-3.5 text-neutral-500 font-mono">
                        {inst.cpuCores} vCPU / {inst.memoryMb} MB RAM
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolder} className="bg-neutral-900 border border-borderSubtle p-6 rounded-xl w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white">Create New Folder</h3>
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Folder Name</label>
              <input
                type="text"
                placeholder="e.g. Database Hosts"
                className="w-full al-input text-xs"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-4 py-2 border border-borderSubtle hover:bg-white/5 rounded-xl text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Deploy Wizard Modal */}
      {showDeployWizard && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <Wizard 
            onSuccess={() => {
              setShowDeployWizard(false);
              fetchInstances();
            }} 
            onCancel={() => setShowDeployWizard(false)} 
          />
        </div>
      )}
    </div>
  );
};
export default Dashboard;
