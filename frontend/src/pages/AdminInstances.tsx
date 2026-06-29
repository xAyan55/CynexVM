import React, { useState, useEffect } from 'react';
import { DataTable } from '../components/DataTable';

interface Instance {
  id: string;
  name: string;
  vmid: number;
  status: string;
  node: { name: string };
  cpuCores: number;
  memoryMb: number;
}

export const AdminInstances: React.FC = () => {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInstances();
  }, []);

  const fetchInstances = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/instances', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInstances(data);
      }
    } catch (_) {}
    setLoading(false);
  };

  const columns = [
    { header: 'ID', accessor: 'vmid' as const, sortable: true },
    { header: 'Name', accessor: 'name' as const, sortable: true },
    { header: 'Status', accessor: 'status' as const, sortable: true },
    { header: 'Node', accessor: (row: Instance) => row.node?.name || 'unknown', sortable: false },
    { header: 'Cores', accessor: 'cpuCores' as const, sortable: true },
    { header: 'Memory (MB)', accessor: 'memoryMb' as const, sortable: true },
    {
      header: 'Actions',
      accessor: (row: Instance) => (
        <button 
          onClick={() => alert(`Modify limits: ${row.name}`)}
          className="px-2 py-1 bg-white/5 border border-neutral-700 hover:bg-white/10 text-white rounded text-[10px]"
        >
          Edit Limits
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Global Instances</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Manage resource allocations and deploy parameters globally.</p>
      </div>

      <div className="mx-8 p-6 bg-white dark:bg-white/5 rounded-xl border border-neutral-300 dark:border-neutral-800/20 shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-neutral-500">Querying container distributions...</div>
        ) : (
          <DataTable 
            data={instances} 
            columns={columns} 
            searchField="name" 
            searchPlaceholder="Search instances..." 
            bulkActions={[
              { label: 'Stop Selected', action: (items) => alert(`Stopping: ${items.map(i => i.name).join(', ')}`) }
            ]}
          />
        )}
      </div>
    </div>
  );
};
export default AdminInstances;
