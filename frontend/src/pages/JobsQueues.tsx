import React, { useState, useEffect } from 'react';
import { RotateCw, Terminal, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface TaskLog {
  timestamp: string;
  level: string;
  message: string;
}

interface Task {
  id: string;
  name: string;
  vmid?: number;
  userId?: string;
  username: string;
  nodeName: string;
  status: 'queued' | 'validating' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStage: string;
  currentStep: string;
  durationMs: number;
  logs: TaskLog[];
  failedReason?: string;
  createdAt: string;
}

export const JobsQueues: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/instances/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.reverse()); // Show newest first
        
        // Keep selected task detailed logs in sync
        if (selectedTask) {
          const freshSelected = data.find((t: Task) => t.id === selectedTask.id);
          if (freshSelected) {
            setSelectedTask(freshSelected);
          }
        }
      }
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [selectedTask]);

  return (
    <div className="space-y-6">
      <div className="px-8 pt-5 flex justify-between items-center">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Jobs & Tasks Log</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Monitor hypervisor virtualization operations, deployment status, and LXD task queues.</p>
        </div>
        <button 
          onClick={fetchTasks}
          className="p-2 hover:bg-neutral-200 dark:hover:bg-white/5 rounded-xl border border-neutral-350 dark:border-white/5 text-neutral-800 dark:text-white"
        >
          <RotateCw size={14} className="animate-spin" />
        </button>
      </div>

      <div className="mx-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Tasks list table */}
        <div className="lg:col-span-2 bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            Active Tasks Queue
          </h3>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="p-3">Task ID</th>
                  <th className="p-3">Operation</th>
                  <th className="p-3">Target VMID</th>
                  <th className="p-3">Progress</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-300">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-neutral-500">Querying active task states...</td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-neutral-500">No recent tasks logged.</td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr 
                      key={task.id} 
                      onClick={() => setSelectedTask(task)}
                      className={`hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer transition-colors ${
                        selectedTask?.id === task.id ? 'bg-neutral-100/80 dark:bg-white/5' : ''
                      }`}
                    >
                      <td className="p-3 font-mono font-bold text-neutral-900 dark:text-white">{task.id}</td>
                      <td className="p-3 font-medium">{task.name}</td>
                      <td className="p-3 font-mono">{task.vmid || 'N/A'}</td>
                      <td className="p-3">
                        <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              task.status === 'failed' ? 'bg-rose-500' :
                              task.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-neutral-400 mt-1 block">{task.progress}% - {task.currentStage}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                          task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          task.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Detailed logs terminal */}
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-lg space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <Terminal size={16} className="text-blue-500" /> Console Logs Viewer
          </h3>

          {selectedTask ? (
            <div className="space-y-4">
              <div className="p-3 bg-neutral-100 dark:bg-black/40 rounded-xl space-y-2 border border-neutral-250 dark:border-neutral-800/20">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Operation:</span>
                  <span className="font-semibold text-neutral-800 dark:text-white">{selectedTask.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Host Node:</span>
                  <span className="font-semibold text-neutral-800 dark:text-white">{selectedTask.nodeName}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Duration:</span>
                  <span className="font-semibold text-neutral-800 dark:text-white">{(selectedTask.durationMs / 1000).toFixed(1)}s</span>
                </div>
              </div>

              {/* Logs terminal layout */}
              <div className="bg-[#0b0c10] border border-neutral-800 rounded-xl p-4 font-mono text-[10px] text-zinc-300 h-64 overflow-y-auto space-y-2 shadow-inner">
                {selectedTask.logs.map((log, index) => (
                  <div key={index} className="flex gap-2">
                    <span className="text-neutral-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warning' ? 'text-yellow-400' : 'text-emerald-400'}>
                      {log.level === 'error' ? '✖' : '✔'}
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
                {selectedTask.status === 'running' && (
                  <div className="flex gap-2 items-center text-blue-400">
                    <Loader2 size={10} className="animate-spin" />
                    <span>Processing stage: {selectedTask.currentStep}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-neutral-500 flex flex-col items-center gap-2">
              <Terminal size={32} className="text-neutral-600" />
              <p className="text-xs">Select a task from the queue to stream its logs terminal.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default JobsQueues;
