import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Server, User as UserIcon, FileText, Cpu, HardDrive, Globe, Keyboard, CheckCircle } from 'lucide-react';

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
  const [error, setError] = useState<string | null>(null);

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

  const handleDeploy = async () => {
    setLoading(true);
    setError(null);
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
        })
      });

      if (res.ok) {
        onSuccess();
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Deploy failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Choose Node', desc: 'Select target hypervisor host', icon: Server },
    { num: 2, title: 'Assign Owner', desc: 'Assign instance to user', icon: UserIcon },
    { num: 3, title: 'OS Template', desc: 'Select Linux operating system image', icon: FileText },
    { num: 4, title: 'Resources', desc: 'Configure CPU cores and Memory allocations', icon: Cpu },
    { num: 5, title: 'Storage size', desc: 'Define primary container virtual disk size', icon: HardDrive },
    { num: 6, title: 'Networking', desc: 'Assign network bridge interfaces and IP settings', icon: Globe },
    { num: 7, title: 'Container Config', desc: 'Configure hostnames, VMID, and passwords', icon: Keyboard },
    { num: 8, title: 'Review & Deploy', desc: 'Validate allocations and launch deployment', icon: CheckCircle },
  ];

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="w-full max-w-4xl al-card overflow-hidden flex flex-col h-[75vh]">
      {/* Header and Step Stepper indicator */}
      <div className="p-4 border-b border-borderSubtle bg-white/5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Create LXC VPS Wizard</h2>
        <span className="text-xs text-gray-500">Step {step} of 8</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left timeline steps display */}
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

        {/* Right Content Body Viewport */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {error && <p className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs">{error}</p>}

          {/* STEP 1: Choose Node */}
          {step === 1 && (
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

          {/* STEP 2: Assign Owner */}
          {step === 2 && (
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

          {/* STEP 3: Choose Template */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Select Container OS Template</h3>
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

          {/* STEP 4: Resources */}
          {step === 4 && (
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

          {/* STEP 5: Disk Storage */}
          {step === 5 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Container Virtual Disk Allocation</h3>
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

          {/* STEP 6: Network bridge and IP */}
          {step === 6 && (
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

          {/* STEP 7: Hostname, VMID & Password */}
          {step === 7 && (
            <div className="space-y-4 max-w-md">
              <h3 className="text-sm font-semibold text-white">Configure Container Credentials</h3>
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
                    <label className="text-[11px] text-gray-400 block mb-1">Container ID</label>
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

          {/* STEP 8: Review & Deploy */}
          {step === 8 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Review Configuration Allocations</h3>
              <div className="al-card p-4 divide-y divide-borderSubtle text-xs">
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
                  <span className="text-gray-500">Container Template</span>
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

      {/* Stepper Buttons Control Bar */}
      <div className="p-4 border-t border-borderSubtle bg-white/5 flex items-center justify-between">
        <button 
          onClick={step === 1 ? onCancel : () => setStep(step - 1)}
          className="flex items-center gap-1 al-btn al-btn-secondary"
        >
          <ChevronLeft size={16} /> Back
        </button>

        {step < 8 ? (
          <button 
            onClick={() => setStep(step + 1)}
            className="flex items-center gap-1.5 al-btn al-btn-primary"
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button 
            onClick={handleDeploy}
            className="al-btn al-btn-primary px-6"
            disabled={loading}
          >
            {loading ? 'Queueing Deploy...' : 'Deploy VPS'}
          </button>
        )}
      </div>
    </div>
  );
};
export default Wizard;
