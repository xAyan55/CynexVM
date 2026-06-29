import React, { useState, useEffect } from 'react';
import { Server, Trash2, Cpu, HardDrive, AlertTriangle } from 'lucide-react';

interface Node {
  id: string;
  name: string;
  hostname: string;
  port: number;
  cpuCores: number;
  memoryMb: number;
  storageGb: number;
  status?: string;
  versionRelease?: string;
}

export const Nodes: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [port, setPort] = useState(8006);
  const [username, setUsername] = useState('root@pam');
  const [password, setPassword] = useState('');
  const [cpuCores, setCpuCores] = useState(8);
  const [memoryMb, setMemoryMb] = useState(16384);
  const [storageGb, setStorageGb] = useState(100);

  useEffect(() => {
    fetchNodes();
  }, []);

  const fetchNodes = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/nodes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Mock daemon status parameters matching nodes.ejs
        const decorated = data.map((n: Node) => ({
          ...n,
          status: 'Online',
          versionRelease: 'v1.4.0'
        }));
        setNodes(decorated);
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name, hostname, port, username, password,
          cpuCores, memoryMb, storageGb
        })
      });

      if (res.ok) {
        setShowCreateModal(false);
        // Clear fields
        setName(''); setHostname(''); setPassword('');
        fetchNodes();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to connect/register node');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!confirm('Are you sure you want to delete this hypervisor node? all configured LXC container templates on this node will be disconnected.')) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/nodes/${nodeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchNodes();
      }
    } catch (_) {}
  };

  return (
    <div className="space-y-6">
      {/* Header section matching nodes.ejs */}
      <div className="sm:flex sm:items-center px-8 pt-4 justify-between">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Host Nodes</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Configure and monitor your hypervisor clusters.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="border border-neutral-800/20 block rounded-xl bg-white hover:bg-neutral-100 text-neutral-800 px-3 py-2 text-center text-sm font-medium transition"
        >
          Create New Node
        </button>
      </div>

      {/* Stats Cards Row matching nodes.ejs */}
      <div id="stats" className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-8">
        <div className="bg-neutral-50 dark:bg-neutral-800/20 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">Total Hypervisors</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">{nodes.length}</p>
          <p className="text-xs text-neutral-400 mt-2">Active clustering node links</p>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-800/20 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
          <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">Cluster Status</h2>
          <p className="text-4xl font-normal text-neutral-800 dark:text-white">
            {nodes.filter(n => n.status === 'Online').length} / {nodes.length}
          </p>
          <p className="text-xs text-neutral-400 mt-2">Nodes online and queryable</p>
        </div>
      </div>

      {/* Node List Table matching nodes.ejs */}
      <div className="overflow-x-auto shadow-sm rounded-xl mx-8 border border-neutral-200 dark:border-neutral-800/40 bg-white dark:bg-neutral-800/20">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 text-sm">Querying clustering state...</div>
        ) : nodes.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">No hypervisor nodes registered. Click Create New Node to connect one.</div>
        ) : (
          <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/10 text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left font-medium sm:pl-6">Name</th>
                <th className="py-3.5 pl-4 pr-3 text-left font-medium sm:pl-6">Connection</th>
                <th className="py-3.5 pl-4 pr-3 text-left font-medium sm:pl-6">Resource Allocation</th>
                <th className="py-3.5 pl-4 pr-3 text-right font-medium sm:pl-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5 text-neutral-600 dark:text-neutral-400">
              {nodes.map(node => (
                <tr key={node.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 font-medium text-neutral-800 dark:text-white sm:pl-6">
                    <div className="flex items-center">
                      <span className="flex h-2 w-2 mr-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      {node.name}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    {node.hostname}:{node.port}
                    <span className="ml-2 inline-flex items-center rounded-md bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-emerald-600/20">
                      {node.versionRelease}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono">
                    {node.cpuCores} Cores / {(node.memoryMb / 1024).toFixed(0)} GB RAM
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right sm:pr-6">
                    <button 
                      onClick={() => handleDeleteNode(node.id)}
                      className="p-2 bg-red-600 hover:bg-red-500 rounded-xl transition inline-flex items-center justify-center"
                    >
                      <Trash2 size={14} className="text-white" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Node Popup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateNode} className="bg-[#1a1a1a] border border-neutral-800 rounded-2xl p-6 max-w-md w-full space-y-4 text-xs text-left">
            <h3 className="text-sm font-semibold text-white">Register Host Node</h3>
            
            {error && (
              <p className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-400 mb-1">Friendly Name</label>
                <input 
                  type="text" placeholder="pve-node-1" className="w-full al-input" 
                  value={name} onChange={e => setName(e.target.value)} required 
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">IP/Hostname</label>
                <input 
                  type="text" placeholder="10.0.0.10" className="w-full al-input" 
                  value={hostname} onChange={e => setHostname(e.target.value)} required 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-400 mb-1">Port</label>
                <input 
                  type="number" className="w-full al-input" 
                  value={port} onChange={e => setPort(parseInt(e.target.value, 10))} required 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-neutral-400 mb-1">Realm Username</label>
                <input 
                  type="text" className="w-full al-input" 
                  value={username} onChange={e => setUsername(e.target.value)} required 
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Realm Password/Token</label>
              <input 
                type="password" placeholder="••••••••" className="w-full al-input" 
                value={password} onChange={e => setPassword(e.target.value)} required 
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-400 mb-1">Total Cores</label>
                <input 
                  type="number" className="w-full al-input" 
                  value={cpuCores} onChange={e => setCpuCores(parseInt(e.target.value, 10))} required 
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Memory (MB)</label>
                <input 
                  type="number" className="w-full al-input" 
                  value={memoryMb} onChange={e => setMemoryMb(parseInt(e.target.value, 10))} required 
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Storage (GB)</label>
                <input 
                  type="number" className="w-full al-input" 
                  value={storageGb} onChange={e => setStorageGb(parseInt(e.target.value, 10))} required 
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-neutral-700 text-neutral-300 rounded-xl hover:bg-neutral-800 transition"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 al-btn-primary rounded-xl font-semibold">
                Register
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
export default Nodes;
