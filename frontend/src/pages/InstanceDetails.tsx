import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { Console } from '../components/Console';
import { FileManager } from '../components/FileManager';
import { 
  Terminal as TermIcon, Folder, Globe, ShieldCheck, Settings as SetIcon,
  ArrowLeft, Trash2, Cpu, HardDrive, Shield, RefreshCw, Layers, ListFilter, ClipboardCheck, Tag
} from 'lucide-react';

// Self-contained custom SVG sparkline renderer for live diagnostics
const Sparkline: React.FC<{ data: number[]; color: string; label: string; maxVal: number; suffix?: string }> = ({ data, color, label, maxVal, suffix = '%' }) => {
  const width = 160;
  const height = 30;
  const currentVal = data.length > 0 ? data[data.length - 1] : 0;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1 || 1)) * width;
    const y = height - (val / (maxVal || 1)) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex items-center gap-4 bg-white/5 px-4 py-3 rounded-xl border border-neutral-200/5 dark:border-neutral-850">
      <div>
        <p className="text-[10px] text-neutral-500 uppercase font-semibold">{label}</p>
        <p className="text-sm font-semibold text-neutral-800 dark:text-white mt-0.5">
          {currentVal.toFixed(1)}{suffix}
        </p>
      </div>
      <svg width={width} height={height} className="overflow-visible ml-auto">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      </svg>
    </div>
  );
};

export const InstanceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const socket = useSocket();

  const [instance, setInstance] = useState<any | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('console');

  // Resource History for Live Sparklines
  const [cpuHistory, setCpuHistory] = useState<number[]>([12, 14, 11, 15, 18, 19, 14, 16, 20, 22]);
  const [ramHistory, setRamHistory] = useState<number[]>([44, 45, 44, 46, 45, 48, 47, 49, 48, 48]);
  const [diskHistory, setDiskHistory] = useState<number[]>([35, 35, 35, 35, 35, 35, 35, 35, 35, 35]);

  // Processes Tab States
  const [processes, setProcesses] = useState([
    { pid: 1, name: 'systemd', cpu: 0.1, mem: 2.4 },
    { pid: 102, name: 'nginx: master process', cpu: 1.4, mem: 12.8 },
    { pid: 103, name: 'nginx: worker process', cpu: 6.2, mem: 24.1 },
    { pid: 215, name: 'node /var/www/server.js', cpu: 4.8, mem: 48.9 },
    { pid: 485, name: 'sshd: root@pts/0', cpu: 0.0, mem: 4.2 }
  ]);
  const [procSearch, setProcSearch] = useState('');
  const [procSort, setProcSort] = useState<'cpu' | 'mem'>('cpu');

  // Network & Firewall
  const [firewallRules, setFirewallRules] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({ direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '', sourceIp: '0.0.0.0/0' });

  // Snapshots & backups
  const [backups, setBackups] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');

  // Settings & Custom properties
  const [settingsName, setSettingsName] = useState('');
  const [settingsCores, setSettingsCores] = useState(2);
  const [settingsMemory, setSettingsMemory] = useState(1024);
  const [settingsStorage, setSettingsStorage] = useState(20);
  const [notes, setNotes] = useState('Production database host container.');
  const [tags, setTags] = useState<string[]>(['Database', 'Primary']);
  const [newTag, setNewTag] = useState('');

  // Activity logs feed
  const [activities] = useState([
    { id: 1, user: 'admin', action: 'Restarted instance', time: 'Just Now' },
    { id: 2, user: 'admin', action: 'Modified CPU Core limits', time: '10 mins ago' },
    { id: 3, user: 'system', action: 'Nightly backup snapshot created', time: '1 day ago' }
  ]);

  useEffect(() => {
    fetchInstanceDetails();
  }, [id]);

  // Live Socket metrics feed
  useEffect(() => {
    if (!socket || !id) return;

    socket.emit('metrics.subscribe', { instanceId: id });
    socket.on('metrics.data', (data) => {
      setLiveMetrics(data);
      // Append and slide metric values (max 20 data points)
      setCpuHistory(prev => [...prev.slice(-19), data.cpu * 100]);
      setRamHistory(prev => [...prev.slice(-19), (data.mem / data.maxmem) * 100]);
      setDiskHistory(prev => [...prev.slice(-19), (data.disk / data.maxdisk) * 100]);
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
        setSettingsCores(data.cpuCores);
        setSettingsStorage(data.storageGb);
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

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (t: string) => {
    setTags(tags.filter(x => x !== t));
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

  const sortedProcesses = [...processes]
    .filter(p => p.name.toLowerCase().includes(procSearch.toLowerCase()))
    .sort((a, b) => b[procSort] - a[procSort]);

  if (loading || !instance) {
    return <div className="p-12 text-center text-neutral-500 text-sm">Loading instance configuration...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
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
            <h1 className="text-xl font-medium text-neutral-855 dark:text-white mt-1">{instance.name}</h1>
          </div>
        </div>

        <button 
          onClick={handleDeleteInstance}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl text-xs font-semibold transition"
        >
          <Trash2 size={14} /> Destroy VPS
        </button>
      </div>

      {/* Live Graph Diagnostic widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Sparkline data={cpuHistory} color="#ef4444" label="CPU utilization" maxVal={100} />
        <Sparkline data={ramHistory} color="#3b82f6" label="RAM allocation" maxVal={100} />
        <Sparkline data={diskHistory} color="#10b981" label="Disk consumption" maxVal={100} />
      </div>

      {/* Tabs navigation list */}
      <div>
        <nav className="flex relative">
          <ul role="list" className="flex min-w-full mt-1.5 flex-none gap-x-2 text-sm font-normal leading-6 text-neutral-600 dark:text-neutral-400 overflow-x-auto">
            {[
              { id: 'console', label: 'Console', icon: TermIcon },
              { id: 'processes', label: 'Processes', icon: ListFilter },
              { id: 'files', label: 'Files', icon: Folder },
              { id: 'network', label: 'Networking', icon: Globe },
              { id: 'backups', label: 'Backups', icon: ShieldCheck },
              { id: 'activity', label: 'Activity & Notes', icon: ClipboardCheck },
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

      {/* Tab contents panels */}

      {/* 1. CONSOLE TAB */}
      {activeTab === 'console' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
          <Console 
            instanceId={instance.id} 
            status={instance.status} 
            onPowerAction={handlePowerAction} 
          />
        </div>
      )}

      {/* 2. PROCESSES TAB */}
      {activeTab === 'processes' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">LXC Thread Processes</h3>
            <input 
              type="text" placeholder="Search processes..." className="al-input text-xs"
              value={procSearch} onChange={e => setProcSearch(e.target.value)}
            />
          </div>
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white">
                <tr>
                  <th className="p-3">PID</th>
                  <th className="p-3">Task Name</th>
                  <th className="p-3 cursor-pointer" onClick={() => setProcSort('cpu')}>CPU %</th>
                  <th className="p-3 cursor-pointer" onClick={() => setProcSort('mem')}>Memory MB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                {sortedProcesses.map(p => (
                  <tr key={p.pid} className="hover:bg-white/5">
                    <td className="p-3 font-mono">{p.pid}</td>
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{p.cpu.toFixed(1)}%</td>
                    <td className="p-3">{p.mem.toFixed(1)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. FILES TAB */}
      {activeTab === 'files' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
          <FileManager instanceId={instance.id} />
        </div>
      )}

      {/* 4. NETWORKING TAB */}
      {activeTab === 'network' && (
        <div className="space-y-6">
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

      {/* 5. BACKUPS TAB */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
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
        </div>
      )}

      {/* 6. ACTIVITY & NOTES TAB */}
      {activeTab === 'activity' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Notes & Tags card */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-white">Container metadata</h3>
            
            {/* Notes */}
            <div className="space-y-1">
              <label className="text-[10px] text-neutral-500 uppercase font-semibold">Instance Notes</label>
              <textarea 
                className="w-full al-input text-xs resize-none" rows={3}
                value={notes} onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="text-[10px] text-neutral-500 uppercase font-semibold block">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 bg-white/5 border border-neutral-700 px-2 py-0.5 rounded-md text-[10px] font-medium text-neutral-300">
                    {t}
                    <button type="button" onClick={() => handleRemoveTag(t)} className="text-neutral-500 hover:text-white font-bold">×</button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTag} className="flex gap-2">
                <input 
                  type="text" placeholder="Add tag..." className="flex-1 al-input text-[11px] py-1 px-2"
                  value={newTag} onChange={e => setNewTag(e.target.value)}
                />
                <button type="submit" className="p-1 border border-neutral-700 rounded-lg text-neutral-350 hover:text-white">
                  <Tag size={12} />
                </button>
              </form>
            </div>
          </div>

          {/* Activity Feed log streams */}
          <div className="md:col-span-2 bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardCheck size={18} /> Operation Log Feed
            </h3>
            <div className="divide-y divide-neutral-850 text-xs">
              {activities.map(a => (
                <div key={a.id} className="py-2.5 flex justify-between">
                  <div>
                    <span className="font-semibold text-white mr-2">{a.user}</span>
                    <span className="text-neutral-400">{a.action}</span>
                  </div>
                  <span className="text-neutral-500 font-mono text-[11px]">{a.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-6 max-w-xl">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Hardware Limits</h2>
          <form className="space-y-4 text-xs">
            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">Rename VPS Label</label>
              <input 
                type="text" className="w-full al-input" 
                value={settingsName} onChange={e => setSettingsName(e.target.value)} required 
              />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>CPU Allocation Cores</span>
                <span className="font-semibold text-white">{settingsCores} Cores</span>
              </div>
              <input 
                type="range" min="1" max="16" className="w-full accent-indigo-500" 
                value={settingsCores} onChange={e => setSettingsCores(parseInt(e.target.value, 10))} 
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Memory Allocation MB</span>
                <span className="font-semibold text-white">{settingsMemory} MB</span>
              </div>
              <input 
                type="range" min="256" max="16384" step="256" className="w-full accent-indigo-500" 
                value={settingsMemory} onChange={e => setSettingsMemory(parseInt(e.target.value, 10))} 
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Disk capacity size (GB)</span>
                <span className="font-semibold text-white">{settingsStorage} GB</span>
              </div>
              <input 
                type="range" min="10" max="500" className="w-full accent-indigo-500" 
                value={settingsStorage} onChange={e => setSettingsStorage(parseInt(e.target.value, 10))} 
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
