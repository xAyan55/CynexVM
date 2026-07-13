import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const TASK_TYPE_LABELS: Record<string, string> = {
  POWER_START: 'Start Container', POWER_STOP: 'Stop Container', POWER_RESTART: 'Restart Container',
  POWER_FORCE_STOP: 'Force Stop', POWER_FREEZE: 'Freeze', POWER_UNFREEZE: 'Unfreeze',
  STORAGE_BACKUP: 'Create Backup', STORAGE_SNAPSHOT: 'Create Snapshot',
  STORAGE_DELETE_OLD_BACKUPS: 'Delete Old Backups', STORAGE_DELETE_OLD_SNAPSHOTS: 'Delete Old Snapshots',
  MAINTENANCE_REINSTALL_OS: 'Reinstall OS', MAINTENANCE_UPDATE_PACKAGES: 'Update Packages',
  MAINTENANCE_CHANGE_HOSTNAME: 'Change Hostname', EXECUTION_SHELL_COMMAND: 'Shell Command',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  INACTIVE: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
  PAUSED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const RUN_STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RUNNING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
  CANCELLED: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
  RETRYING: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const Badge: React.FC<{ status: string; map?: Record<string, string> }> = ({ status, map }) => {
  const m = map || STATUS_COLORS;
  return <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${m[status] || 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'}`}>{status}</span>;
};

const getToken = () => localStorage.getItem('accessToken');
const api = async (url: string, options?: any) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}`, ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
};

export const AdminAutomation: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('taskType', typeFilter);

      const [data, statsData] = await Promise.all([
        api(`/api/v1/automation/admin/tasks?${params}`),
        api('/api/v1/automation/admin/stats'),
      ]);
      setTasks(data.tasks || []);
      setTotal(data.total || 0);
      setStats(statsData);
    } catch (err: any) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [page, search, statusFilter, typeFilter]);

  const handleToggleTask = async (task: any) => {
    try {
      await api(`/api/v1/automation/tasks/${task.id}`, {
        method: 'PUT', body: JSON.stringify({ enabled: !task.enabled }),
      });
      fetchTasks();
    } catch (err: any) { alert(err.message); }
  };

  const handleRunTask = async (taskId: string) => {
    try {
      await api(`/api/v1/automation/tasks/${taskId}/run`, { method: 'POST', body: JSON.stringify({ confirm: false }) });
      fetchTasks();
    } catch (err: any) { alert(err.message); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this automation task?')) return;
    try {
      await api(`/api/v1/automation/tasks/${taskId}`, { method: 'DELETE' });
      fetchTasks();
    } catch (err: any) { alert(err.message); }
  };

  const handleViewTask = async (taskId: string) => {
    try {
      const data = await api(`/api/v1/automation/tasks/${taskId}`);
      setSelectedTask(data);
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Automation Management</h1>
        <p className="text-sm text-neutral-400">Monitor and manage all automation tasks across the panel</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Total Tasks</p>
            <p className="text-2xl font-semibold text-white mt-1">{stats.totalTasks}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Active</p>
            <p className="text-2xl font-semibold text-emerald-400 mt-1">{stats.activeTasks}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Scheduled</p>
            <p className="text-2xl font-semibold text-blue-400 mt-1">{stats.totalScheduled}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Total Runs</p>
            <p className="text-2xl font-semibold text-white mt-1">{stats.totalRuns}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Completed</p>
            <p className="text-2xl font-semibold text-emerald-400 mt-1">{stats.completedRuns}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Failed</p>
            <p className={`text-2xl font-semibold mt-1 ${stats.failedRuns > 0 ? 'text-red-400' : 'text-neutral-400'}`}>{stats.failedRuns}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search tasks or instances..."
          className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PAUSED">Paused</option>
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none">
          <option value="">All Types</option>
          {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Tasks Table */}
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-neutral-400">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Instance</th>
              <th className="p-3 font-medium">Schedule</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Last Run</th>
              <th className="p-3 font-medium">Next Run</th>
              <th className="p-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-neutral-300">
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-neutral-500">Loading...</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-neutral-500">No automation tasks found</td></tr>
            ) : tasks.map(task => (
              <tr key={task.id} className="hover:bg-white/5 transition cursor-pointer" onClick={() => handleViewTask(task.id)}>
                <td className="p-3 font-medium text-white">{task.name}</td>
                <td className="p-3">
                  <span className="text-[9px] bg-white/10 px-2 py-0.5 rounded">{TASK_TYPE_LABELS[task.taskType] || task.taskType}</span>
                </td>
                <td className="p-3 text-neutral-400">{task.instance?.name || '—'}</td>
                <td className="p-3 text-neutral-400">{task.scheduleType || 'Manual'}</td>
                <td className="p-3"><Badge status={task.status} /></td>
                <td className="p-3">
                  {task.runs?.[0] ? (
                    <div className="flex items-center gap-1.5">
                      <Badge status={task.runs[0].status} map={RUN_STATUS_COLORS} />
                      <span className="text-neutral-500">{new Date(task.runs[0].startedAt || task.runs[0].createdAt).toLocaleDateString()}</span>
                    </div>
                  ) : '—'}
                </td>
                <td className="p-3 text-neutral-400">
                  {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '—'}
                </td>
                <td className="p-3 text-right">
                  <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleRunTask(task.id)}
                      className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded text-[9px] font-medium transition">Run</button>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={task.enabled} onChange={() => handleToggleTask(task)} className="sr-only peer" />
                      <div className="w-7 h-3.5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-blue-600" />
                    </label>
                    <button onClick={() => handleDeleteTask(task.id)}
                      className="p-1 text-neutral-500 hover:text-red-400 transition">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-2 text-xs">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-white/10 rounded-lg disabled:opacity-30 text-neutral-300">Previous</button>
          <span className="px-3 py-1.5 text-neutral-500">Page {page} of {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-white/10 rounded-lg disabled:opacity-30 text-neutral-300">Next</button>
        </div>
      )}

      {/* TASK DETAILS DIALOG */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTask(null)}>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">{selectedTask.name}</h2>
              <button onClick={() => setSelectedTask(null)} className="text-neutral-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-neutral-500">Type</p>
                  <p className="text-white font-medium">{TASK_TYPE_LABELS[selectedTask.taskType]}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Schedule</p>
                  <p className="text-white">{selectedTask.scheduleType || 'Manual'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Status</p>
                  <Badge status={selectedTask.status} />
                </div>
                <div>
                  <p className="text-neutral-500">Enabled</p>
                  <p className={selectedTask.enabled ? 'text-emerald-400' : 'text-red-400'}>{selectedTask.enabled ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Timezone</p>
                  <p className="text-white">{selectedTask.timezone}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Retries</p>
                  <p className="text-white">{selectedTask.retries}</p>
                </div>
              </div>
              {selectedTask.description && (
                <div>
                  <p className="text-neutral-500 mb-1">Description</p>
                  <p className="text-white">{selectedTask.description}</p>
                </div>
              )}
              {selectedTask.shellCommand && (
                <div>
                  <p className="text-neutral-500 mb-1">Shell Command</p>
                  <pre className="bg-neutral-900 rounded-xl p-3 text-green-400 font-mono text-[10px] overflow-x-auto">{selectedTask.shellCommand}</pre>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                <button onClick={() => handleRunTask(selectedTask.id)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition">Run Now</button>
                <button onClick={() => { handleDeleteTask(selectedTask.id); setSelectedTask(null); }}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl text-xs font-semibold transition">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAutomation;
