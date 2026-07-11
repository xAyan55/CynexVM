import React, { useState, useEffect } from 'react';
import { DataTable } from '../components/DataTable';
import { Wizard } from '../components/Wizard';
import { Plus, Play, Square, RotateCw, Pause, Trash2, Sliders, X, AlertTriangle } from 'lucide-react';

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

  // Specs editing modal states
  const [editingInstance, setEditingInstance] = useState<Instance | null>(null);
  const [editCores, setEditCores] = useState(1);
  const [editMemory, setEditMemory] = useState(512);
  const [editStorage, setEditStorage] = useState(10);
  const [savingSpecs, setSavingSpecs] = useState(false);
  const [reinstalling, setReinstalling] = useState(false);

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

  const handleUpdateSpecs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstance) return;
    setSavingSpecs(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${editingInstance.id}/specs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cpuCores: editCores,
          memoryMb: editMemory,
          storageGb: editStorage
        })
      });
      if (res.ok) {
        alert('VPS hardware specifications updated successfully');
        setEditingInstance(null);
        fetchInstances();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update specs');
      }
    } catch (_) {
      alert('Failed to update specs');
    }
    setSavingSpecs(false);
  };

  const handleReinstall = async () => {
    if (!editingInstance) return;
    if (!confirm('CRITICAL WARNING: Reinstalling will wipe the entire container disk! This action is irreversible.')) return;
    setReinstalling(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${editingInstance.id}/reinstall`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('OS reinstallation enqueued successfully.');
        setEditingInstance(null);
      } else {
        const err = await res.json();
        alert(err.error || 'Reinstall failed');
      }
    } catch (_) {
      alert('Reinstall failed');
    }
    setReinstalling(false);
  };

  const startEditSpecs = (instance: Instance) => {
    setEditingInstance(instance);
    setEditCores(instance.cpuCores);
    setEditMemory(instance.memoryMb);
    setEditStorage(instance.storageGb);
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
            : ['rebooting', 'starting'].includes(row.status)
            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
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
            onClick={() => startEditSpecs(row)}
            className="p-1 hover:bg-white/5 rounded text-neutral-400 hover:text-white"
            title="Configure Specs"
          >
            <Sliders size={12} />
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

      {/* Edit Specifications Modal Dialog */}
      {editingInstance && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-neutral-200/10 dark:border-white/5 rounded-2xl p-6 max-w-md w-full space-y-6 text-xs text-left relative">
            <button 
              onClick={() => setEditingInstance(null)}
              className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-lg text-neutral-400 hover:text-white transition"
            >
              <X size={14} />
            </button>

            <div>
              <h3 className="text-sm font-semibold text-white">Configure Hardware: {editingInstance.name}</h3>
              <p className="text-[10px] text-neutral-500 mt-0.5">Modify physical resources and template settings.</p>
            </div>

            <form onSubmit={handleUpdateSpecs} className="space-y-4">
              <div>
                <label className="text-[10px] text-neutral-400 block mb-1">Rename VPS Label</label>
                <input type="text" className="w-full al-input" value={editingInstance.name} required disabled />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>CPU Allocation Cores</span>
                  <span className="font-semibold text-white">{editCores} Cores</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="16" 
                  className="w-full accent-blue-600 bg-neutral-800" 
                  value={editCores} 
                  onChange={e => setEditCores(parseInt(e.target.value, 10))} 
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>Memory Allocation MB</span>
                  <span className="font-semibold text-white">{editMemory} MB</span>
                </div>
                <input 
                  type="range" 
                  min="256" 
                  max="16384" 
                  step="256" 
                  className="w-full accent-blue-600 bg-neutral-800" 
                  value={editMemory} 
                  onChange={e => setEditMemory(parseInt(e.target.value, 10))} 
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>Disk capacity size (GB)</span>
                  <span className="font-semibold text-white">{editStorage} GB</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="500" 
                  className="w-full accent-blue-600 bg-neutral-800" 
                  value={editStorage} 
                  onChange={e => setEditStorage(parseInt(e.target.value, 10))} 
                />
              </div>
              <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition" disabled={savingSpecs}>
                {savingSpecs ? 'Saving specifications...' : 'Update Allocations'}
              </button>
            </form>

            <div className="pt-4 border-t border-neutral-200/10 dark:border-white/5 space-y-2">
              <h4 className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                <AlertTriangle size={12} /> Danger Zone
              </h4>
              <p className="text-[10px] text-neutral-450 leading-relaxed">
                Reinstalling wipes the container filesystem root and recreates it from the original OS template. All configuration files and local data will be permanently destroyed.
              </p>
              <button 
                onClick={handleReinstall}
                disabled={reinstalling}
                className="w-full py-2 bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-500/20 rounded-xl font-semibold transition"
              >
                {reinstalling ? 'Reinstalling OS...' : 'Reinstall OS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminInstances;
