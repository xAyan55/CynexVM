import React, { useState, useEffect } from 'react';
import { Save, Volume2, Bell, Shield, Mail, Globe, Clock, Settings, VolumeX, Eye } from 'lucide-react';
import { DEFAULT_EVENT_PREFERENCES } from '../../../backend/src/services/notification/notificationPreferences';

// Simple event mapping names for human-readable display
const EVENT_LABELS: Record<string, string> = {
  'instance.created': 'VPS Created',
  'instance.deleted': 'VPS Destroyed',
  'instance.started': 'VPS Started',
  'instance.stopped': 'VPS Stopped',
  'instance.rebooted': 'VPS Restarted',
  'instance.killed': 'VPS Force Killed',
  'instance.suspended': 'VPS Suspended',
  'deployment.started': 'Deployment Started',
  'deployment.completed': 'Deployment Completed',
  'deployment.failed': 'Deployment Failed',
  'backup.started': 'Backup Initiated',
  'backup.completed': 'Backup Completed',
  'backup.failed': 'Backup Failed',
  'snapshot.created': 'Snapshot Created',
  'snapshot.restored': 'Snapshot Restored',
  'snapshot.deleted': 'Snapshot Deleted',
  'image.download_finished': 'OS Template Cached',
  'image.download_failed': 'Template Download Failed',
  'node.online': 'Host Node Online',
  'node.offline': 'Host Node Offline',
  'node.high_cpu': 'High CPU Utilization',
  'node.high_ram': 'High RAM Utilization',
  'node.low_disk': 'Low Disk Storage Space',
  'node.maintenance': 'Node Maintenance Mode',
  'user.registered': 'User Registered',
  'user.login': 'User Access Logged',
  'user.login_failed': 'Failed Access Challenge',
  'user.password_changed': 'Password Updated',
  'user.email_changed': 'Email Address Changed',
  'user.api_token_created': 'API Token Created',
  'user.api_token_deleted': 'API Token Revoked',
  'system.announcement': 'System Announcement',
  'system.maintenance': 'Maintenance Notice',
  'system.update_available': 'Control Panel Update',
  'task.completed': 'Background Task Completed',
  'task.failed': 'Background Task Failed'
};

export const NotificationSettings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // States
  const [desktopEnabled, setDesktopEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundProfile, setSoundProfile] = useState('default');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  
  const [mutedCategories, setMutedCategories] = useState<string[]>([]);
  const [muteUntil, setMuteUntil] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);
  const [eventPreferences, setEventPreferences] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/preferences', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDesktopEnabled(data.desktopEnabled);
        setSoundEnabled(data.soundEnabled);
        setSoundProfile(data.soundProfile);
        setEmailEnabled(data.emailEnabled);
        setDiscordEnabled(data.discordEnabled);
        setDiscordWebhookUrl(data.discordWebhookUrl || '');
        setWebhookEnabled(data.webhookEnabled);
        setWebhookUrl(data.webhookUrl || '');
        setRetentionDays(data.retentionDays);
        
        if (data.muteUntil) {
          setMuteUntil(new Date(data.muteUntil).toISOString().slice(0, 16));
        } else {
          setMuteUntil('');
        }

        try {
          setMutedCategories(JSON.parse(data.mutedCategories || '[]'));
        } catch (_) {
          setMutedCategories([]);
        }

        try {
          const parsedPrefs = JSON.parse(data.eventPreferences || '{}');
          // Merge defaults with user prefs
          const merged = { ...DEFAULT_EVENT_PREFERENCES, ...parsedPrefs };
          setEventPreferences(merged);
        } catch (_) {
          setEventPreferences(DEFAULT_EVENT_PREFERENCES);
        }
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          desktopEnabled,
          soundEnabled,
          soundProfile,
          emailEnabled,
          discordEnabled,
          discordWebhookUrl,
          webhookEnabled,
          webhookUrl,
          mutedCategories: JSON.stringify(mutedCategories),
          muteUntil: muteUntil ? new Date(muteUntil).toISOString() : null,
          retentionDays,
          eventPreferences: JSON.stringify(eventPreferences)
        })
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      } else {
        alert('Failed to save notification preferences');
      }
    } catch (_) {
      alert('Failed to save notification preferences');
    }
    setSaving(false);
  };

  const toggleMutedCategory = (cat: string) => {
    if (mutedCategories.includes(cat)) {
      setMutedCategories(mutedCategories.filter(c => c !== cat));
    } else {
      setMutedCategories([...mutedCategories, cat]);
    }
  };

  const updateMatrixPreference = (eventKey: string, channel: 'panel' | 'websocket' | 'email' | 'discord' | 'webhook', val: boolean) => {
    setEventPreferences(prev => {
      const spec = prev[eventKey] || { panel: true, websocket: true, email: false, discord: false, webhook: false };
      return {
        ...prev,
        [eventKey]: {
          ...spec,
          [channel]: val
        }
      };
    });
  };

  if (loading) {
    return <div className="p-12 text-center text-neutral-500 text-xs">Querying preferences configuration...</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-6 lg:px-8 pb-12 font-sans">
      
      {/* Header View */}
      <div className="flex flex-col sm:flex-row sm:items-center pt-5 justify-between gap-4">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Notification Alert Preferences</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Configure real-time channels, sound profiles, generic webhooks, and granular per-event dispatch preferences.</p>
        </div>
        <button 
          type="submit" 
          form="preferences-form"
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs font-semibold shadow transition disabled:opacity-40 shrink-0"
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      <form id="preferences-form" onSubmit={handleSave} className="space-y-6">
        {success && (
          <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
            Preferences and custom channel dispatches updated successfully!
          </p>
        )}

        {/* Row 1: Channel Delivery Toggles & Advanced Retention Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          
          {/* Channel Settings */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm flex flex-col p-5 space-y-4">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-white/5">
              <Globe size={16} /> Delivery Channel Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40">
                <div>
                  <label className="block text-white font-medium">Desktop Notifications</label>
                  <span className="text-[10px] text-neutral-500">Live drawer alerts popup</span>
                </div>
                <input type="checkbox" checked={desktopEnabled} onChange={e => setDesktopEnabled(e.target.checked)} className="h-4 w-4 rounded bg-neutral-900 border-neutral-800" />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40">
                <div>
                  <label className="block text-white font-medium">SMTP Email Alerts</label>
                  <span className="text-[10px] text-neutral-500">Operational mail updates</span>
                </div>
                <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} className="h-4 w-4 rounded bg-neutral-900 border-neutral-800" />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40">
                <div>
                  <label className="block text-white font-medium">Discord Delivery</label>
                  <span className="text-[10px] text-neutral-500">Rich embeds in channel</span>
                </div>
                <input type="checkbox" checked={discordEnabled} onChange={e => setDiscordEnabled(e.target.checked)} className="h-4 w-4 rounded bg-neutral-900 border-neutral-800" />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-900/50 rounded-lg border border-neutral-200/50 dark:border-neutral-800/40">
                <div>
                  <label className="block text-white font-medium">Generic Webhooks</label>
                  <span className="text-[10px] text-neutral-500">JSON push events</span>
                </div>
                <input type="checkbox" checked={webhookEnabled} onChange={e => setWebhookEnabled(e.target.checked)} className="h-4 w-4 rounded bg-neutral-900 border-neutral-800" />
              </div>
            </div>

            <div className="space-y-3 text-xs pt-2">
              <div>
                <label className="block text-neutral-400 mb-1">Discord Webhook Target URL</label>
                <input 
                  type="url" 
                  placeholder="https://discord.com/api/webhooks/..." 
                  className="w-full al-input" 
                  value={discordWebhookUrl} 
                  onChange={e => setDiscordWebhookUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Generic Webhook Destination URL</label>
                <input 
                  type="url" 
                  placeholder="https://api.yourdomain.com/notifications" 
                  className="w-full al-input" 
                  value={webhookUrl} 
                  onChange={e => setWebhookUrl(e.target.value)} 
                />
              </div>
            </div>
          </div>

          {/* Sound, Muting & Retention Config */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm flex flex-col p-5 space-y-4">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-white/5">
              <Clock size={16} /> Advanced Audio & Mute Schedules
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="flex items-center justify-between p-2">
                <div>
                  <label className="block text-white font-medium">Notification Sound Alert</label>
                  <span className="text-[10px] text-neutral-500">Play tone on event arrival</span>
                </div>
                <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} className="h-4 w-4 rounded bg-neutral-900 border-neutral-800" />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Sound Audio Profile</label>
                <select 
                  className="w-full al-input" 
                  value={soundProfile} 
                  onChange={e => setSoundProfile(e.target.value)}
                >
                  <option value="default">Default Soft Pop</option>
                  <option value="success">Double Ding (Success)</option>
                  <option value="warning">Triangle Tone (Warning)</option>
                  <option value="error">Sawtooth Tone (Error/Critical)</option>
                  <option value="silent">Silent Mode (No Sound)</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Mute Alerts Until Schedule</label>
                <input 
                  type="datetime-local" 
                  className="w-full al-input" 
                  value={muteUntil} 
                  onChange={e => setMuteUntil(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Alert History Retention Period</label>
                <select 
                  className="w-full al-input" 
                  value={retentionDays} 
                  onChange={e => setRetentionDays(parseInt(e.target.value, 10))}
                >
                  <option value="7">7 Days</option>
                  <option value="30">30 Days</option>
                  <option value="90">90 Days</option>
                  <option value="365">1 Year</option>
                </select>
              </div>
            </div>

            {/* Muted Categories Checkboxes */}
            <div className="text-xs pt-2">
              <label className="block text-neutral-400 mb-2">Muted Alert Categories</label>
              <div className="flex flex-wrap gap-2">
                {['System', 'Instance', 'Deployment', 'Backup', 'Snapshot', 'Node', 'Security', 'Account', 'Task'].map(cat => {
                  const isMuted = mutedCategories.includes(cat);
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => toggleMutedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-[10px] font-semibold border transition ${
                        isMuted 
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                          : 'bg-neutral-800 text-neutral-400 border-neutral-750 hover:bg-neutral-750'
                      }`}
                    >
                      {cat} {isMuted ? 'Muted' : 'Active'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* Row 2: Per-Event Channel Delivery Matrix (Full Width) */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm p-5">
          <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-white/5">
            <Settings size={16} /> Granular Event Delivery Routing Matrix
          </h2>

          <div className="mt-4 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-400">
                <tr>
                  <th className="p-3">System Event Name</th>
                  <th className="p-3 text-center">Panel UI</th>
                  <th className="p-3 text-center">Desktop (WS)</th>
                  <th className="p-3 text-center">SMTP Email</th>
                  <th className="p-3 text-center">Discord Embed</th>
                  <th className="p-3 text-center">Generic Webhook</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                {Object.keys(DEFAULT_EVENT_PREFERENCES).map(eventKey => {
                  const spec = eventPreferences[eventKey] || DEFAULT_EVENT_PREFERENCES[eventKey] || { panel: true, websocket: true, email: false, discord: false, webhook: false };
                  return (
                    <tr key={eventKey} className="hover:bg-neutral-800/10 transition">
                      <td className="p-3 font-medium text-white">{EVENT_LABELS[eventKey] || eventKey}</td>
                      
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={spec.panel} 
                          onChange={e => updateMatrixPreference(eventKey, 'panel', e.target.checked)} 
                        />
                      </td>

                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={spec.websocket} 
                          onChange={e => updateMatrixPreference(eventKey, 'websocket', e.target.checked)} 
                        />
                      </td>

                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={spec.email} 
                          onChange={e => updateMatrixPreference(eventKey, 'email', e.target.checked)} 
                        />
                      </td>

                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={spec.discord} 
                          onChange={e => updateMatrixPreference(eventKey, 'discord', e.target.checked)} 
                        />
                      </td>

                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={spec.webhook} 
                          onChange={e => updateMatrixPreference(eventKey, 'webhook', e.target.checked)} 
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </form>
    </div>
  );
};
export default NotificationSettings;
