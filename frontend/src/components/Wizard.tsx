import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Server, User as UserIcon, FileText, Cpu, HardDrive, Globe, Keyboard, CheckCircle, AlertCircle, RefreshCw, Terminal, Loader } from 'lucide-react';

interface Node {
  id: string;
  name: string;
  hostname: string;
  cpuCores: number;
  memoryMb: number;
  storageGb: number;
}

interface User {
  id: string;
  username: string;
  email: string;
}

interface DeployProgress {
  status: string;
  progress: number;
  currentStage: string;
  currentStep: string;
  logs: { timestamp: string; level: string; message: string }[];
  failedReason?: string;
}

interface WizardProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const Wizard: React.FC<WizardProps> = ({ onSuccess, onCancel }) => {
  const [step, setStep] = useState(1);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [templates] = useState([
    { name: 'Ubuntu 22.04 LTS (Jammy)', path: 'images:ubuntu/22.04' },
    { name: 'Debian 12 Bookworm', path: 'images:debian/12' },
    { name: 'Alpine 3.19 Standard', path: 'images:alpine/3.19' }
  ]);

  // Form Fields
  const [type, setType] = useState<'LXC' | 'KVM'>('LXC');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('images:ubuntu/22.04');
  const [cpuCores, setCpuCores] = useState(1);
  const [memoryMb, setMemoryMb] = useState(512);
  const [storageGb, setStorageGb] = useState(10);
  const [netBridge, setNetBridge] = useState('lxdbr0');
  const [netIp, setNetIp] = useState('dhcp');
  const [vmid, setVmid] = useState(100);
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState<DeployProgress | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/v1/nodes', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNodes(data);
          if (data.length > 0) setSelectedNodeId(data[0].id);
        }
      } catch (_) {}
    };

    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/v1/auth/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
          if (data.length > 0) setSelectedUserId(data[0].id);
        }
      } catch (_) {}
    };

    fetchNodes();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [deployProgress?.logs]);

  const handleDeploy = async () => {
    setError(null);
    setDeploying(true);
    setDeployProgress({ status: 'queued', progress: 0, currentStage: 'Queued', currentStep: 'Queueing deployment...', logs: [] });
    setLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/instances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nodeId: selectedNodeId,
          userId: selectedUserId || undefined,
          name,
          vmid,
          osTemplate: selectedTemplate,
          cpuCores,
          memoryMb,
          storageGb,
          hostname: hostname || name,
          password,
          type,
          vmConfig: type === 'KVM' ? {
            cpuCores,
            memoryMb,
            guestAgent: true,
            uefi: false,
          } : undefined,
          cloudInit: type === 'KVM' ? {
            enabled: true,
            userData: `#cloud-config\npassword: ${password}\nchpasswd: { expire: False }\nssh_pwauth: True\n`,
            metaData: `instance-id: cynex-${vmid}\nlocal-hostname: ${hostname || name}\n`
          } : undefined,
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Deploy failed (HTTP ${res.status})`);
      }

      // Get taskId from 202 Accepted response
      const data = await res.json();
      const taskId = data.taskId;
      if (!taskId) {
        throw new Error('No task ID returned from server');
      }

      setDeployProgress(prev => prev ? { ...prev, status: 'running', currentStage: 'Deploying', currentStep: 'Monitoring deployment...' } : null);

      // Poll task status
      let completed = false;
      while (!completed) {
        await new Promise(r => setTimeout(r, 2000));

        try {
          const taskRes = await fetch(`/api/v1/instances/tasks/${taskId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!taskRes.ok) continue;

          const task = await taskRes.json();
          setDeployProgress({
            status: task.status,
            progress: task.progress || 0,
            currentStage: task.currentStage || '',
            currentStep: task.currentStep || '',
            logs: (task.logs || []).slice(-50),
            failedReason: task.failedReason
          });

          if (task.status === 'completed') {
            completed = true;
            setLoading(false);
            setDeploying(false);
            onSuccess();
            return;
          }

          if (task.status === 'failed') {
            completed = true;
            setLoading(false);
            setDeploying(false);
            setError(task.failedReason || 'Deployment failed');
            return;
          }
        } catch (_) {}
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setDeploying(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Select Type', desc: 'Choose virtualization technology', icon: Cpu },
    { num: 2, title: 'Choose Node', desc: 'Select target hypervisor host', icon: Server },
    { num: 3, title: 'Assign Owner', desc: 'Assign instance to user', icon: UserIcon },
    { num: 4, title: 'OS Template', desc: 'Select Linux operating system image', icon: FileText },
    { num: 5, title: 'Resources', desc: 'Configure CPU cores and Memory allocations', icon: Cpu },
    { num: 6, title: 'Storage size', desc: 'Define primary container virtual disk size', icon: HardDrive },
    { num: 7, title: 'Networking', desc: 'Assign network bridge interfaces and IP settings', icon: Globe },
    { num: 8, title: 'VPS Config', desc: 'Configure hostnames, VMID, and passwords', icon: Keyboard },
    { num: 9, title: 'Review & Deploy', desc: 'Validate allocations and launch deployment', icon: CheckCircle },
  ];

  const selectedUser = users.find(u => u.id === selectedUserId);

  const stageColors: Record<string, string> = {
    queued: 'text-yellow-400',
    validating: 'text-blue-400',
    running: 'text-blue-400',
    completed: 'text-emerald-400',
    failed: 'text-red-400',
    cancelled: 'text-gray-400',
  };

  return (
    <div className="w-full max-w-4xl al-card overflow-hidden flex flex-col h-[75vh]">
      {/* Header */}
      <div className="p-4 border-b border-borderSubtle bg-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Create VPS Wizard</h2>
        <span className="text-xs text-gray-500">{deploying ? 'Deploying...' : `Step ${step} of 9`}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - hide during deployment */}
        {!deploying && (
          <div className="w-64 border-r border-borderSubtle bg-black/20 p-4 space-y-4 hidden md:block">
            {stepsList.map(s => (
              <div key={s.num} className={`flex items-center gap-3 ${step === s.num ? 'text-white' : 'text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs ${
                  step === s.num ? 'border-blue-500 bg-blue-600/10 text-blue-400' :
                  step > s.num ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-gray-800'
                }`}>
                  {s.num}
                </div>
                <div>
                  <p className="text-xs font-semibold">{s.title}</p>
                  <p className="text-[10px] text-gray-500 truncate max-w-[150px]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Right Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* DEPLOYMENT PROGRESS VIEW */}
          {deploying && deployProgress && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Loader size={16} className="animate-spin text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Deploying VPS</h3>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    deployProgress.status === 'failed' ? 'bg-red-500' :
                    deployProgress.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.max(deployProgress.progress, 5)}%` }}
                />
              </div>

              {/* Status row */}
              <div className="flex items-center justify-between text-xs">
                <span className={`font-semibold ${stageColors[deployProgress.status] || 'text-gray-300'}`}>
                  {deployProgress.currentStage || deployProgress.status}
                </span>
                <span className="text-gray-500">{deployProgress.progress}%</span>
              </div>

              <p className="text-[11px] text-gray-400">{deployProgress.currentStep}</p>

              {/* Live logs */}
              <div className="bg-black/40 border border-borderSubtle rounded-btn p-3 h-40 overflow-y-auto font-mono text-[10px] leading-relaxed">
                {deployProgress.logs.length === 0 && (
                  <span className="text-gray-600">Waiting for deployment logs...</span>
                )}
                {deployProgress.logs.map((log, i) => (
                  <div key={i} className={`${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warning' ? 'text-yellow-400' : 'text-gray-400'
                  }`}>
                    <span className="text-gray-600">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* STEPS 1-8: unchanged form content */}
          {!deploying && step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Select Instance Type</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setType('LXC')}
                  className={`p-5 border rounded-card text-left transition-all flex flex-col justify-between ${
                    type === 'LXC' ? 'border-blue-600 bg-blue-600/5' : 'border-borderSubtle bg-white/5'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">LXC Container</h4>
                    <p className="text-[10px] text-gray-400 mt-2">Lightweight Linux container</p>
                    <ul className="text-[9px] text-gray-500 space-y-1 mt-3 list-disc list-inside">
                      <li>Fast startup (seconds)</li>
                      <li>Near-zero runtime overhead</li>
                      <li>Shared host kernel allocation</li>
                      <li>Ideal for Linux microservices & servers</li>
                    </ul>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('KVM')}
                  className={`p-5 border rounded-card text-left transition-all flex flex-col justify-between ${
                    type === 'KVM' ? 'border-blue-600 bg-blue-600/5' : 'border-borderSubtle bg-white/5'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">QEMU/KVM Virtual Machine</h4>
                    <p className="text-[10px] text-gray-400 mt-2">Full hardware virtualization</p>
                    <ul className="text-[9px] text-gray-500 space-y-1 mt-3 list-disc list-inside">
                      <li>Fully isolated guest kernel & operating systems</li>
                      <li>UEFI, legacy BIOS and secure boot keys</li>
                      <li>Dedicated virtual storage & PCI GPU options</li>
                      <li>Cloud-init automation and guest agent APIs</li>
                    </ul>
                  </div>
                </button>
              </div>
            </div>
          )}

          {!deploying && step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Select Hypervisor Node</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {nodes.length === 0 ? (
                  <div className="p-6 border border-borderSubtle rounded-card text-center text-gray-500 text-xs col-span-2">
                    No nodes configured.
                  </div>
                ) : (
                  nodes.map(n => (
                    <button
                      key={n.id}
                      onClick={() => setSelectedNodeId(n.id)}
                      className={`p-4 border rounded-card text-left transition-all flex items-start gap-3 ${
                        selectedNodeId === n.id ? 'border-blue-600 bg-blue-600/5' : 'border-borderSubtle bg-white/5'
                      }`}
                    >
                      <Server className="text-blue-500 mt-1 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-white">{n.name}</p>
                        <p className="text-[10px] text-gray-400 font-mono">{n.hostname}</p>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] text-gray-500">
                          <span>{n.cpuCores} Cores</span>
                          <span>{(n.memoryMb / 1024).toFixed(0)} GB RAM</span>
                          <span>{n.storageGb} GB Disk</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {!deploying && step === 3 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Assign owner for this VPS</h3>
              <div className="space-y-2">
                <label className="text-[11px] text-gray-400 block mb-1">Select User</label>
                {users.length === 0 ? (
                  <p className="text-xs text-neutral-500">No users found.</p>
                ) : (
                  <select
                    className="w-full al-input text-xs"
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {!deploying && step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Select OS Template / Cloud Image</h3>
              <div className="space-y-2">
                {templates.map(t => (
                  <button
                    key={t.path}
                    onClick={() => setSelectedTemplate(t.path)}
                    className={`w-full p-4 border rounded-card text-left transition-all flex items-center justify-between ${
                      selectedTemplate === t.path ? 'border-blue-600 bg-blue-600/5' : 'border-borderSubtle bg-white/5'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-white">{t.name}</p>
                      <p className="text-[10px] text-gray-500 font-mono truncate max-w-lg">{t.path}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!deploying && step === 5 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Configure CPU and Memory</h3>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">CPU Cores ({cpuCores})</label>
                  <input 
                    type="range" min="1" max="16" 
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    value={cpuCores}
                    onChange={e => setCpuCores(parseInt(e.target.value, 10))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Memory Allocation ({memoryMb} MB)</label>
                  <input 
                    type="range" min="512" max="16384" step="256"
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    value={memoryMb}
                    onChange={e => setMemoryMb(parseInt(e.target.value, 10))}
                  />
                </div>
              </div>
            </div>
          )}

          {!deploying && step === 6 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Virtual Disk Allocation</h3>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Storage space ({storageGb} GB)</label>
                <input 
                  type="range" min="5" max="500" step="5"
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  value={storageGb}
                  onChange={e => setStorageGb(parseInt(e.target.value, 10))}
                />
              </div>
            </div>
          )}

          {!deploying && step === 7 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Configure Networking Interfaces</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Bridge Interface</label>
                  <input 
                    type="text" className="w-full al-input"
                    value={netBridge}
                    onChange={e => setNetBridge(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">IP Allocation (DHCP or static IP/CIDR)</label>
                  <input 
                    type="text" placeholder="dhcp or 10.0.0.100/24" className="w-full al-input"
                    value={netIp}
                    onChange={e => setNetIp(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {!deploying && step === 8 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Configure Virtual Machine Credentials</h3>
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">VPS Friendly Name</label>
                    <input 
                      type="text" placeholder="my-webserver" className="w-full al-input"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Instance ID (VMID)</label>
                    <input 
                      type="number" className="w-full al-input"
                      value={vmid}
                      onChange={e => setVmid(parseInt(e.target.value, 10))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Hostname (FQDN)</label>
                  <input 
                    type="text" placeholder="web.cynexvm.local" className="w-full al-input"
                    value={hostname}
                    onChange={e => setHostname(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Root SSH Password</label>
                  <input 
                    type="password" placeholder="••••••••" className="w-full al-input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 9: Review & Deploy (hide during active deployment) */}
          {!deploying && step === 9 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Review Configuration Allocations</h3>
              <div className="al-card p-4 divide-y divide-borderSubtle text-xs">
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Virtualization Type</span>
                  <span className="font-semibold text-blue-400 uppercase">{type}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Node ID</span>
                  <span className="font-mono">{selectedNodeId}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Owner User</span>
                  <span className="font-semibold text-gray-200">
                    {selectedUser ? `${selectedUser.username} (${selectedUser.email})` : 'None'}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Operating System</span>
                  <span className="font-mono text-gray-400 truncate max-w-xs">{selectedTemplate}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">CPU Allocation</span>
                  <span className="font-semibold">{cpuCores} Cores</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Memory Allocation</span>
                  <span className="font-semibold">{memoryMb} MB</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Disk Space</span>
                  <span className="font-semibold">{storageGb} GB</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">IP Configuration</span>
                  <span className="font-mono text-gray-400">{netIp} (bridge: {netBridge})</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Hostname / VMID</span>
                  <span>{hostname || name} (ID: {vmid})</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="p-4 border-t border-borderSubtle bg-white/5 flex items-center justify-between">
        {deploying ? (
          <>
            <button
              disabled
              className="flex items-center gap-1 al-btn al-btn-secondary opacity-40 cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              disabled
              className="al-btn al-btn-primary px-6 opacity-60 cursor-not-allowed"
            >
              <Loader size={14} className="animate-spin inline mr-1.5" />
              Deploying...
            </button>
          </>
        ) : error && step === 9 ? (
          <>
            <button
              onClick={() => { setError(null); setStep(9); }}
              className="flex items-center gap-1 al-btn al-btn-secondary"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <button
              onClick={handleDeploy}
              className="al-btn al-btn-primary px-6 flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> Retry Deploy
            </button>
          </>
        ) : (
          <>
            <button
              onClick={step === 1 ? onCancel : () => setStep(step - 1)}
              className="flex items-center gap-1 al-btn al-btn-secondary"
            >
              <ChevronLeft size={16} /> {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 9 ? (
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 al-btn al-btn-primary"
              >
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                className="al-btn al-btn-primary px-6 flex items-center gap-1.5"
                disabled={loading}
              >
                {loading ? (
                  <><Loader size={14} className="animate-spin" /> Queueing...</>
                ) : (
                  <><Terminal size={14} /> Deploy VPS</>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
export default Wizard;
