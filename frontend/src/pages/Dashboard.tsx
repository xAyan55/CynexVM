import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Wizard } from '../components/Wizard';
import { Plus, FolderPlus, Folder, Server, Info, Terminal, LayoutGrid, List } from 'lucide-react';
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
  // Simulated metrics matching dashboard.ejs columns
  cpuUsage?: number;
  ramUsage?: number;
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showDeployWizard, setShowDeployWizard] = useState(false);

  useEffect(() => {
    fetchInstances();
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
        // Decorate with mock RAM/CPU metrics for the cards matching dashboard.ejs
        const decorated = data.map((inst: Instance) => ({
          ...inst,
          cpuUsage: inst.status === 'running' ? Math.floor(Math.random() * 30) + 15 : 0,
          ramUsage: inst.status === 'running' ? Math.floor(Math.random() * 45) + 20 : 0
        }));
        setInstances(decorated);
      }
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Container */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Instances</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Manage and monitor your virtualization containers.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowDeployWizard(true)}
            className="flex min-h-10 items-center gap-1.5 px-3 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition"
          >
            <Plus size={16} />
            New instance
          </button>
          
          <button className="flex min-h-10 items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 transition">
            <FolderPlus size={16} strokeWidth={1.5} />
            New folder
          </button>

          {instances.length > 0 && (
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/60 p-1 rounded-xl border border-neutral-200 dark:border-white/5">
              <button 
                onClick={() => setViewMode('grid')}
                className={`min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                  viewMode === 'grid' 
                    ? 'vt-active bg-white dark:bg-white/10 text-neutral-900 dark:text-white' 
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid size={15} />
                Grid
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`min-h-9 px-3 py-1.5 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                  viewMode === 'list' 
                    ? 'vt-active bg-white dark:bg-white/10 text-neutral-900 dark:text-white' 
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <List size={15} />
                List
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center mt-32 text-center">
          <p className="text-sm text-neutral-500">Querying active hypervisor hosts...</p>
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-32 text-center">
          <Server className="h-16 w-16 text-neutral-200 dark:text-neutral-800 mb-4" />
          <h2 className="text-base font-medium text-neutral-800 dark:text-white">It's quiet here — suspiciously quiet.</h2>
          <p className="text-sm text-neutral-500 mt-1">
            <button onClick={() => setShowDeployWizard(true)} className="text-neutral-900 dark:text-white font-medium hover:underline">
              Create your first instance
            </button>
          </p>
        </div>
      ) : (
        <>
          {/* Folders row wrapper (Simulated static folders if present) */}
          <div className="mb-8">
            <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-3">Folders</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              <div className="flex items-center gap-3 bg-white dark:bg-white/[0.03] border border-neutral-200 dark:border-white/[0.07] rounded-xl px-3.5 py-3 cursor-pointer relative transition-[background,border-color,box-shadow] select-none hover:bg-neutral-100 dark:hover:bg-white/[0.06] hover:border-neutral-300 dark:hover:border-white/[0.12]">
                <Folder className="h-5 w-5 text-amber-500 shrink-0" fill="currentColor" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-800 dark:text-white truncate">Primary LXC Nodes</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{instances.length} instances</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">Drag an instance card onto a folder to catalog it</p>
          </div>

          <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-3">Instances</p>

          {/* 1. GRID VIEW MODE */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              {instances.map((inst) => (
                <div 
                  key={inst.id}
                  className="group relative block bg-white dark:bg-[#141414]/10 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm p-4 hover:border-neutral-300 dark:hover:border-white/10 transition duration-150"
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
                          src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user?.username || 'user')}`} 
                          alt="" 
                        />
                        <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user?.username}</span>
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
            // 2. LIST VIEW MODE
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
                  {instances.map((inst) => (
                    <tr 
                      key={inst.id}
                      className="hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
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

      {/* Deploy Wizard Modal (Replaces old glowing popups) */}
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
