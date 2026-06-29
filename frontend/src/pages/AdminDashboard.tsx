import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalNodes: 0,
    onlineNodes: 0,
    totalInstances: 0,
    avgDensity: '0.00',
    totalUsers: 0,
    totalCpuCores: 0,
    allocatedCpuCores: 0,
    totalMemoryMb: 0,
    allocatedMemoryMb: 0,
    totalStorageGb: 0,
    allocatedStorageGb: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      
      const [nodesRes, instancesRes, usersRes] = await Promise.all([
        fetch('/api/v1/nodes', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/v1/instances', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/v1/users', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (nodesRes.ok && instancesRes.ok && usersRes.ok) {
        const nodes = await nodesRes.json();
        const instances = await instancesRes.json();
        const users = await usersRes.json();

        const totalCpuCores = nodes.reduce((acc: number, n: any) => acc + (n.cpuCores || 0), 0);
        const allocatedCpuCores = instances.reduce((acc: number, i: any) => acc + (i.cpuCores || 0), 0);
        
        const totalMemoryMb = nodes.reduce((acc: number, n: any) => acc + (n.memoryMb || 0), 0);
        const allocatedMemoryMb = instances.reduce((acc: number, i: any) => acc + (i.memoryMb || 0), 0);

        const totalStorageGb = nodes.reduce((acc: number, n: any) => acc + (n.storageGb || 0), 0);
        const allocatedStorageGb = instances.reduce((acc: number, i: any) => acc + (i.storageGb || 0), 0);

        const onlineNodesCount = nodes.filter((n: any) => n.status === 'online').length;

        setStats({
          totalNodes: nodes.length,
          onlineNodes: onlineNodesCount,
          totalInstances: instances.length,
          avgDensity: nodes.length > 0 ? (instances.length / nodes.length).toFixed(2) : '0.00',
          totalUsers: users.length,
          totalCpuCores,
          allocatedCpuCores,
          totalMemoryMb,
          allocatedMemoryMb,
          totalStorageGb,
          allocatedStorageGb
        });
      }
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Admin Overview</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Monitor cluster nodes health and resource distributions.</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-neutral-500">Loading system metrics...</div>
      ) : (
        <>
          {/* Grid status cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 m-8">
            <div className="bg-neutral-50 dark:bg-neutral-800/20 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">Total Hypervisor Nodes</h2>
              <p className="text-4xl font-normal text-neutral-800 dark:text-white">{stats.totalNodes}</p>
              <p className="text-xs text-neutral-400 mt-2">Online clusters: {stats.onlineNodes}</p>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-800/20 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">LXC Containers</h2>
              <p className="text-4xl font-normal text-neutral-800 dark:text-white">{stats.totalInstances}</p>
              <p className="text-xs text-neutral-400 mt-2">Average density: {stats.avgDensity} instances/node</p>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-800/20 rounded-xl p-5 border border-neutral-200 dark:border-white/5">
              <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">Registered Accounts</h2>
              <p className="text-4xl font-normal text-neutral-800 dark:text-white">{stats.totalUsers}</p>
              <p className="text-xs text-neutral-400 mt-2">Active user credentials</p>
            </div>
          </div>

          {/* Cluster Metrics Overview */}
          <div className="mx-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <Cpu className="text-neutral-500" size={18} /> Cluster CPU Distribution
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Total Provisioned Cores</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {stats.totalCpuCores > 0 ? `${stats.totalCpuCores} Cores` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Allocated CPU Power</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {stats.totalCpuCores > 0 
                      ? `${stats.allocatedCpuCores} Cores (${Math.round((stats.allocatedCpuCores / stats.totalCpuCores) * 100)}% density)` 
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                <HardDrive className="text-neutral-500" size={18} /> Storage Pool Capacity
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Default Allocation</span>
                  <span className="font-semibold text-neutral-900 dark:text-white">
                    {stats.totalStorageGb > 0 ? `${stats.allocatedStorageGb} GB / ${stats.totalStorageGb} GB` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Remaining Space</span>
                  <span className="font-semibold text-emerald-400">
                    {stats.totalStorageGb > 0 ? `${stats.totalStorageGb - stats.allocatedStorageGb} GB Available` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
export default AdminDashboard;
