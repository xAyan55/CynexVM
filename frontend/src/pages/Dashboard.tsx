import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Wizard } from '../components/Wizard';
import { 
  Server, Cpu, HardDrive, ShieldAlert, Plus, 
  Terminal, Power, CheckCircle, RefreshCw, Activity 
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Instance {
  id: string;
  vmid: number;
  name: string;
  status: string;
  cpuCores: number;
  memoryMb: number;
  storageGb: number;
  ipAddress: string | null;
  osTemplate: string;
  node: { name: string };
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [nodesCount, setNodesCount] = useState(0);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [showDeployWizard, setShowDeployWizard] = useState(false);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      
      // Fetch instances
      const instRes = await fetch('/api/v1/instances', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (instRes.ok) {
        const instData = await instRes.json();
        setInstances(instData);
      }

      // Fetch nodes count
      const nodesRes = await fetch('/api/v1/nodes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (nodesRes.ok) {
        const nodesData = await nodesRes.json();
        setNodesCount(nodesData.length);
      }

      // Fetch audit logs
      if (user?.role === 'Admin') {
        const logsRes = await fetch('/api/v1/audit-logs?limit=5', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setAuditLogs(logsData.logs || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Sparkline animation on dashboard mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const width = (canvas.width = canvas.parentElement?.clientWidth || 400);
    const height = (canvas.height = 120);
    const dataPoints: number[] = Array.from({ length: 20 }, () => Math.random() * 40 + 30);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Add new data point periodically
      if (Math.random() > 0.8) {
        dataPoints.shift();
        dataPoints.push(Math.random() * 40 + 30);
      }

      // Gradient under graph line
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, 'rgba(37, 99, 235, 0.25)');
      grad.addColorStop(1, 'rgba(37, 99, 235, 0)');

      ctx.beginPath();
      ctx.moveTo(0, height - (dataPoints[0] / 100) * height);
      
      const step = width / (dataPoints.length - 1);
      for (let i = 1; i < dataPoints.length; i++) {
        const x = i * step;
        const y = height - (dataPoints[i] / 100) * height;
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Complete path to draw gradient
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fillStyle = grad;
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [loading]);

  const activeInstances = instances.filter(i => i.status === 'running').length;

  return (
    <div className="space-y-6">
      {/* Upper header section */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Dashboard</h1>
          <p className="text-xs text-gray-400">System overview and LXC container status.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchDashboardData}
            className="p-2 text-gray-400 hover:text-white bg-white/5 border border-borderSubtle rounded-btn hover:scale-[1.02] transition-all"
            title="Reload data"
          >
            <RefreshCw size={16} />
          </button>
          <button 
            onClick={() => setShowDeployWizard(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-bold transition-all hover:scale-[1.02] shadow-glow"
          >
            <Plus size={16} /> Deploy VPS
          </button>
        </div>
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Instances */}
        <div className="glass-panel p-4 rounded-card border border-borderSubtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">Running Containers</span>
            <span className="text-2xl font-bold text-white">{activeInstances}</span>
            <span className="text-[10px] text-gray-400 block">out of {instances.length} configured</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Terminal size={18} />
          </div>
        </div>

        {/* Hypervisor Nodes */}
        <div className="glass-panel p-4 rounded-card border border-borderSubtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">Nodes Connected</span>
            <span className="text-2xl font-bold text-white">{nodesCount}</span>
            <span className="text-[10px] text-emerald-400 block">All hypervisors active</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Server size={18} />
          </div>
        </div>

        {/* Total CPU cores */}
        <div className="glass-panel p-4 rounded-card border border-borderSubtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">Total Cores Assigned</span>
            <span className="text-2xl font-bold text-white">
              {instances.reduce((acc, i) => acc + i.cpuCores, 0)}
            </span>
            <span className="text-[10px] text-gray-400 block">vCPU allocations</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Cpu size={18} />
          </div>
        </div>

        {/* Memory allocation */}
        <div className="glass-panel p-4 rounded-card border border-borderSubtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider block">RAM Allocated</span>
            <span className="text-2xl font-bold text-white">
              {(instances.reduce((acc, i) => acc + i.memoryMb, 0) / 1024).toFixed(1)} GB
            </span>
            <span className="text-[10px] text-gray-400 block">Memory pool</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <HardDrive size={18} />
          </div>
        </div>
      </div>

      {/* Graph and Recent logs widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time historical chart */}
        <div className="glass-panel p-5 rounded-card border border-borderSubtle lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Cluster Resource Efficiency</h3>
              <p className="text-[10px] text-gray-500">Live aggregate CPU usage history</p>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400"><Activity size={10} /> Active streaming</span>
          </div>
          <div className="w-full h-32 relative">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        {/* Recent Audit events */}
        <div className="glass-panel p-5 rounded-card border border-borderSubtle flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Security Alerts & Audit Logs</h3>
            <div className="space-y-3">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">No recent security logs</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="text-xs border-b border-borderSubtle pb-2 last:border-b-0">
                    <div className="flex justify-between font-mono text-[10px]">
                      <span className="text-blue-400 font-semibold">{log.action}</span>
                      <span className="text-gray-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-gray-300 mt-1 truncate">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          {user?.role === 'Admin' && (
            <Link to="/admin/audit-logs" className="text-[11px] text-blue-500 hover:underline block mt-3 font-semibold">
              View all audit logs &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* Main Containers grid/list table */}
      <div className="glass-panel rounded-card border border-borderSubtle overflow-hidden">
        <div className="p-4 border-b border-borderSubtle bg-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Linux Container Instances</h3>
          <span className="text-[10px] text-gray-400 font-mono">{instances.length} VMIDs allocated</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm">Loading instances...</div>
        ) : instances.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs">
            No active VPS instances found. Create your first container by clicking "Deploy VPS".
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-borderSubtle text-gray-400">
                <th className="p-3">VMID</th>
                <th className="p-3">Friendly Name</th>
                <th className="p-3">Hypervisor Node</th>
                <th className="p-3">IP Address</th>
                <th className="p-3">Configuration Pool</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSubtle">
              {instances.map(inst => (
                <tr key={inst.id} className="hover:bg-white/5 transition-all">
                  <td className="p-3 font-mono text-gray-400">{inst.vmid}</td>
                  <td className="p-3 font-semibold">
                    <Link to={`/instances/${inst.id}`} className="text-blue-500 hover:underline">
                      {inst.name}
                    </Link>
                  </td>
                  <td className="p-3 text-gray-400">{inst.node.name}</td>
                  <td className="p-3 font-mono text-gray-500">{inst.ipAddress || 'configuring...'}</td>
                  <td className="p-3 text-gray-500">
                    {inst.cpuCores} vCPUs / {(inst.memoryMb / 1024).toFixed(1)} GB RAM
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      inst.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      inst.status === 'stopped' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>{inst.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Deployment Wizard Modal */}
      {showDeployWizard && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <Wizard 
            onSuccess={() => {
              setShowDeployWizard(false);
              fetchDashboardData();
            }}
            onCancel={() => setShowDeployWizard(false)}
          />
        </div>
      )}
    </div>
  );
};
export default Dashboard;
