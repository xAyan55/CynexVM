import React, { useState, useEffect } from 'react';
import { DataTable } from '../components/DataTable';
import { Wizard } from '../components/Wizard';
import { Plus, Play, Square, RotateCw, Pause, Trash2 } from 'lucide-react';

interface Instance {
  id: string;
  name: string;
  vmid: number;
  status: string;
  node: { name: string };
  cpuCores: number;
  memoryMb: number;
  storageGb: number;
  osTemplate: string;
  hostname: string;
}

export const AdminInstances: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
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

  const handlePowerAction = async (instanceId: string, action: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instanceId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchInstances();
      }
    } catch (_) {}
  };

  const handleDeleteInstance = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete VPS "${name}"? All virtual disk data will be destroyed.`)) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchInstances();
      }
    } catch (_) {}
  };

  const columns = [
    { header: 'ID', accessor: 'vmid' as const, sortable: true },
    { header: 'Name', accessor: 'name' as const, sortable: true },
    {
      header: 'Status',
      accessor: (row: Instance) => (
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
          row.status === 'running' 
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' 
            : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
        }`}>{row.status}</span>
      )
    },
    { header: 'Node', accessor: (row: Instance) => row.node?.name || 'unknown', sortable: false },
    { header: 'Cores', accessor: 'cpuCores' as const, sortable: true },
    { header: 'Memory', accessor: (row: Instance) => `${row.memoryMb} MB`, sortable: true },
    {
      header: 'Actions',
      accessor: (row: Instance) => (
        <div className="flex gap-1 items-center">
          <button 
            onClick={() => handlePowerAction(row.id, 'start')}
            className="p-1 hover:bg-white/5 rounded text-neutral-400 hover:text-white"
            title="Start"
          >
            <Play size={12} />
          </button>
          <button 
            onClick={() => handlePowerAction(row.id, 'stop')}
            className="p-1 hover:bg-white/5 rounded text-neutral-400 hover:text-white"
            title="Stop"
          >
            <Square size={12} />
          </button>
          <button 
            onClick={() => handlePowerAction(row.id, 'reboot')}
            className="p-1 hover:bg-white/5 rounded text-neutral-400 hover:text-white"
            title="Reboot"
          >
            <RotateCw size={12} />
          </button>
          <button 
            onClick={() => handlePowerAction(row.id, 'stop')} // Suspend alias
            className="p-1 hover:bg-white/5 rounded text-neutral-400 hover:text-white"
            title="Suspend"
          >
            <Pause size={12} />
          </button>
          <button 
            onClick={() => handleDeleteInstance(row.id, row.name)}
            className="p-1 hover:bg-rose-500/10 rounded text-rose-500 hover:text-rose-450 ml-2"
            title="Destroy"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header Container */}
      <div className="sm:flex sm:items-center px-8 pt-4 justify-between">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Global Instances</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Manage resource allocations and deploy parameters globally.</p>
        </div>
        <button 
          onClick={() => setShowDeployWizard(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow transition"
        >
          <Plus size={14} /> Deploy VPS
        </button>
      </div>

      <div className="mx-8 p-6 bg-white dark:bg-white/5 rounded-xl border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Querying container distributions...</div>
        ) : (
          <DataTable 
            data={instances} 
            columns={columns} 
            searchField="name" 
            searchPlaceholder="Search instances..." 
            bulkActions={[
              { label: 'Stop Selected', action: (items) => items.forEach(i => handlePowerAction(i.id, 'stop')) },
              { 
                label: 'Destroy Selected', 
                action: (items) => {
                  if (confirm(`Are you sure you want to permanently delete these ${items.length} instances?`)) {
                    items.forEach(i => handleDeleteInstance(i.id, i.name));
                  }
                }
              }
            ]}
          />
        )}
      </div>

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
export default AdminInstances;
