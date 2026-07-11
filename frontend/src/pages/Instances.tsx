import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Wizard } from '../components/Wizard';
import { 
  Server, Play, Square, RotateCcw, Plus, Search, 
  Terminal, Cpu, HardDrive, RefreshCw 
} from 'lucide-react';
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
}

export const Instances: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
        setInstances(data);
      }
    } catch (_) {}
    setLoading(false);
  };

  const handlePowerAction = async (id: string, action: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        // Optimistic UI updates
        setInstances(prev => prev.map(inst => {
          if (inst.id === id) {
            const nextStatus = action === 'start' ? 'running' : action === 'stop' ? 'stopped' : inst.status;
            return { ...inst, status: nextStatus };
          }
          return inst;
        }));
      }
    } catch (_) {}
  };

  const filtered = instances.filter(i => 
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.vmid.toString().includes(search) ||
    i.osTemplate.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Instances</h1>
          <p className="text-xs text-gray-400">View and manage virtual Linux container machines.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchInstances}
            className="p-2 text-gray-400 hover:text-white bg-white/5 border border-borderSubtle rounded-btn transition-all"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            onClick={() => setShowDeployWizard(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-bold transition-all"
          >
            <Plus size={16} /> Deploy VPS
          </button>
        </div>
      </div>

      {/* Filter search box */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 text-gray-500" size={14} />
        <input 
          type="text" 
          placeholder="Filter by VMID, name, or template..."
          className="w-full al-input pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Grid of Instances */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading VPS instances...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-gray-500 text-xs border border-borderSubtle rounded-card bg-white/5">
          No instances match the filter criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(inst => (
            <div 
              key={inst.id} 
              className="al-card p-5 flex flex-col justify-between space-y-4 transition-all duration-150"
            >
              {/* Header inside Card */}
              <div className="flex items-start justify-between">
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400 font-mono">{inst.vmid}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      inst.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      inst.status === 'stopped' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>{inst.status}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1.5 truncate">
                    <Link to={`/instances/${inst.id}`} className="hover:text-blue-500 hover:underline">{inst.name}</Link>
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono truncate mt-0.5">{inst.osTemplate.split('/').pop()}</p>
                </div>
                <div className="p-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-lg">
                  <Terminal size={16} />
                </div>
              </div>

              {/* Resource specs */}
              <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-borderSubtle text-[11px] text-gray-400">
                <div>
                  <span className="text-[9px] text-gray-500 uppercase block">Cores</span>
                  <span className="font-semibold text-white">{inst.cpuCores} vCPU</span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 uppercase block">RAM</span>
                  <span className="font-semibold text-white">{(inst.memoryMb / 1024).toFixed(0)} GB</span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 uppercase block">Disk</span>
                  <span className="font-semibold text-white">{inst.storageGb} GB</span>
                </div>
              </div>

              {/* Action Ribbon footer */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[10px] text-gray-500 font-mono">Node: {inst.node.name}</span>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handlePowerAction(inst.id, 'start')} 
                    className="p-1.5 hover:bg-emerald-500/10 rounded text-gray-400 hover:text-emerald-400"
                    disabled={inst.status === 'running' || ['starting', 'rebooting'].includes(inst.status)}
                  >
                    <Play size={14} />
                  </button>
                  <button 
                    onClick={() => handlePowerAction(inst.id, 'stop')} 
                    className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400"
                    disabled={inst.status === 'stopped'}
                  >
                    <Square size={14} />
                  </button>
                  <button 
                    onClick={() => handlePowerAction(inst.id, 'reboot')} 
                    className="p-1.5 hover:bg-blue-500/10 rounded text-gray-400 hover:text-blue-400"
                    disabled={inst.status !== 'running'}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deployment Wizard Modal */}
      {showDeployWizard && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
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
export default Instances;
