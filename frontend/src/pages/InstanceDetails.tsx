import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Console } from '../components/Console';
import { FileManager } from '../components/FileManager';
import { 
  Server, Cpu, HardDrive, Network, FolderOpen, 
  Settings, Key, AlertTriangle, ArrowLeft, Trash2
} from 'lucide-react';

export const InstanceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const socket = useSocket();

  const [instance, setInstance] = useState<any | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Network tab inputs
  const [firewallRules, setFirewallRules] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({ direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '', sourceIp: '0.0.0.0/0' });

  // Backups tab inputs
  const [backups, setBackups] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');

  useEffect(() => {
    fetchInstanceDetails();
  }, [id]);

  // Subscribe to live socket metrics when Overview tab is active
  useEffect(() => {
    if (!socket || !id || activeTab !== 'overview') return;

    socket.emit('metrics.subscribe', { instanceId: id });
    socket.on('metrics.data', (data) => {
      setLiveMetrics(data);
    });

    return () => {
      socket.emit('metrics.unsubscribe');
      socket.off('metrics.data');
    };
  }, [socket, id, activeTab]);

  const fetchInstanceDetails = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInstance(data);
        // Pre-fill backups/firewalls placeholders
        setBackups([
          { id: 'b1', name: 'vzdump-lxc-daily-backup', sizeBytes: 256214580, status: 'completed', type: 'scheduled', createdAt: new Date(Date.now() - 24 * 3600 * 1000) }
        ]);
        setSnapshots([
          { id: 's1', name: 'pre-upgrade-checkpoint', description: 'Snapshot prior to package upgrades', status: 'active', createdAt: new Date(Date.now() - 48 * 3600 * 1000) }
        ]);
        setFirewallRules([
          { id: 'f1', direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '80', sourceIp: '0.0.0.0/0' },
          { id: 'f2', direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '22', sourceIp: '192.168.1.0/24' }
        ]);
      } else {
        navigate('/');
      }
    } catch (_) {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handlePowerAction = async (action: string) => {
    if (!instance) return;
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instance.id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setInstance({ ...instance, status: action === 'start' ? 'running' : action === 'stop' ? 'stopped' : instance.status });
      }
    } catch (_) {}
  };

  const handleAddFirewallRule = (e: React.FormEvent) => {
    e.preventDefault();
    setFirewallRules([...firewallRules, { id: Math.random().toString(), ...newRule }]);
    setNewRule({ direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '', sourceIp: '0.0.0.0/0' });
  };

  const handleRemoveFirewallRule = (ruleId: string) => {
    setFirewallRules(firewallRules.filter(r => r.id !== ruleId));
  };

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSnapshotName) return;
    setSnapshots([...snapshots, {
      id: Math.random().toString(),
      name: newSnapshotName,
      description: 'Manual snapshot checkpoint',
      status: 'active',
      createdAt: new Date()
    }]);
    setNewSnapshotName('');
  };

  const handleDeleteInstance = async () => {
    if (!instance) return;
    if (!confirm('CRITICAL WARNING: Are you sure you want to permanently delete this LXC container? All storage disks, snapshots, and local configurations will be destroyed.')) return;
    
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instance.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        navigate('/');
      }
    } catch (_) {}
  };

  if (loading || !instance) {
    return <div className="p-12 text-center text-gray-500 text-sm">Loading instance configuration...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Upper header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 text-gray-400 hover:text-white bg-white/5 border border-borderSubtle rounded-btn"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400 font-mono">VMID: {instance.vmid}</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                instance.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                instance.status === 'stopped' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>{instance.status}</span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1.5">{instance.name}</h1>
          </div>
        </div>

        <button 
          onClick={handleDeleteInstance}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-600 text-red-400 hover:text-white rounded-btn text-xs font-semibold transition-all hover:scale-[1.02]"
        >
          <Trash2 size={14} /> Destroy VPS
        </button>
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-borderSubtle text-xs gap-4 overflow-x-auto pb-0.5">
        {[
          { id: 'overview', label: 'Overview', icon: Server },
          { id: 'console', label: 'Console Terminal', icon: Key },
          { id: 'files', label: 'File Manager', icon: FolderOpen },
          { id: 'network', label: 'Networking', icon: Network },
          { id: 'backups', label: 'Backups & Snapshots', icon: HardDrive }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 pb-3 border-b-2 font-medium transition-all ${
              activeTab === t.id ? 'border-blue-500 text-white font-semibold' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      
      {/* 1. OVERVIEW Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Static details specs */}
          <div className="glass-panel p-5 rounded-card border border-borderSubtle space-y-4">
            <h3 className="text-sm font-semibold text-white">VPS Hardware Allocations</h3>
            <div className="divide-y divide-borderSubtle text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">Node Location</span>
                <span>{instance.node.name}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">Hostname</span>
                <span className="font-mono text-gray-400 truncate max-w-[150px]">{instance.hostname}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">IP address</span>
                <span className="font-mono text-gray-400">{instance.ipAddress || 'Not set'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">OS Template</span>
                <span className="text-gray-500 truncate max-w-[120px] font-mono">{instance.osTemplate.split('/').pop()}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">CPU allocation</span>
                <span>{instance.cpuCores} Core(s)</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">RAM Memory</span>
                <span>{instance.memoryMb} MB</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-gray-500">Disk capacity</span>
                <span>{instance.storageGb} GB</span>
              </div>
            </div>
          </div>

          {/* Real-time metrics streaming gauges */}
          <div className="glass-panel p-5 rounded-card border border-borderSubtle md:col-span-2 space-y-6">
            <h3 className="text-sm font-semibold text-white">Live Resource Diagnostics</h3>
            {liveMetrics ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                {/* CPU */}
                <div className="space-y-2">
                  <Cpu className="text-blue-500 mx-auto" size={32} />
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block font-semibold">CPU Utilization</span>
                    <span className="text-xl font-bold text-white">{(liveMetrics.cpu * 100).toFixed(1)}%</span>
                    <span className="text-[9px] text-gray-400 block">of {instance.cpuCores} cores</span>
                  </div>
                </div>

                {/* RAM */}
                <div className="space-y-2">
                  <HardDrive className="text-blue-500 mx-auto" size={32} />
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block font-semibold">RAM Usage</span>
                    <span className="text-xl font-bold text-white">{(liveMetrics.mem / (1024 * 1024)).toFixed(0)} MB</span>
                    <span className="text-[9px] text-gray-400 block">of {liveMetrics.maxmem / (1024 * 1024)} MB</span>
                  </div>
                </div>

                {/* Disk */}
                <div className="space-y-2">
                  <HardDrive className="text-blue-500 mx-auto" size={32} />
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase block font-semibold">Disk Allocation</span>
                    <span className="text-xl font-bold text-white">{(liveMetrics.disk / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                    <span className="text-[9px] text-gray-400 block">of {liveMetrics.maxdisk / (1024 * 1024 * 1024)} GB</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-xs">Waiting for live diagnostic feed...</div>
            )}
          </div>
        </div>
      )}

      {/* 2. CONSOLE Tab */}
      {activeTab === 'console' && (
        <Console 
          instanceId={instance.id} 
          status={instance.status} 
          onPowerAction={handlePowerAction}
        />
      )}

      {/* 3. FILE MANAGER Tab */}
      {activeTab === 'files' && (
        <FileManager instanceId={instance.id} />
      )}

      {/* 4. NETWORKING Tab */}
      {activeTab === 'network' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Static Network Info */}
          <div className="glass-panel p-5 rounded-card border border-borderSubtle space-y-4">
            <h3 className="text-sm font-semibold text-white">Interface Configuration</h3>
            <div className="text-xs space-y-3">
              <div>
                <span className="text-gray-500 block mb-1">Bridge Mode</span>
                <span className="font-semibold text-white">vmbr0 (dhcp client)</span>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">MAC Address</span>
                <span className="font-mono text-gray-400">00:50:56:AB:CD:EF</span>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Gateway Endpoint</span>
                <span className="font-mono text-gray-400">10.0.0.1</span>
              </div>
            </div>
          </div>

          {/* Firewall configuration */}
          <div className="glass-panel p-5 rounded-card border border-borderSubtle lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-borderSubtle pb-3">
              <h3 className="text-sm font-semibold text-white">Firewall Access Rules</h3>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-borderSubtle text-gray-400">
                  <th className="p-2">Direction</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Protocol</th>
                  <th className="p-2">Port Range</th>
                  <th className="p-2">Source CIDR</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle">
                {firewallRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-white/5">
                    <td className="p-2 capitalize font-mono">{rule.direction}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        rule.action === 'ACCEPT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>{rule.action}</span>
                    </td>
                    <td className="p-2 font-mono uppercase">{rule.protocol}</td>
                    <td className="p-2 font-mono">{rule.port || 'ALL'}</td>
                    <td className="p-2 font-mono text-gray-500">{rule.sourceIp}</td>
                    <td className="p-2 text-right">
                      <button 
                        onClick={() => handleRemoveFirewallRule(rule.id)}
                        className="p-1 text-gray-450 hover:text-red-400"
                        title="Delete rule"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Firewall addition form */}
            <form onSubmit={handleAddFirewallRule} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end border-t border-borderSubtle pt-4 text-xs">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Direction</label>
                <select 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-2 py-1.5 text-white"
                  value={newRule.direction}
                  onChange={e => setNewRule({...newRule, direction: e.target.value})}
                >
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Action</label>
                <select 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-2 py-1.5 text-white"
                  value={newRule.action}
                  onChange={e => setNewRule({...newRule, action: e.target.value})}
                >
                  <option value="ACCEPT">ACCEPT</option>
                  <option value="DROP">DROP</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Protocol</label>
                <select 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-2 py-1.5 text-white"
                  value={newRule.protocol}
                  onChange={e => setNewRule({...newRule, protocol: e.target.value})}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Port Range</label>
                <input 
                  type="text" placeholder="e.g. 80, 22:25" className="w-full bg-white/5 border border-borderSubtle rounded-btn px-2 py-1.5 text-white"
                  value={newRule.port}
                  onChange={e => setNewRule({...newRule, port: e.target.value})}
                />
              </div>
              <button type="submit" className="w-full glass-button-primary py-2 text-white font-semibold col-span-2 md:col-span-1">
                Add Rule
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. BACKUPS & SNAPSHOTS Tab */}
      {activeTab === 'backups' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Snapshots segment */}
          <div className="glass-panel p-5 rounded-card border border-borderSubtle space-y-6">
            <h3 className="text-sm font-semibold text-white">Container Snapshots</h3>
            
            <form onSubmit={handleCreateSnapshot} className="flex gap-2 items-end text-xs">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 block mb-1">Snapshot Name</label>
                <input 
                  type="text" placeholder="e.g. state-pre-configure" className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-1.5 text-white focus:outline-none focus:border-blue-600"
                  value={newSnapshotName}
                  onChange={e => setNewSnapshotName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="glass-button-primary px-4 py-2 text-white font-semibold">
                Create Snapshot
              </button>
            </form>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-borderSubtle text-gray-400">
                  <th className="p-2">Name</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle">
                {snapshots.map(snap => (
                  <tr key={snap.id} className="hover:bg-white/5">
                    <td className="p-2 font-semibold font-mono text-blue-400">{snap.name}</td>
                    <td className="p-2 text-gray-400">{snap.description}</td>
                    <td className="p-2 text-gray-500 font-mono">{new Date(snap.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Backups segment */}
          <div className="glass-panel p-5 rounded-card border border-borderSubtle space-y-6">
            <div className="flex items-center justify-between border-b border-borderSubtle pb-3">
              <h3 className="text-sm font-semibold text-white">Backups Archive</h3>
              <button 
                onClick={() => {
                  setBackups([...backups, {
                    id: Math.random().toString(),
                    name: `manual-backup-${Date.now()}`,
                    sizeBytes: 156320000,
                    status: 'completed',
                    type: 'manual',
                    createdAt: new Date()
                  }]);
                }}
                className="glass-button-primary px-3 py-1.5 text-xs text-white font-semibold"
              >
                Trigger Backup
              </button>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-borderSubtle text-gray-400">
                  <th className="p-2">Name</th>
                  <th className="p-2">Size</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle">
                {backups.map(bk => (
                  <tr key={bk.id} className="hover:bg-white/5">
                    <td className="p-2 font-mono text-gray-300 truncate max-w-[150px]">{bk.name}</td>
                    <td className="p-2 text-gray-400">{(bk.sizeBytes / (1024 * 1024)).toFixed(1)} MB</td>
                    <td className="p-2 capitalize text-gray-500">{bk.type}</td>
                    <td className="p-2 text-gray-550 font-mono">{new Date(bk.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default InstanceDetails;
