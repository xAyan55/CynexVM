import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Console } from '../components/Console';
import { FileManager } from '../components/FileManager';
import { 
  Terminal as TermIcon, Folder, Globe, ShieldCheck, Settings as SetIcon,
  ArrowLeft, Trash2, Cpu, HardDrive
} from 'lucide-react';

export const InstanceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const socket = useSocket();

  const [instance, setInstance] = useState<any | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('console');

  // Network tab inputs
  const [firewallRules, setFirewallRules] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({ direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '', sourceIp: '0.0.0.0/0' });

  // Backups tab inputs
  const [backups, setBackups] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');

  // Settings inputs
  const [settingsName, setSettingsName] = useState('');
  const [settingsMemory, setSettingsMemory] = useState(512);

  useEffect(() => {
    fetchInstanceDetails();
  }, [id]);

  // Subscribe to live socket metrics
  useEffect(() => {
    if (!socket || !id) return;

    socket.emit('metrics.subscribe', { instanceId: id });
    socket.on('metrics.data', (data) => {
      setLiveMetrics(data);
    });

    return () => {
      socket.emit('metrics.unsubscribe');
      socket.off('metrics.data');
    };
  }, [socket, id]);

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
        setSettingsName(data.name);
        setSettingsMemory(data.memoryMb);
        setBackups([
          { id: 'b1', name: 'vzdump-lxc-daily-backup', sizeBytes: 256214580, status: 'completed', createdAt: new Date(Date.now() - 24 * 3600 * 1000) }
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
    if (!confirm('CRITICAL WARNING: Are you sure you want to permanently delete this LXC container? All storage disks and snapshot data will be destroyed.')) return;
    
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
    return <div className="p-12 text-center text-neutral-500 text-sm">Loading instance configuration...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Upper Title Header */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-200/30 dark:border-white/5">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')} 
            className="p-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white bg-white/5 border border-neutral-300 dark:border-neutral-700/50 rounded-xl transition"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-neutral-700 dark:text-neutral-400 font-mono">ID: {instance.vmid}</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                instance.status === 'running' 
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' 
                  : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
              }`}>{instance.status}</span>
            </div>
            <h1 className="text-xl font-medium text-neutral-850 dark:text-white mt-1">{instance.name}</h1>
          </div>
        </div>

        <button 
          onClick={handleDeleteInstance}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl text-xs font-semibold transition"
        >
          <Trash2 size={14} /> Destroy VPS
        </button>
      </div>

      {/* Tabs Navigation Bar (matching serverTemplate.ejs) */}
      <div className="mt-6">
        <nav className="flex relative">
          <ul role="list" className="flex min-w-full mt-1.5 flex-none gap-x-2 text-sm font-normal leading-6 text-neutral-600 dark:text-neutral-400">
            {[
              { id: 'console', label: 'Console', icon: TermIcon },
              { id: 'files', label: 'Files', icon: Folder },
              { id: 'network', label: 'Networking', icon: Globe },
              { id: 'backups', label: 'Backups', icon: ShieldCheck },
              { id: 'settings', label: 'Settings', icon: SetIcon }
            ].map((t) => (
              <li key={t.id} className="transition">
                <button
                  onClick={() => setActiveTab(t.id)}
                  data-active={activeTab === t.id ? 'true' : 'false'}
                  className="nav-link2 py-2 px-3 transition border hover:bg-neutral-100 dark:hover:bg-white/5 border-transparent hover:text-neutral-900 dark:hover:text-white hover:shadow rounded-xl data-[active=true]:bg-neutral-200 data-[active=true]:border-neutral-300 dark:data-[active=true]:bg-white/10 dark:data-[active=true]:border-neutral-300/20 data-[active=true]:text-neutral-900 dark:data-[active=true]:text-white data-[active=true]:font-medium data-[active=true]:shadow-sm"
                >
                  <t.icon className="size-5 mb-0.5 inline-flex mr-1" />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Tab Panels */}
      
      {/* 1. CONSOLE TAB */}
      {activeTab === 'console' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-white/5 rounded-xl p-5 border border-neutral-300 dark:border-neutral-800/20 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">CPU Usage</p>
                <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {liveMetrics ? `${(liveMetrics.cpu * 100).toFixed(1)}%` : '0%'}
                </p>
              </div>
              <Cpu className="text-neutral-400" size={24} />
            </div>

            <div className="bg-white dark:bg-white/5 rounded-xl p-5 border border-neutral-300 dark:border-neutral-800/20 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">RAM Memory</p>
                <p className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {liveMetrics ? `${(liveMetrics.mem / (1024 * 1024)).toFixed(0)} MB` : '0 MB'}
                </p>
              </div>
              <HardDrive className="text-neutral-400" size={24} />
            </div>

            <div className="bg-white dark:bg-white/5 rounded-xl p-5 border border-neutral-300 dark:border-neutral-800/20 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-neutral-400">Target Bridge</p>
                <p className="text-lg font-semibold text-neutral-900 dark:text-white">vmbr0</p>
              </div>
              <Globe className="text-neutral-400" size={24} />
            </div>
          </div>

          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
            <Console 
              instanceId={instance.id} 
              status={instance.status} 
              onPowerAction={handlePowerAction} 
            />
          </div>
        </div>
      )}

      {/* 2. FILES TAB */}
      {activeTab === 'files' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
          <FileManager instanceId={instance.id} />
        </div>
      )}

      {/* 3. NETWORKING TAB */}
      {activeTab === 'network' && (
        <div className="space-y-6">
          {/* Bridge spec details */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
            <h2 className="text-base font-semibold mb-4 text-neutral-900 dark:text-white">Network Interfaces</h2>
            <div className="grid grid-cols-2 gap-4 text-sm text-neutral-400">
              <div>
                <span className="block text-[10px] text-neutral-500">Bridge Interface</span>
                <span className="text-neutral-800 dark:text-neutral-300 font-medium">vmbr0</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500">Address IP/CIDR</span>
                <span className="text-neutral-800 dark:text-neutral-300 font-mono font-medium">{instance.ipAddress || 'DHCP'}</span>
              </div>
            </div>
          </div>

          {/* Firewall rules */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Firewall Rules</h2>
            <form onSubmit={handleAddFirewallRule} className="grid grid-cols-5 gap-3">
              <select 
                className="al-input text-xs" 
                value={newRule.direction} 
                onChange={e => setNewRule({...newRule, direction: e.target.value})}
              >
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
              <select 
                className="al-input text-xs" 
                value={newRule.action} 
                onChange={e => setNewRule({...newRule, action: e.target.value})}
              >
                <option value="ACCEPT">ACCEPT</option>
                <option value="DROP">DROP</option>
              </select>
              <input 
                type="text" placeholder="Port" className="al-input text-xs" 
                value={newRule.port} onChange={e => setNewRule({...newRule, port: e.target.value})} required 
              />
              <input 
                type="text" placeholder="Source IP" className="al-input text-xs" 
                value={newRule.sourceIp} onChange={e => setNewRule({...newRule, sourceIp: e.target.value})} required 
              />
              <button type="submit" className="al-btn al-btn-primary py-2 text-xs">Add Rule</button>
            </form>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 dark:bg-neutral-800/20 text-neutral-400">
                  <tr>
                    <th className="p-3">Direction</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Protocol</th>
                    <th className="p-3">Port</th>
                    <th className="p-3">Source IP</th>
                    <th className="p-3 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                  {firewallRules.map(r => (
                    <tr key={r.id}>
                      <td className="p-3 font-semibold uppercase">{r.direction}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${r.action === 'ACCEPT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{r.action}</span>
                      </td>
                      <td className="p-3 uppercase">{r.protocol}</td>
                      <td className="p-3 font-mono">{r.port}</td>
                      <td className="p-3 font-mono">{r.sourceIp}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleRemoveFirewallRule(r.id)} className="text-red-500 hover:text-red-400">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. BACKUPS & SNAPSHOTS TAB */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          {/* Create snapshots */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Snapshots Checkpoints</h2>
            <form onSubmit={handleCreateSnapshot} className="flex gap-3">
              <input 
                type="text" placeholder="Snapshot name" className="flex-1 al-input" 
                value={newSnapshotName} onChange={e => setNewSnapshotName(e.target.value)} required 
              />
              <button type="submit" className="al-btn al-btn-primary">Create Snapshot</button>
            </form>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 dark:bg-neutral-800/20 text-neutral-400">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                  {snapshots.map(s => (
                    <tr key={s.id}>
                      <td className="p-3 font-medium text-neutral-900 dark:text-white">{s.name}</td>
                      <td className="p-3 text-neutral-400">{s.description}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">{s.status}</span>
                      </td>
                      <td className="p-3 text-neutral-500">{new Date(s.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Backup Archives */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">LXC Backup Archives (vzdump)</h2>
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden mt-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-100 dark:bg-neutral-800/20 text-neutral-400">
                  <tr>
                    <th className="p-3">Filename</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                  {backups.map(b => (
                    <tr key={b.id}>
                      <td className="p-3 font-mono text-neutral-900 dark:text-white">{b.name}</td>
                      <td className="p-3 text-neutral-400">{(b.sizeBytes / (1024 * 1024)).toFixed(1)} MB</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">{b.status}</span>
                      </td>
                      <td className="p-3 text-neutral-500">{new Date(b.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4 max-w-xl">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Settings</h2>
          <form className="space-y-4 text-xs">
            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">Instance Display Name</label>
              <input 
                type="text" className="w-full al-input" 
                value={settingsName} onChange={e => setSettingsName(e.target.value)} required 
              />
            </div>
            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">Assigned Memory (MB)</label>
              <input 
                type="number" className="w-full al-input" 
                value={settingsMemory} onChange={e => setSettingsMemory(parseInt(e.target.value, 10))} required 
              />
            </div>
            <button type="button" className="al-btn al-btn-primary">Update Allocations</button>
          </form>
        </div>
      )}
    </div>
  );
};
export default InstanceDetails;
