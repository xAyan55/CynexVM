import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { Console } from '../components/Console';
import { FileManager } from '../components/FileManager';
import { 
  Terminal as TermIcon, Folder, Globe, ShieldCheck, Settings as SetIcon,
  ArrowLeft, Trash2, Cpu, HardDrive, Shield, RefreshCw, Layers, ListFilter, 
  ClipboardCheck, Tag, Activity, Clock, Wifi, WifiOff, ArrowDownToLine, ArrowUpFromLine,
  Play, Square, RotateCcw, Skull, Pause
} from 'lucide-react';

// Sparkline for live metric visualization
const Sparkline: React.FC<{ data: number[]; color: string; label: string; maxVal: number; suffix?: string; currentLabel?: string }> = ({ data, color, label, maxVal, suffix = '%', currentLabel }) => {
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
          {currentLabel || `${currentVal.toFixed(1)}${suffix}`}
        </p>
      </div>
      <svg width={width} height={height} className="overflow-visible ml-auto">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      </svg>
    </div>
  );
};

// Format bytes to human-readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Format uptime seconds to human-readable
const formatUptime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const InstanceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const socket = useSocket();
  const { user } = useAuth();

  const [instance, setInstance] = useState<any | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);

  // Resource History for Live Sparklines
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);
  const [diskHistory, setDiskHistory] = useState<number[]>([]);
  const [netInHistory, setNetInHistory] = useState<number[]>([]);
  const [netOutHistory, setNetOutHistory] = useState<number[]>([]);

  // Network & Firewall
  const [firewallRules, setFirewallRules] = useState<any[]>([]);
  const [newRule, setNewRule] = useState({ direction: 'inbound', action: 'ACCEPT', protocol: 'tcp', port: '', sourceIp: '0.0.0.0/0' });

  // Snapshots & backups
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');

  // Settings & Custom properties
  const [settingsName, setSettingsName] = useState('');
  const [settingsCores, setSettingsCores] = useState(1);
  const [settingsMemory, setSettingsMemory] = useState(512);
  const [settingsStorage, setSettingsStorage] = useState(10);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const [savingSpecs, setSavingSpecs] = useState(false);

  useEffect(() => {
    fetchInstanceDetails();
  }, [id]);

  // Live Socket metrics feed
  useEffect(() => {
    if (!socket || !id) return;

    const token = localStorage.getItem('accessToken') || undefined;

    socket.emit('metrics.subscribe', { instanceId: id, token });
    socket.on('metrics.data', (data) => {
      setLiveMetrics(data);
      setCpuHistory(prev => [...prev.slice(-19), (data.cpu || 0) * 100]);
      setRamHistory(prev => [...prev.slice(-19), data.maxmem > 0 ? (data.mem / data.maxmem) * 100 : 0]);
      setDiskHistory(prev => [...prev.slice(-19), data.maxdisk > 0 ? (data.disk / data.maxdisk) * 100 : 0]);
      setNetInHistory(prev => [...prev.slice(-19), data.netin || 0]);
      setNetOutHistory(prev => [...prev.slice(-19), data.netout || 0]);

      // Update instance status from live metrics
      if (data.status) {
        setInstance((prev: any) => prev ? { ...prev, status: data.status } : prev);
      }
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
        setSnapshots(data.snapshots || []);
        setFirewallRules(data.firewallRules || []);
        setNotes(data.notes || '');
        setTags(data.tags?.map((t: any) => t.tag?.name) || []);
      } else {
        navigate('/');
      }
    } catch (_) {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handlePowerAction = useCallback(async (action: string) => {
    if (!instance) return;
    setActionLoading(action);
    setPowerError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instance.id}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `${action} failed`);
      }
      // Wait briefly for LXD to process the action, then refresh
      await new Promise(r => setTimeout(r, 1500));
      await fetchInstanceDetails();
    } catch (err: any) {
      setPowerError(err.message);
    } finally {
      setActionLoading(null);
    }
  }, [instance, id]);

  const handleUpdateSpecs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instance) return;
    setSavingSpecs(true);
    setPowerError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instance.id}/specs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cpuCores: settingsCores,
          memoryMb: settingsMemory,
          storageGb: settingsStorage
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update specifications');
      }
      alert('Hardware limits updated successfully!');
      fetchInstanceDetails();
    } catch (err: any) {
      setPowerError(err.message);
    } finally {
      setSavingSpecs(false);
    }
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

  const handleReinstall = async () => {
    if (!instance) return;
    if (!confirm('CRITICAL WARNING: Reinstalling will wipe the entire container disk! This action is irreversible.')) return;
    
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/instances/${instance.id}/reinstall`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Reinstallation started! Redirecting to Task logs.');
        navigate('/admin/tasks');
      } else {
        const err = await res.json();
        alert(err.error || 'Reinstall failed');
      }
    } catch (_) {}
  };

  if (loading || !instance) {
    return <div className="p-12 text-center text-neutral-500 text-sm">Loading instance configuration...</div>;
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'console', label: 'Console', icon: TermIcon },
    { id: 'files', label: 'Files', icon: Folder },
    { id: 'network', label: 'Networking', icon: Globe },
    { id: 'backups', label: 'Backups', icon: ShieldCheck },
    { id: 'activity', label: 'Activity & Notes', icon: ClipboardCheck },
    ...(user?.role === 'Admin' ? [{ id: 'settings', label: 'Settings', icon: SetIcon }] : [])
  ];

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-neutral-200/30 dark:border-white/5 gap-4">
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

        {/* Global Power Ribbon */}
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => handlePowerAction('start')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={instance.status === 'running' || actionLoading === 'start'}
          >
            <Play size={13} /> {actionLoading === 'start' ? 'Starting...' : 'Start'}
          </button>
          <button 
            onClick={() => handlePowerAction('stop')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={instance.status === 'stopped' || actionLoading === 'stop'}
          >
            <Square size={13} /> {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
          </button>
          <button 
            onClick={() => handlePowerAction('reboot')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={instance.status !== 'running' || actionLoading === 'reboot'}
          >
            <RotateCcw size={13} /> {actionLoading === 'reboot' ? 'Rebooting...' : 'Reboot'}
          </button>
          <button 
            onClick={() => handlePowerAction('kill')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-800 hover:bg-rose-900 text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={instance.status === 'stopped' || actionLoading === 'kill'}
          >
            <Skull size={13} /> {actionLoading === 'kill' ? 'Killing...' : 'Kill'}
          </button>

          {instance.status === 'frozen' ? (
            <button 
              onClick={() => handlePowerAction('unfreeze')} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={actionLoading === 'unfreeze'}
            >
              <Play size={13} /> Unfreeze
            </button>
          ) : (
            <button 
              onClick={() => handlePowerAction('freeze')} 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={instance.status !== 'running' || actionLoading === 'freeze'}
            >
              <Pause size={13} /> Freeze
            </button>
          )}

          {/* Admin Destroy VPS button */}
          {user?.role === 'Admin' && (
            <button 
              onClick={handleDeleteInstance}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl text-xs font-semibold transition ml-2"
            >
              <Trash2 size={13} /> Destroy VPS
            </button>
          )}
        </div>
      </div>

      {/* Power error banner */}
      {powerError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
          Power action failed: {powerError}
        </div>
      )}

      {/* Tabs navigation list */}
      <div>
        <nav className="flex relative">
          <ul role="list" className="flex min-w-full mt-1.5 flex-none gap-x-2 text-sm font-normal leading-6 text-neutral-600 dark:text-neutral-400 overflow-x-auto">
            {tabs.map((t) => (
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

      {/* 0. OVERVIEW TAB (Default) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Live Sparkline Graphs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Sparkline data={cpuHistory} color="#ef4444" label="CPU Usage" maxVal={100} />
            <Sparkline 
              data={ramHistory} 
              color="#3b82f6" 
              label="Memory" 
              maxVal={100} 
              currentLabel={liveMetrics ? `${formatBytes(liveMetrics.mem)} / ${formatBytes(liveMetrics.maxmem)}` : 'Waiting...'}
            />
            <Sparkline 
              data={diskHistory} 
              color="#10b981" 
              label="Disk" 
              maxVal={100} 
              currentLabel={liveMetrics ? `${formatBytes(liveMetrics.disk)} / ${formatBytes(liveMetrics.maxdisk)}` : 'Waiting...'}
            />
          </div>

          {/* Info Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Uptime */}
            <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800/30">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-blue-400" />
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Uptime</span>
              </div>
              <p className="text-lg font-semibold text-white">{formatUptime(liveMetrics?.uptime)}</p>
            </div>

            {/* Network In */}
            <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownToLine size={14} className="text-green-400" />
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Network In</span>
              </div>
              <p className="text-lg font-semibold text-white">{formatBytes(liveMetrics?.netin || 0)}</p>
            </div>

            {/* Network Out */}
            <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800/30">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpFromLine size={14} className="text-orange-400" />
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Network Out</span>
              </div>
              <p className="text-lg font-semibold text-white">{formatBytes(liveMetrics?.netout || 0)}</p>
            </div>

            {/* Status */}
            <div className="bg-white dark:bg-white/5 rounded-xl p-4 border border-neutral-200 dark:border-neutral-800/30">
              <div className="flex items-center gap-2 mb-2">
                {instance.status === 'running' ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-red-400" />}
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Status</span>
              </div>
              <p className={`text-lg font-semibold capitalize ${instance.status === 'running' ? 'text-emerald-400' : 'text-red-400'}`}>
                {instance.status}
              </p>
            </div>
          </div>

          {/* Instance Configuration Details */}
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-200 dark:border-neutral-800/30">
            <h3 className="text-sm font-semibold text-white mb-4">Container Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">Hostname</span>
                <span className="text-neutral-200 font-mono font-medium">{instance.hostname}</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">IP Address</span>
                <span className="text-neutral-200 font-mono font-medium">{instance.ipAddress || 'DHCP'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">OS Template</span>
                <span className="text-neutral-200 font-medium">{instance.osTemplate}</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">VMID</span>
                <span className="text-neutral-200 font-mono font-medium">{instance.vmid}</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">CPU Cores</span>
                <span className="text-neutral-200 font-medium">{instance.cpuCores} vCPU</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">Memory</span>
                <span className="text-neutral-200 font-medium">{instance.memoryMb} MB</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">Storage</span>
                <span className="text-neutral-200 font-medium">{instance.storageGb} GB</span>
              </div>
              <div>
                <span className="block text-[10px] text-neutral-500 uppercase mb-0.5">Created</span>
                <span className="text-neutral-200 font-medium">{new Date(instance.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* No metrics warning */}
          {!liveMetrics && (
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" />
              Waiting for live metrics from container... Make sure the container is running.
            </div>
          )}
        </div>
      )}

      {/* 1. CONSOLE TAB */}
      {activeTab === 'console' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
          <Console 
            instanceId={instance.id} 
            status={instance.status} 
            onPowerAction={handlePowerAction}
            actionLoading={actionLoading}
          />
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
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
            <h2 className="text-base font-semibold mb-4 text-neutral-900 dark:text-white">Network Interfaces</h2>
            <div className="grid grid-cols-2 gap-4 text-sm text-neutral-400">
              <div>
                <span className="block text-[10px] text-neutral-500">Bridge Interface</span>
                <span className="text-neutral-800 dark:text-neutral-300 font-medium">lxdbr0</span>
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
              <select className="al-input text-xs" value={newRule.direction} onChange={e => setNewRule({...newRule, direction: e.target.value})}>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
              <select className="al-input text-xs" value={newRule.action} onChange={e => setNewRule({...newRule, action: e.target.value})}>
                <option value="ACCEPT">ACCEPT</option>
                <option value="DROP">DROP</option>
              </select>
              <input type="text" placeholder="Port" className="al-input text-xs" value={newRule.port} onChange={e => setNewRule({...newRule, port: e.target.value})} required />
              <input type="text" placeholder="Source IP" className="al-input text-xs" value={newRule.sourceIp} onChange={e => setNewRule({...newRule, sourceIp: e.target.value})} required />
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
                  {firewallRules.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-neutral-500">No firewall rules configured</td></tr>
                  )}
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

      {/* 4. BACKUPS TAB */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Snapshots Checkpoints</h2>
            <form onSubmit={handleCreateSnapshot} className="flex gap-3">
              <input type="text" placeholder="Snapshot name" className="flex-1 al-input" value={newSnapshotName} onChange={e => setNewSnapshotName(e.target.value)} required />
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
                  {snapshots.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-neutral-500">No snapshots found</td></tr>
                  )}
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

      {/* 5. ACTIVITY & NOTES TAB */}
      {activeTab === 'activity' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-white">Container metadata</h3>
            <div className="space-y-1">
              <label className="text-[10px] text-neutral-500 uppercase font-semibold">Instance Notes</label>
              <textarea className="w-full al-input text-xs resize-none" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
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
                <input type="text" placeholder="Add tag..." className="flex-1 al-input text-[11px] py-1 px-2" value={newTag} onChange={e => setNewTag(e.target.value)} />
                <button type="submit" className="p-1 border border-neutral-700 rounded-lg text-neutral-350 hover:text-white">
                  <Tag size={12} />
                </button>
              </form>
            </div>
          </div>
          <div className="md:col-span-2 bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <ClipboardCheck size={18} /> Operation Log Feed
            </h3>
            <p className="text-xs text-neutral-500 text-center py-8">No activity logs recorded yet.</p>
          </div>
        </div>
      )}

      {/* 6. SETTINGS TAB (Admin Only) */}
      {activeTab === 'settings' && user?.role === 'Admin' && (
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-6 max-w-xl">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Hardware Limits</h2>
          <form onSubmit={handleUpdateSpecs} className="space-y-4 text-xs">
            <div>
              <label className="text-[11px] text-neutral-400 block mb-1">Rename VPS Label</label>
              <input type="text" className="w-full al-input" value={settingsName} onChange={e => setSettingsName(e.target.value)} required disabled />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>CPU Allocation Cores</span>
                <span className="font-semibold text-white">{settingsCores} Cores</span>
              </div>
              <input type="range" min="1" max="16" className="w-full accent-indigo-500" value={settingsCores} onChange={e => setSettingsCores(parseInt(e.target.value, 10))} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Memory Allocation MB</span>
                <span className="font-semibold text-white">{settingsMemory} MB</span>
              </div>
              <input type="range" min="256" max="16384" step="256" className="w-full accent-indigo-500" value={settingsMemory} onChange={e => setSettingsMemory(parseInt(e.target.value, 10))} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-neutral-400">
                <span>Disk capacity size (GB)</span>
                <span className="font-semibold text-white">{settingsStorage} GB</span>
              </div>
              <input type="range" min="10" max="500" className="w-full accent-indigo-500" value={settingsStorage} onChange={e => setSettingsStorage(parseInt(e.target.value, 10))} />
            </div>
            <button type="submit" className="al-btn al-btn-primary" disabled={savingSpecs}>
              {savingSpecs ? 'Saving specifications...' : 'Update Allocations'}
            </button>
          </form>

          <div className="pt-6 border-t border-neutral-200/30 dark:border-white/5 space-y-3">
            <h3 className="text-sm font-semibold text-rose-500">Danger Zone</h3>
            <p className="text-[11px] text-neutral-400">Reinstalling deletes the container filesystem root and recreates it from the original OS template. All user configuration files and data will be destroyed.</p>
            <button 
              onClick={handleReinstall}
              className="px-3.5 py-2 bg-rose-650 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow transition"
            >
              Reinstall OS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default InstanceDetails;
