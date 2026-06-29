import React, { useState } from 'react';
import { Play, RotateCw, AlertTriangle } from 'lucide-react';

export const JobsQueues: React.FC = () => {
  const [jobs] = useState([
    { id: '1', task: 'vzdump-backup-100', node: 'pve-node-1', status: 'completed', runtime: '48s', time: '10 mins ago' },
    { id: '2', task: 'lxc-create-101', node: 'pve-node-1', status: 'completed', runtime: '2m 14s', time: '1 hour ago' },
    { id: '3', task: 'lxc-destroy-99', node: 'pve-node-2', status: 'failed', runtime: '4s', time: '2 hours ago' }
  ]);

  return (
    <div className="space-y-6">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Jobs & Tasks Queue</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Monitor clustering tasks, vzdump background backups, and LXD execution queues.</p>
      </div>

      <div className="mx-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diagnostics Card */}
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Queue Diagnostics</h3>
          <div className="divide-y divide-neutral-800 text-xs">
            <div className="py-2.5 flex justify-between">
              <span className="text-neutral-400">Task Workers</span>
              <span className="font-semibold text-emerald-400">Idle</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-neutral-400">Active Handlers</span>
              <span className="font-semibold text-neutral-900 dark:text-white">0 running</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-neutral-400">Scheduled Backups</span>
              <span className="font-semibold text-neutral-900 dark:text-white">1 pending (02:00 AM)</span>
            </div>
          </div>
        </div>

        {/* Task history */}
        <div className="lg:col-span-2 bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <RotateCw className="text-blue-500" size={18} /> Task History Log
          </h3>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white">
                <tr>
                  <th className="p-3">Task Token</th>
                  <th className="p-3">Node Location</th>
                  <th className="p-3">Runtime</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Triggered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                {jobs.map(j => (
                  <tr key={j.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-mono text-neutral-900 dark:text-white">{j.task}</td>
                    <td className="p-3 font-medium">{j.node}</td>
                    <td className="p-3 text-neutral-400">{j.runtime}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        j.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-500">{j.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
export default JobsQueues;
