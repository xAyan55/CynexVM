import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const TASK_TYPE_LABELS: Record<string, string> = {
  POWER_START: 'Start VPS',
  POWER_STOP: 'Stop VPS',
  POWER_RESTART: 'Restart VPS',
  POWER_FORCE_STOP: 'Force Stop',
  POWER_FREEZE: 'Freeze',
  POWER_UNFREEZE: 'Unfreeze',
  STORAGE_BACKUP: 'Create Backup',
  STORAGE_SNAPSHOT: 'Create Snapshot',
  STORAGE_DELETE_OLD_BACKUPS: 'Delete Old Backups',
  STORAGE_DELETE_OLD_SNAPSHOTS: 'Delete Old Snapshots',
  MAINTENANCE_REINSTALL_OS: 'Reinstall OS',
  MAINTENANCE_UPDATE_PACKAGES: 'Update Container Packages',
  MAINTENANCE_CHANGE_HOSTNAME: 'Change Hostname',
  EXECUTION_SHELL_COMMAND: 'Execute Shell Command',
};

const DESTRUCTIVE_TASKS = new Set([
  'POWER_FORCE_STOP', 'STORAGE_DELETE_OLD_BACKUPS',
  'STORAGE_DELETE_OLD_SNAPSHOTS', 'MAINTENANCE_REINSTALL_OS',
]);

const STATUS_COLORS: Record<string, string> = {
  QUEUED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  RUNNING: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
  CANCELLED: 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
  RETRYING: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const TASK_TEMPLATES = [
  { name: 'Weekly Backup', description: 'Full VPS backup every week', taskType: 'STORAGE_BACKUP', scheduleType: 'WEEKLY', cronExpression: '0 3 * * 0' },
  { name: 'Nightly Restart', description: 'Restart VPS nightly at 04:00', taskType: 'POWER_RESTART', scheduleType: 'DAILY', cronExpression: '0 4 * * *' },
  { name: 'Daily apt update', description: 'Run apt update & upgrade daily', taskType: 'EXECUTION_SHELL_COMMAND', scheduleType: 'DAILY', cronExpression: '0 3 * * *', shellCommand: 'apt update && apt upgrade -y' },
  { name: 'Weekly Docker Cleanup', description: 'Clean unused Docker resources', taskType: 'EXECUTION_SHELL_COMMAND', scheduleType: 'WEEKLY', cronExpression: '0 2 * * 0', shellCommand: 'docker system prune -af --volumes' },
  { name: 'Monthly Snapshot', description: 'Monthly snapshot checkpoint', taskType: 'STORAGE_SNAPSHOT', scheduleType: 'MONTHLY', cronExpression: '0 2 1 * *' },
];

const TASK_TYPES = Object.keys(TASK_TYPE_LABELS).map(k => ({ value: k, label: TASK_TYPE_LABELS[k] }));
const SCHEDULE_TYPES = [
  { value: 'ONCE', label: 'Once' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'CUSTOM_CRON', label: 'Custom Cron' },
];
const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland'];

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

const Badge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${STATUS_COLORS[status] || 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30'}`}>
    {status}
  </span>
);

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    QUEUED: 'bg-yellow-400', RUNNING: 'bg-blue-400', COMPLETED: 'bg-emerald-400',
    FAILED: 'bg-red-400', CANCELLED: 'bg-neutral-500', RETRYING: 'bg-orange-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || 'bg-neutral-500'} mr-2`} />;
};

const formatDuration = (ms: number | null) => {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
};

export const AutomationPage: React.FC = () => {
  const { id: instanceId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('tasks');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showChainDialog, setShowChainDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [editingTask, setEditingTask] = useState<any>(null);

  const [form, setForm] = useState({
    name: '', description: '', taskType: 'POWER_RESTART', scheduleType: 'DAILY',
    cronExpression: '0 3 * * *', timezone: 'UTC', retries: 0, retryDelay: 60000,
    timeout: 300000, enabled: true, notifyOnSuccess: true, notifyOnFailure: true,
    shellCommand: '', hostname: '', deleteOlderThan: 30,
    parentTaskId: '', chainStep: 1, stopOnFailure: true,
  });

  const fetchData = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    try {
      const [tasksData, runsData, summaryData] = await Promise.all([
        api(`/api/v1/automation/instances/${instanceId}/tasks`),
        api(`/api/v1/automation/instances/${instanceId}/runs`),
        api(`/api/v1/automation/instances/${instanceId}/summary`),
      ]);
      setTasks(tasksData);
      setRuns(runsData.runs || []);
      setSummary(summaryData);
    } catch (err: any) {
      console.error('Failed to load automation data:', err);
    }
    setLoading(false);
  }, [instanceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceId) return;
    try {
      await api(`/api/v1/automation/instances/${instanceId}/tasks`, {
        method: 'POST', body: JSON.stringify(form),
      });
      setShowCreateDialog(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateFromTemplate = async (idx: number) => {
    if (!instanceId) return;
    try {
      await api(`/api/v1/automation/instances/${instanceId}/tasks/from-template`, {
        method: 'POST', body: JSON.stringify({ templateIndex: idx }),
      });
      setShowTemplateDialog(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRunTask = async (taskId: string, destructive: boolean) => {
    if (destructive && !confirm('This is a destructive action. Are you sure you want to proceed?')) return;
    try {
      await api(`/api/v1/automation/tasks/${taskId}/run`, {
        method: 'POST', body: JSON.stringify({ confirm: destructive }),
      });
      fetchData();
    } catch (err: any) {
      if (err.message.includes('requiresConfirm')) {
        if (confirm('This action is destructive. Confirm?')) {
          await api(`/api/v1/automation/tasks/${taskId}/run`, {
            method: 'POST', body: JSON.stringify({ confirm: true }),
          });
          fetchData();
        }
      } else {
        alert(err.message);
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Delete this automation task permanently?')) return;
    try {
      await api(`/api/v1/automation/tasks/${taskId}`, { method: 'DELETE' });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleTask = async (task: any) => {
    try {
      await api(`/api/v1/automation/tasks/${task.id}`, {
        method: 'PUT', body: JSON.stringify({ enabled: !task.enabled }),
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewRun = async (runId: string) => {
    try {
      const data = await api(`/api/v1/automation/runs/${runId}`);
      setSelectedRun(data);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRetryRun = async (runId: string) => {
    try {
      await api(`/api/v1/automation/runs/${runId}/retry`, { method: 'POST' });
      setSelectedRun(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const resetForm = () => {
    setForm({
      name: '', description: '', taskType: 'POWER_RESTART', scheduleType: 'DAILY',
      cronExpression: '0 3 * * *', timezone: 'UTC', retries: 0, retryDelay: 60000,
      timeout: 300000, enabled: true, notifyOnSuccess: true, notifyOnFailure: true,
      shellCommand: '', hostname: '', deleteOlderThan: 30,
      parentTaskId: '', chainStep: 1, stopOnFailure: true,
    });
  };

  if (!instanceId) {
    return <div className="p-8 text-neutral-500 text-center">No instance selected</div>;
  }

  const pendingRuns = runs.filter(r => r.status === 'QUEUED' || r.status === 'RUNNING');
  const failedRuns = runs.filter(r => r.status === 'FAILED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Automation</h2>
          <p className="text-sm text-neutral-400">Schedule and manage automated VPS tasks</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { resetForm(); setShowCreateDialog(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition">
            Create Task
          </button>
          <button onClick={() => setShowTemplateDialog(true)} className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl text-xs font-semibold transition">
            From Template
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Next Scheduled</p>
            <p className="text-sm font-semibold text-white mt-1">
              {summary.nextTask ? summary.nextTask.name : 'None'}
            </p>
            {summary.nextTask?.nextRunAt && (
              <p className="text-[10px] text-neutral-400 mt-0.5">
                {new Date(summary.nextTask.nextRunAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Last Run</p>
            <p className="text-sm font-semibold text-white mt-1">
              {summary.lastRun ? summary.lastRun.task?.name || '—' : '—'}
            </p>
            {summary.lastRun && (
              <Badge status={summary.lastRun.status} />
            )}
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Upcoming Tasks</p>
            <p className="text-2xl font-semibold text-white mt-1">{summary.upcomingTasks?.length || 0}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-[10px] text-neutral-500 uppercase font-semibold">Failed Tasks</p>
            <p className={`text-2xl font-semibold mt-1 ${summary.failedTasks > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {summary.failedTasks || 0}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 pb-1">
        {[
          { id: 'tasks', label: 'Tasks', count: tasks.length },
          { id: 'upcoming', label: 'Upcoming', count: summary?.upcomingTasks?.length || 0 },
          { id: 'history', label: 'History', count: runs.length },
          { id: 'failed', label: 'Failed', count: failedRuns.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition ${
              activeSubTab === tab.id
                ? 'bg-white/10 text-white border-b-2 border-blue-500'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[9px]">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* TASKS TAB */}
      {activeSubTab === 'tasks' && (
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-neutral-500 text-sm">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm border border-dashed border-white/10 rounded-xl">
              No automation tasks created yet. Click "Create Task" or "From Template" to get started.
            </div>
          ) : tasks.map(task => (
            <div key={task.id} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white truncate">{task.name}</h3>
                    <Badge status={task.status} />
                    <span className="text-[10px] text-neutral-500 bg-white/5 px-2 py-0.5 rounded-full">
                      {TASK_TYPE_LABELS[task.taskType] || task.taskType}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-neutral-400 mt-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-neutral-500">
                    <span>Schedule: {task.scheduleType || 'Manual'}</span>
                    {task.nextRunAt && <span>Next run: {new Date(task.nextRunAt).toLocaleString()}</span>}
                    {task.lastRunAt && <span>Last run: {new Date(task.lastRunAt).toLocaleString()}</span>}
                    {task.runs?.[0] && <Badge status={task.runs[0].status} />}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <button onClick={() => handleRunTask(task.id, DESTRUCTIVE_TASKS.has(task.taskType))}
                    className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg text-[10px] font-semibold transition">
                    Run
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={task.enabled} onChange={() => handleToggleTask(task)}
                      className="sr-only peer" />
                    <div className="w-8 h-4 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                  <button onClick={() => handleDeleteTask(task.id)}
                    className="p-1.5 text-neutral-500 hover:text-red-400 transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              {/* Chain indicator */}
              {task.parentTaskId && (
                <div className="mt-2 text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                  Chain step {task.chainStep} — Child of task {task.parentTaskId.slice(0, 8)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* UPCOMING TAB */}
      {activeSubTab === 'upcoming' && (
        <div className="space-y-3">
          {!summary?.upcomingTasks?.length ? (
            <div className="p-8 text-center text-neutral-500 text-sm border border-dashed border-white/10 rounded-xl">
              No upcoming scheduled tasks
            </div>
          ) : summary.upcomingTasks.map((task: any) => (
            <div key={task.id} className="bg-white/5 rounded-xl p-4 border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{task.name}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">
                  {TASK_TYPE_LABELS[task.taskType] || task.taskType}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-400 font-medium">
                  {task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeSubTab === 'history' && (
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-neutral-500">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm border border-dashed border-white/10 rounded-xl">No execution history</div>
          ) : runs.map(run => (
            <div
              key={run.id}
              onClick={() => handleViewRun(run.id)}
              className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusDot status={run.status} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{run.task?.name || 'Unknown Task'}</p>
                    <p className="text-[10px] text-neutral-400">
                      {new Date(run.createdAt).toLocaleString()} · {formatDuration(run.duration)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={run.status} />
                  <span className="text-[10px] text-neutral-500 bg-white/5 px-2 py-0.5 rounded">{run.triggeredBy}</span>
                </div>
              </div>
              {run.exitCode !== null && (
                <p className="mt-1 text-[10px] text-neutral-500">Exit code: {run.exitCode}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* FAILED TAB */}
      {activeSubTab === 'failed' && (
        <div className="space-y-3">
          {failedRuns.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm border border-dashed border-white/10 rounded-xl">No failed jobs</div>
          ) : failedRuns.map(run => (
            <div key={run.id} className="bg-red-500/5 rounded-xl p-4 border border-red-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{run.task?.name || 'Unknown Task'}</p>
                  <p className="text-xs text-red-400 mt-0.5">{run.errorMessage || 'Unknown error'}</p>
                  <p className="text-[10px] text-neutral-500 mt-1">{new Date(run.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleViewRun(run.id); }}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-medium transition">
                    View
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleRetryRun(run.id); }}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-[10px] font-medium transition">
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white/5 rounded-xl p-4 border border-white/10">
        <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          {TASK_TEMPLATES.map((tmpl, i) => (
            <button
              key={i}
              onClick={() => handleCreateFromTemplate(i)}
              className="px-3 py-1.5 bg-neutral-700/50 hover:bg-neutral-700 text-white rounded-lg text-[10px] font-medium transition border border-white/10"
            >
              {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* CREATE TASK DIALOG */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">Create Automation Task</h2>
                <button onClick={() => setShowCreateDialog(false)} className="text-neutral-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Task Name *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Task Type *</label>
                  <select value={form.taskType} onChange={e => setForm({...form, taskType: e.target.value})}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none">
                    {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Schedule Type</label>
                  <select value={form.scheduleType} onChange={e => setForm({...form, scheduleType: e.target.value})}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none">
                    {SCHEDULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {form.scheduleType === 'CUSTOM_CRON' && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Cron Expression</label>
                    <input value={form.cronExpression} onChange={e => setForm({...form, cronExpression: e.target.value})}
                      placeholder="0 3 * * *"
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Timezone</label>
                  <select value={form.timezone} onChange={e => setForm({...form, timezone: e.target.value})}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none">
                    {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {form.taskType === 'EXECUTION_SHELL_COMMAND' && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Shell Command *</label>
                    <textarea value={form.shellCommand} onChange={e => setForm({...form, shellCommand: e.target.value})} rows={3}
                      placeholder="apt update && apt upgrade -y"
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white font-mono focus:border-blue-500 focus:outline-none" />
                  </div>
                )}
                {form.taskType === 'MAINTENANCE_CHANGE_HOSTNAME' && (
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-300 mb-1">New Hostname *</label>
                    <input value={form.hostname} onChange={e => setForm({...form, hostname: e.target.value})}
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none" />
                  </div>
                )}
                {(form.taskType === 'STORAGE_DELETE_OLD_BACKUPS' || form.taskType === 'STORAGE_DELETE_OLD_SNAPSHOTS') && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">Delete older than (days)</label>
                    <input type="number" value={form.deleteOlderThan} onChange={e => setForm({...form, deleteOlderThan: parseInt(e.target.value, 10)})}
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Max Retries</label>
                  <input type="number" value={form.retries} onChange={e => setForm({...form, retries: parseInt(e.target.value, 10)})}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Timeout (ms)</label>
                  <input type="number" value={form.timeout} onChange={e => setForm({...form, timeout: parseInt(e.target.value, 10)})}
                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.notifyOnSuccess} onChange={e => setForm({...form, notifyOnSuccess: e.target.checked})}
                    className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-neutral-300">Notify on success</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.notifyOnFailure} onChange={e => setForm({...form, notifyOnFailure: e.target.checked})}
                    className="rounded bg-neutral-800 border-neutral-700 text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-neutral-300">Notify on failure</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setShowCreateDialog(false)}
                  className="px-4 py-2 text-xs text-neutral-300 hover:text-white transition">
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition">
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE DIALOG */}
      {showTemplateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTemplateDialog(false)}>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">Task Templates</h2>
                <button onClick={() => setShowTemplateDialog(false)} className="text-neutral-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {TASK_TEMPLATES.map((tmpl, i) => (
                <div
                  key={i}
                  onClick={() => handleCreateFromTemplate(i)}
                  className="bg-white/5 hover:bg-white/10 rounded-xl p-4 border border-white/10 cursor-pointer transition"
                >
                  <p className="text-sm font-semibold text-white">{tmpl.name}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">{tmpl.description}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-neutral-300">{TASK_TYPE_LABELS[tmpl.taskType]}</span>
                    <span className="text-[9px] bg-white/10 px-2 py-0.5 rounded text-neutral-300">{tmpl.scheduleType}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* RUN DETAILS DIALOG */}
      {selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedRun(null)}>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-white">Run Details</h2>
                <button onClick={() => setSelectedRun(null)} className="text-neutral-400 hover:text-white transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-neutral-500">Status</p>
                  <Badge status={selectedRun.status} />
                </div>
                <div>
                  <p className="text-neutral-500">Triggered By</p>
                  <p className="text-white font-medium capitalize">{selectedRun.triggeredBy}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Started</p>
                  <p className="text-white">{selectedRun.startedAt ? new Date(selectedRun.startedAt).toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Finished</p>
                  <p className="text-white">{selectedRun.finishedAt ? new Date(selectedRun.finishedAt).toLocaleString() : '—'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Duration</p>
                  <p className="text-white">{formatDuration(selectedRun.duration)}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Exit Code</p>
                  <p className="text-white font-mono">{selectedRun.exitCode !== null ? selectedRun.exitCode : '—'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Attempt</p>
                  <p className="text-white">{selectedRun.attempt}/{selectedRun.maxAttempts}</p>
                </div>
              </div>

              {selectedRun.errorMessage && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1">Error</p>
                  <p className="text-xs text-red-400 font-mono">{selectedRun.errorMessage}</p>
                </div>
              )}

              {selectedRun.consoleOutput && (
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1">Console Output</p>
                  <pre className="bg-neutral-900 rounded-xl p-4 text-[10px] text-green-400 font-mono overflow-x-auto max-h-60 whitespace-pre-wrap">
                    {selectedRun.consoleOutput}
                  </pre>
                </div>
              )}

              {/* Logs */}
              {selectedRun.logs?.length > 0 && (
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase font-semibold mb-1">Logs</p>
                  <div className="bg-neutral-900 rounded-xl p-4 max-h-40 overflow-y-auto space-y-1">
                    {selectedRun.logs.map((log: any) => (
                      <div key={log.id} className="flex gap-2 text-[10px]">
                        <span className="text-neutral-500 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={`font-medium ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-blue-400'}`}>
                          [{log.level.toUpperCase()}]
                        </span>
                        <span className="text-neutral-300">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRun.status === 'FAILED' && (
                <div className="flex justify-end">
                  <button onClick={() => handleRetryRun(selectedRun.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition">
                    Retry Run
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationPage;
