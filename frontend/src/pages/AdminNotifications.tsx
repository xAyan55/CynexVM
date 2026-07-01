import React, { useState, useEffect } from 'react';
import { Megaphone, Activity, BarChart2, CheckCircle, AlertTriangle, Users, Settings, Plus, Send } from 'lucide-react';

export const AdminNotifications: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Announcement Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'banner' | 'maintenance' | 'emergency'>('banner');
  const [targetAudience, setTargetAudience] = useState<'all' | 'admins' | 'roles' | 'users'>('all');
  const [targetValue, setTargetValue] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/admin/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (_) {}
    setLoadingAnalytics(false);
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) return;
    setDispatching(true);
    setSuccessMsg('');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/admin/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          message,
          type,
          targetAudience,
          targetValue: targetValue || null,
          scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
          scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null
        })
      });

      if (res.ok) {
        setSuccessMsg('Announcement successfully dispatched to target audiences!');
        setTitle('');
        setMessage('');
        setTargetValue('');
        setScheduledStart('');
        setScheduledEnd('');
        fetchAnalytics();
      } else {
        alert('Failed to dispatch broadcast');
      }
    } catch (_) {
      alert('Failed to dispatch broadcast');
    }
    setDispatching(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-6 lg:px-8 pb-12 font-sans">
      
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center pt-5 justify-between gap-4">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Announcements & Delivery Analytics</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Monitor persistent queue delivery statistics, read rates, and dispatch system-wide announcement banners.</p>
        </div>
      </div>

      {successMsg && (
        <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
          {successMsg}
        </p>
      )}

      {/* Analytics Widgets Dashboard */}
      {loadingAnalytics && !analytics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl p-5 h-24"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <div className="bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-neutral-500 font-semibold uppercase tracking-wider">Total Dispatch Flow</p>
              <h3 className="text-xl font-bold text-white mt-1">{analytics?.totalSent || 0}</h3>
            </div>
            <Activity className="text-blue-500" size={24} />
          </div>

          <div className="bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-neutral-500 font-semibold uppercase tracking-wider">User Read Rate</p>
              <h3 className="text-xl font-bold text-white mt-1">{(analytics?.readRate || 0).toFixed(1)}%</h3>
            </div>
            <BarChart2 className="text-emerald-500" size={24} />
          </div>

          <div className="bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-neutral-500 font-semibold uppercase tracking-wider">Failed Deliveries</p>
              <h3 className="text-xl font-bold text-white mt-1">{analytics?.deliveries?.failed || 0}</h3>
            </div>
            <AlertTriangle className="text-rose-500" size={24} />
          </div>

          <div className="bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-neutral-500 font-semibold uppercase tracking-wider">Avg Read Time</p>
              <h3 className="text-xl font-bold text-white mt-1">{(analytics?.avgReadTimeSec || 0).toFixed(1)}s</h3>
            </div>
            <CheckCircle className="text-purple-500" size={24} />
          </div>

        </div>
      )}

      {/* Row 2: Dispatch Form (Left) & Delivery Queue Health Breakdown (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Announcement Broadcast Form */}
        <div className="lg:col-span-2 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl flex flex-col p-5 space-y-4">
          <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-white/5">
            <Megaphone size={16} /> Broadcast Custom Announcement
          </h2>

          <form onSubmit={handleBroadcast} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-400 mb-1">Announcement Title</label>
                <input 
                  type="text" 
                  placeholder="Maintenance Window / System Alert"
                  className="w-full al-input" 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Alert Category Style</label>
                <select className="w-full al-input" value={type} onChange={e => setType(e.target.value as any)}>
                  <option value="banner">Information Banner (Blue)</option>
                  <option value="maintenance">Maintenance Notice (Yellow)</option>
                  <option value="emergency">Emergency Alert (Red)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Announcement Message Body</label>
              <textarea 
                rows={3} 
                placeholder="Type the message details here..."
                className="w-full al-input resize-none" 
                value={message} 
                onChange={e => setMessage(e.target.value)} 
                required 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-400 mb-1">Target Audience Scope</label>
                <select className="w-full al-input" value={targetAudience} onChange={e => setTargetAudience(e.target.value as any)}>
                  <option value="all">All Registered Users</option>
                  <option value="admins">System Administrators Only</option>
                  <option value="users">Specific User IDs list</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Target Audience Values (Optional)</label>
                <input 
                  type="text" 
                  placeholder="Comma-separated IDs (e.g. user-id-1, user-id-2)" 
                  className="w-full al-input" 
                  value={targetValue} 
                  onChange={e => setTargetValue(e.target.value)} 
                  disabled={targetAudience === 'all' || targetAudience === 'admins'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-400 mb-1">Scheduled Start Time (Optional)</label>
                <input 
                  type="datetime-local" 
                  className="w-full al-input" 
                  value={scheduledStart} 
                  onChange={e => setScheduledStart(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Scheduled End Time (Optional)</label>
                <input 
                  type="datetime-local" 
                  className="w-full al-input" 
                  value={scheduledEnd} 
                  onChange={e => setScheduledEnd(e.target.value)} 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={dispatching}
              className="w-full py-3 bg-blue-600 hover:bg-blue-750 text-white rounded-xl font-semibold shadow transition disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Send size={14} /> {dispatching ? 'Dispatching Broadcast...' : 'Broadcast Announcement'}
            </button>
          </form>
        </div>

        {/* Queue Health & Channel Performance details */}
        <div className="bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/5 rounded-xl flex flex-col p-5 space-y-4">
          <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-white/5">
            <Settings size={16} /> Delivery Queue Health
          </h2>

          <div className="space-y-4 text-xs flex-1 flex flex-col justify-center">
            
            <div className="space-y-2">
              <div className="flex justify-between text-neutral-400">
                <span>Successful deliveries</span>
                <span className="font-semibold text-white">{analytics?.deliveries?.success || 0}</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: `${analytics?.deliveries?.total > 0 ? (analytics.deliveries.success / analytics.deliveries.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-neutral-400">
                <span>Pending retry queue</span>
                <span className="font-semibold text-white">{analytics?.deliveries?.pending || 0}</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 animate-pulse" 
                  style={{ width: `${analytics?.deliveries?.total > 0 ? (analytics.deliveries.pending / analytics.deliveries.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-neutral-400">
                <span>Dead-letter queue (Failed)</span>
                <span className="font-semibold text-white">{analytics?.deliveries?.failed || 0}</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500" 
                  style={{ width: `${analytics?.deliveries?.total > 0 ? (analytics.deliveries.failed / analytics.deliveries.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Category Distribution Lists */}
            <div className="pt-4 border-t border-neutral-800">
              <p className="font-semibold text-neutral-450 uppercase text-[10px] tracking-wider mb-2">Category Distribution</p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {analytics?.categories?.map((c: any) => (
                  <div key={c.name} className="flex justify-between items-center py-0.5 text-neutral-450 border-b border-neutral-800/20 last:border-b-0">
                    <span className="font-medium text-white">{c.name}</span>
                    <span className="bg-neutral-800 px-2 py-0.5 rounded text-[10px] text-neutral-300 font-semibold">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
export default AdminNotifications;
