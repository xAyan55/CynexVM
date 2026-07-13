import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, Filter, Check, Trash2, ExternalLink, X, Calendar, AlertTriangle, Play, HelpCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

// Synthetic sound alert player (Web Audio API)
function playSynthAlert(profile: string) {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    if (profile === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880.00, now + 0.08); // A5
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (profile === 'warning') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440.00, now); // A4
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (profile === 'error' || profile === 'critical') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220.00, now); // A3
      osc.frequency.setValueAtTime(220.00, now + 0.12);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440.00, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (_) {}
}

export const NotificationDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const socket = useSocket();
  
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<any>(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  
  // Pagination & Loading States
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      fetchNotifications(1, true);
      fetchPreferences();
    }
  }, [isOpen, readFilter, categoryFilter, priorityFilter, search]);

  useEffect(() => {
    fetchUnreadCount();
    fetchPreferences();
  }, []);

  // Listen to live Socket.IO notification events
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notif: any) => {
      // Play synthetic notification tone based on priority
      if (preferences?.soundEnabled) {
        const soundMap: Record<string, string> = {
          'Success': 'success',
          'Warning': 'warning',
          'Error': 'error',
          'Critical': 'critical',
          'Info': 'default'
        };
        playSynthAlert(soundMap[notif.priority] || 'default');
      }

      // Trigger standard browser desktop notification if allowed
      if (preferences?.desktopEnabled && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        new Notification(notif.title, {
          body: notif.message,
          icon: '/assets/logo.png'
        });
      }

      // Prepend to list & bump unread count
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    const handleSyncNotification = (sync: any) => {
      if (sync.action === 'read') {
        setNotifications(prev => prev.map(n => n.id === sync.id ? { ...n, read: true } : n));
        fetchUnreadCount();
      } else if (sync.action === 'read-all') {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      } else if (sync.action === 'delete') {
        setNotifications(prev => prev.filter(n => n.id !== sync.id));
        fetchUnreadCount();
      } else if (sync.action === 'delete-all-read') {
        setNotifications(prev => prev.filter(n => !n.read));
      }
    };

    socket.on('notification.new', handleNewNotification);
    socket.on('notification.sync', handleSyncNotification);

    return () => {
      socket.off('notification.new', handleNewNotification);
      socket.off('notification.sync', handleSyncNotification);
    };
  }, [socket, preferences]);

  const fetchPreferences = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data);
      }
    } catch (_) {}
  };

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/unread', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (_) {}
  };

  const fetchNotifications = async (targetPage = 1, clearExisting = false) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      let url = `/api/v1/notifications?page=${targetPage}&limit=15`;
      if (readFilter !== 'all') url += `&read=${readFilter === 'read'}`;
      if (categoryFilter) url += `&category=${categoryFilter}`;
      if (priorityFilter) url += `&priority=${priorityFilter}`;
      if (search) url += `&q=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (clearExisting) {
          setNotifications(data.items);
        } else {
          setNotifications(prev => [...prev, ...data.items]);
        }
        setPage(data.page);
        setTotalPages(data.totalPages);
      }
    } catch (_) {}
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/notifications/read/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        fetchUnreadCount();
      }
    } catch (_) {}
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch (_) {}
  };

  const deleteNotification = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v1/notifications/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        fetchUnreadCount();
      }
    } catch (_) {}
  };

  const pruneAllRead = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/read', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => !n.read));
      }
    } catch (_) {}
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Success': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'Warning': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'Error': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'Critical': return 'bg-red-600/20 text-red-500 border-red-600/40 animate-pulse';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatRelativeTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    const diffHr = Math.round(diffMin / 60);
    const diffDay = Math.round(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  };

  // Group notifications into Date categories
  const groupNotificationsByDate = () => {
    const today: any[] = [];
    const yesterday: any[] = [];
    const earlier: any[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    notifications.forEach(n => {
      const ts = new Date(n.createdAt).getTime();
      if (ts >= startOfToday) {
        today.push(n);
      } else if (ts >= startOfYesterday) {
        yesterday.push(n);
      } else {
        earlier.push(n);
      }
    });

    return { today, yesterday, earlier };
  };

  const grouped = groupNotificationsByDate();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-neutral-900 border-l border-neutral-800 text-neutral-300 flex flex-col h-full shadow-2xl">
          
          {/* Header Panel */}
          <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Bell size={16} /> Notification Center
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">Manage and view system event dispatches.</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Search and Filters */}
          <div className="p-4 border-b border-neutral-800 bg-neutral-950/40 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-neutral-500" />
              <input 
                type="text" 
                placeholder="Search events, instances or messages..."
                className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-neutral-700 transition"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <select 
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 focus:outline-none text-neutral-400"
                value={readFilter}
                onChange={e => setReadFilter(e.target.value as any)}
              >
                <option value="all">All Statuses</option>
                <option value="unread">Unread Only</option>
                <option value="read">Read Only</option>
              </select>

              <select 
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 focus:outline-none text-neutral-400"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">Categories</option>
                <option value="System">System</option>
                <option value="Instance">Instance</option>
                <option value="Deployment">Deployment</option>
                <option value="Backup">Backup</option>
                <option value="Snapshot">Snapshot</option>
                <option value="Node">Node</option>
                <option value="Security">Security</option>
                <option value="Account">Account</option>
              </select>

              <select 
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 focus:outline-none text-neutral-400"
                value={priorityFilter}
                onChange={e => setPriorityFilter(e.target.value)}
              >
                <option value="">Priorities</option>
                <option value="Info">Info</option>
                <option value="Success">Success</option>
                <option value="Warning">Warning</option>
                <option value="Error">Error</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex items-center justify-between text-[11px] pt-1">
              <button 
                onClick={markAllAsRead}
                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
              >
                <Check size={12} /> Mark All Read
              </button>
              <button 
                onClick={pruneAllRead}
                className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
              >
                <Trash2 size={12} /> Prune Read
              </button>
            </div>
          </div>

          {/* List Viewport */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {loading && notifications.length === 0 ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse bg-neutral-950/40 p-4 border border-neutral-800 rounded-xl space-y-3">
                    <div className="flex justify-between">
                      <div className="h-4 bg-neutral-800 rounded w-1/3"></div>
                      <div className="h-3 bg-neutral-800 rounded w-1/12"></div>
                    </div>
                    <div className="h-3 bg-neutral-800 rounded w-5/6"></div>
                    <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-20 text-neutral-500 space-y-3">
                <Bell size={24} className="mx-auto text-neutral-600 animate-bounce" />
                <p className="text-xs">No notifications found.</p>
                <p className="text-[10px] text-neutral-600">Muted events or broad filters may affect history lists.</p>
              </div>
            ) : (
              <>
                {/* TODAY SECTION */}
                {grouped.today.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar size={12} /> Today
                    </h3>
                    <div className="space-y-2">
                      {grouped.today.map(n => renderNotificationCard(n))}
                    </div>
                  </div>
                )}

                {/* YESTERDAY SECTION */}
                {grouped.yesterday.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar size={12} /> Yesterday
                    </h3>
                    <div className="space-y-2">
                      {grouped.yesterday.map(n => renderNotificationCard(n))}
                    </div>
                  </div>
                )}

                {/* EARLIER SECTION */}
                {grouped.earlier.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar size={12} /> Earlier
                    </h3>
                    <div className="space-y-2">
                      {grouped.earlier.map(n => renderNotificationCard(n))}
                    </div>
                  </div>
                )}

                {/* Pagination triggers */}
                {page < totalPages && (
                  <button 
                    onClick={() => fetchNotifications(page + 1)}
                    className="w-full py-2 bg-neutral-950/40 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-750 text-neutral-400 text-xs font-semibold rounded-xl transition"
                  >
                    {loading ? 'Loading...' : 'Load More Notifications'}
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );

  function renderNotificationCard(n: any) {
    const isCritical = n.priority === 'Critical';
    const isGrouped = n.metadata && JSON.parse(n.metadata).groupItems;
    let groupItems: any[] = [];
    if (isGrouped) {
      try {
        groupItems = JSON.parse(n.metadata).groupItems || [];
      } catch (_) {}
    }

    const cardBorder = isCritical
      ? 'border-red-500/50 bg-red-950/10'
      : n.read
        ? 'border-neutral-800 bg-neutral-950/10 opacity-70 hover:opacity-100'
        : 'border-neutral-800 bg-neutral-950/40';

    return (
      <div 
        key={n.id} 
        className={`p-4 border rounded-xl text-xs space-y-2 relative transition ${cardBorder}`}
      >
        {/* Read State Dot Indicator */}
        {!n.read && (
          <span className="absolute top-4 left-3 h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
        )}

        <div className="flex justify-between items-start gap-4 pl-3">
          <div className="space-y-0.5">
            <p className="font-semibold text-white flex items-center gap-1.5">
              {n.title}
            </p>
            <p className="text-neutral-400 leading-relaxed">{n.message}</p>
          </div>
          <span className="text-[10px] text-neutral-500 shrink-0 font-medium">{formatRelativeTime(n.createdAt)}</span>
        </div>

        {/* Dynamic Accordion Group View */}
        {isGrouped && (
          <div className="mt-2 bg-neutral-900/40 p-2.5 rounded-lg border border-neutral-800/50 space-y-2 pl-3">
            <button 
              type="button"
              onClick={() => toggleGroup(n.id)}
              className="text-[10px] font-bold text-neutral-400 hover:text-white flex items-center gap-1"
            >
              {expandedGroups[n.id] ? 'Collapse grouped events' : `Expand ${groupItems.length + 1} related events`}
            </button>

            {expandedGroups[n.id] && (
              <div className="space-y-2 pt-2 divide-y divide-neutral-800/40">
                {groupItems.map((item, idx) => (
                  <div key={idx} className="pt-2 text-[10px] text-neutral-400 space-y-0.5">
                    <p className="font-semibold text-neutral-350">{item.title}</p>
                    <p>{item.message}</p>
                    <p className="text-neutral-550 text-[9px]">{formatRelativeTime(item.timestamp)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Priority & Category Badges Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pl-3">
          <div className="flex gap-2">
            <span className="px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded-full text-[9px] border border-neutral-700/30">
              {n.category}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9px] border ${getPriorityColor(n.priority)}`}>
              {n.priority}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {n.actionUrl && (
              <a 
                href={n.actionUrl}
                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
              >
                Launch <ExternalLink size={10} />
              </a>
            )}
            {!n.read && (
              <button 
                onClick={() => markAsRead(n.id)}
                className="text-neutral-400 hover:text-white font-medium"
              >
                Mark Read
              </button>
            )}
            <button 
              onClick={() => deleteNotification(n.id)}
              className="text-neutral-500 hover:text-red-400 transition"
              title="Delete Notification"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const socket = useSocket();

  useEffect(() => {
    fetchUnreadCount();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNew = () => setUnreadCount(prev => prev + 1);
    const handleSync = (sync: any) => {
      if (sync.action === 'read-all') {
        setUnreadCount(0);
      } else {
        fetchUnreadCount();
      }
    };

    socket.on('notification.new', handleNew);
    socket.on('notification.sync', handleSync);

    return () => {
      socket.off('notification.new', handleNew);
      socket.off('notification.sync', handleSync);
    };
  }, [socket]);

  const fetchUnreadCount = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/unread', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (_) {}
  };

  return (
    <>
      <button 
        onClick={() => {
          setIsOpen(true);
          // Request browser notifications permission if not set
          if (Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }}
        className="relative p-2 rounded-xl border border-neutral-300 dark:border-white/5 bg-transparent hover:border-neutral-400 dark:hover:border-neutral-300/10 text-neutral-800 dark:text-white transition"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-neutral-900 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      <NotificationDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
