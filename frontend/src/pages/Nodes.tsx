import React, { useState, useEffect } from 'react';
import { Server, Trash2, Cpu, HardDrive, Clipboard, Check } from 'lucide-react';

interface Node {
  id: string;
  name: string;
  hostname: string;
  apiUrl: string; // Used as Location
  clusterName: string; // Used as Description
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
  const [configPayload, setConfigPayload] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
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
        setNodes(data);
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
          name, 
          hostname, 
          location, 
          description,
          cpuCores, 
          memoryMb, 
          storageGb
        })
      });

      if (res.ok) {
        const result = await res.json();
        setConfigPayload(result.configJson);
        setShowCreateModal(false);
        // Clear fields
        setName(''); setHostname(''); setLocation(''); setDescription('');
        fetchNodes();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to register node');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (nodeId === 'default-lxd-node') {
      alert('The pre-installed local node cannot be deleted.');
      return;
    }
    if (!confirm('Are you sure you want to delete this host node?')) return;
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

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(JSON.stringify(configPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
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

      {/* Nodes list table */}
      <div className="mx-8 p-6 bg-white dark:bg-white/5 rounded-xl border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Querying nodes...</div>
        ) : nodes.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">No nodes registered. Click Create New Node to connect one.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="p-3">Friendly Name</th>
                <th className="p-3">Tunnel Hostname / Endpoint</th>
                <th className="p-3">Location</th>
                <th className="p-3">Description</th>
                <th className="p-3">Specs</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
              {nodes.map(n => (
                <tr key={n.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                    <Server size={14} className="text-neutral-400" />
                    {n.name}
                  </td>
                  <td className="p-3 font-mono text-xs">{n.hostname}</td>
                  <td className="p-3 text-neutral-500">{n.apiUrl || 'Local'}</td>
                  <td className="p-3 text-neutral-500 truncate max-w-[150px]">{n.clusterName || 'Local LXD Daemon'}</td>
                  <td className="p-3 text-neutral-400">
                    <div className="flex gap-2">
                      <span className="flex items-center gap-0.5"><Cpu size={11} /> {n.cpuCores} vCPUs</span>
                      <span className="flex items-center gap-0.5"><HardDrive size={11} /> {n.storageGb} GB</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      n.status === 'online' || n.id === 'default-lxd-node'
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' 
                        : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                    }`}>
                      {n.id === 'default-lxd-node' ? 'online' : n.status || 'offline'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {n.id !== 'default-lxd-node' && (
                      <button 
                        onClick={() => handleDeleteNode(n.id)}
                        className="text-red-500 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
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
                  type="text" placeholder="lxd-node-1" className="w-full al-input" 
                  value={name} onChange={e => setName(e.target.value)} required 
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">IP/Hostname (CF Tunnel)</label>
                <input 
                  type="text" placeholder="https://node1.example.com" className="w-full al-input" 
                  value={hostname} onChange={e => setHostname(e.target.value)} required 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-400 mb-1">Location</label>
                <input 
                  type="text" placeholder="e.g. New York" className="w-full al-input" 
                  value={location} onChange={e => setLocation(e.target.value)} required 
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Description</label>
                <input 
                  type="text" placeholder="e.g. Primary cluster node" className="w-full al-input" 
                  value={description} onChange={e => setDescription(e.target.value)} required 
                />
              </div>
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

      {/* Generated config.json Payload Modal */}
      {configPayload && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-neutral-800 rounded-2xl p-6 max-w-lg w-full space-y-4 text-xs text-left">
            <h3 className="text-sm font-semibold text-white">Daemon Config Generated</h3>
            <p className="text-neutral-400 leading-relaxed">
              Create a file named <code className="text-white bg-white/10 px-1 py-0.5 rounded">/var/www/config.json</code> on your remote node and paste the JSON configuration payload below:
            </p>
            
            <div className="relative">
              <pre className="p-4 bg-neutral-900 rounded-xl border border-neutral-800 font-mono text-neutral-300 overflow-x-auto text-[11px]">
                {JSON.stringify(configPayload, null, 2)}
              </pre>
              <button 
                onClick={handleCopyConfig}
                className="absolute top-2.5 right-2.5 p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-neutral-700 transition"
                title="Copy to clipboard"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Clipboard size={14} />}
              </button>
            </div>

            <div className="text-[11px] text-neutral-500 leading-relaxed">
              Then run the node daemon installer script <code className="text-neutral-400 font-mono">cynexd.sh</code> on your node machine and execute <code className="text-neutral-400 font-mono">systemctl start cynexd</code> to bring the node online.
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setConfigPayload(null)}
                className="px-4 py-2 bg-white hover:bg-neutral-200 text-neutral-900 rounded-xl font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Nodes;
