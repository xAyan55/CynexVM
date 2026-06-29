import React, { useState, useEffect } from 'react';
import { Server, Plus, Activity, RefreshCw, X, Globe, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Node {
  id: string;
  name: string;
  hostname: string;
  apiUrl: string;
  sslFingerprint: string | null;
  cpuCores: number;
  memoryMb: number;
  storageGb: number;
  status: string;
  latency: number;
  version: string;
}

export const Nodes: React.FC = () => {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [sslFingerprint, setSslFingerprint] = useState('');
  const [cpuCores, setCpuCores] = useState(4);
  const [memoryMb, setMemoryMb] = useState(8192);
  const [storageGb, setStorageGb] = useState(100);

  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setTestResult(null);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/nodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name, hostname, apiUrl, apiToken, sslFingerprint, cpuCores, memoryMb, storageGb
        })
      });

      if (res.ok) {
        const newNode = await res.json();
        setName('');
        setHostname('');
        setApiUrl('');
        setApiToken('');
        setSslFingerprint('');
        setShowAddModal(false);
        
        await runNodeTest(newNode.id);
        fetchNodes();
      } else {
        const err = await res.json();
        setTestResult({ success: false, message: err.error || 'Failed to save node config' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const runNodeTest = async (nodeId: string) => {
    const token = localStorage.getItem('accessToken');
    try {
      const res = await fetch(`/api/v1/nodes/${nodeId}/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Node connection test failed: ${data.message || 'Connection timeout'}`);
      } else {
        alert('Node connection verified successfully!');
        fetchNodes();
      }
    } catch (_) {}
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!confirm('Are you sure you want to delete this node configuration? Active containers linked to this node will not be destroyed on Proxmox, but will disappear from this panel.')) return;
    const token = localStorage.getItem('accessToken');
    try {
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Hypervisor Nodes</h1>
          <p className="text-xs text-gray-400">Manage your Proxmox clusters and physical servers.</p>
        </div>
        {nodes.length > 0 && user?.role === 'Admin' && (
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchNodes}
              className="p-2 text-gray-400 hover:text-white bg-white/5 border border-borderSubtle rounded-btn transition-all"
            >
              <RefreshCw size={16} />
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-bold transition-all"
            >
              <Plus size={16} /> Connect Node
            </button>
          </div>
        )}
      </div>

      {/* Onboarding Wizard (displayed if 0 nodes exist) */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 text-sm">Loading nodes list...</div>
      ) : nodes.length === 0 ? (
        <div className="max-w-2xl mx-auto al-card p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Server size={24} />
            </div>
            <h2 className="text-lg font-bold text-white tracking-wide">No Hypervisor Nodes Configured</h2>
            <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
              CynexVM is ready! Connect your first Proxmox VE host node to begin deploying and provisioning LXC Linux VPS containers.
            </p>
          </div>

          {testResult && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs">
              {testResult.message}
            </div>
          )}

          <form onSubmit={handleAddNode} className="space-y-4 border-t border-borderSubtle pt-6 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 block">Friendly Node Name</label>
                <input 
                  type="text" placeholder="e.g. Node-01" className="w-full al-input"
                  value={name} onChange={e => setName(e.target.value)} required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 block">Host address (FQDN / IP)</label>
                <input 
                  type="text" placeholder="e.g. 192.168.1.10" className="w-full al-input"
                  value={hostname} onChange={e => setHostname(e.target.value)} required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block">Proxmox API Endpoint URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-3 text-gray-500" size={14} />
                <input 
                  type="url" placeholder="https://192.168.1.10:8006/api2/json" className="w-full al-input pl-10"
                  value={apiUrl} onChange={e => setApiUrl(e.target.value)} required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block">API Token Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-3 text-gray-500" size={14} />
                <input 
                  type="password" placeholder="PVEAPIToken=root@pam!token=xxxx-xxxx" className="w-full al-input pl-10"
                  value={apiToken} onChange={e => setApiToken(e.target.value)} required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 block">SSL SHA256 Fingerprint (Optional for self-signed certificates)</label>
              <input 
                type="text" placeholder="9A:D7:E5:..." className="w-full al-input"
                value={sslFingerprint} onChange={e => setSslFingerprint(e.target.value)}
              />
            </div>

            <button 
              type="submit" 
              className="w-full al-btn al-btn-primary py-3 font-bold mt-6"
              disabled={actionLoading}
            >
              {actionLoading ? 'Connecting...' : 'Connect Proxmox Host'}
            </button>
          </form>
        </div>
      ) : (
        /* STANDARD NODES VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {nodes.map(n => (
            <div key={n.id} className="al-card p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{n.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                      n.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>{n.status}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{n.apiUrl}</p>
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => runNodeTest(n.id)}
                    className="p-1.5 hover:bg-white/5 rounded text-gray-400 hover:text-white"
                    title="Test connection"
                  >
                    <Activity size={14} />
                  </button>
                  {user?.role === 'Admin' && (
                    <button 
                      onClick={() => handleDeleteNode(n.id)}
                      className="p-1.5 hover:bg-red-500/5 rounded text-gray-400 hover:text-red-400"
                      title="Remove node"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Resource Pools */}
              <div className="grid grid-cols-3 gap-2 py-2 border-t border-borderSubtle text-[11px] text-gray-400">
                <div>
                  <span className="text-[9px] text-gray-500 uppercase block">Host Cores</span>
                  <span className="font-semibold text-white">{n.cpuCores} Cores</span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 uppercase block">RAM Pool</span>
                  <span className="font-semibold text-white">{(n.memoryMb / 1024).toFixed(0)} GB</span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 uppercase block">Storage Pool</span>
                  <span className="font-semibold text-white">{n.storageGb} GB</span>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 flex justify-between font-mono pt-1">
                <span>Version: {n.version}</span>
                <span>Latency: {n.latency}ms</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Node dialog modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg al-card overflow-hidden flex flex-col h-[75vh]">
            <div className="p-4 border-b border-borderSubtle bg-white/5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Connect Proxmox Node</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleAddNode} className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 block">Friendly Name</label>
                  <input type="text" className="w-full al-input" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 block">Host IP / FQDN</label>
                  <input type="text" className="w-full al-input" value={hostname} onChange={e => setHostname(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block">API url</label>
                <input type="url" className="w-full al-input" value={apiUrl} onChange={e => setApiUrl(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block">API Token</label>
                <input type="password" className="w-full al-input" value={apiToken} onChange={e => setApiToken(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block">SHA256 fingerprint</label>
                <input type="text" className="w-full al-input" value={sslFingerprint} onChange={e => setSslFingerprint(e.target.value)} />
              </div>
              
              <div className="grid grid-cols-3 gap-3 border-t border-borderSubtle pt-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 block">CPU Cores</label>
                  <input type="number" className="w-full al-input" value={cpuCores} onChange={e => setCpuCores(parseInt(e.target.value, 10))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 block">RAM size (MB)</label>
                  <input type="number" className="w-full al-input" value={memoryMb} onChange={e => setMemoryMb(parseInt(e.target.value, 10))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 block">Disk size (GB)</label>
                  <input type="number" className="w-full al-input" value={storageGb} onChange={e => setStorageGb(parseInt(e.target.value, 10))} />
                </div>
              </div>

              <button type="submit" className="w-full al-btn al-btn-primary py-2.5 font-bold mt-6">
                Save & Connect
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default Nodes;
