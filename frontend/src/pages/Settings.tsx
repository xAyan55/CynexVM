import React, { useState, useEffect } from 'react';

export const Settings: React.FC = () => {
  const [panelName, setPanelName] = useState('CynexVM');
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to CynexVM Enterprise LXC Manager');
  const [maintenanceMode, setMaintenanceMode] = useState('false');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.panel_name) setPanelName(data.panel_name);
        if (data.welcome_message) setWelcomeMessage(data.welcome_message);
        if (data.maintenance_mode) setMaintenanceMode(data.maintenance_mode);
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          panel_name: panelName,
          welcome_message: welcomeMessage,
          maintenance_mode: maintenanceMode
        })
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Manage your CynexVM panel configuration.</p>
      </div>

      <div className="px-8 mt-5">
        <form onSubmit={handleSave} className="space-y-5">
          {success && (
            <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
              Branding changes saved successfully!
            </p>
          )}

          {/* Branding card block */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5">
              Panel Settings
            </h2>
            <div className="grid grid-cols-1 gap-5 px-5 py-5 text-sm">
              <div>
                <label className="block font-medium text-neutral-700 dark:text-white mb-2">Site title</label>
                <input 
                  type="text" 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700/20 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  value={panelName} 
                  onChange={e => setPanelName(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 dark:text-white mb-2">Welcome Banner Message</label>
                <input 
                  type="text" 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700/20 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  value={welcomeMessage} 
                  onChange={e => setWelcomeMessage(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 dark:text-white mb-2">Maintenance State</label>
                <select 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/70 focus:ring-1 focus:outline-none text-sm w-full bg-neutral-100 dark:bg-neutral-700/20 px-4 py-2 text-neutral-800 dark:text-white transition-colors"
                  value={maintenanceMode} 
                  onChange={e => setMaintenanceMode(e.target.value)}
                >
                  <option value="false">Active (Online)</option>
                  <option value="true">Offline (Maintenance)</option>
                </select>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="flex min-h-10 items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};
export default Settings;
