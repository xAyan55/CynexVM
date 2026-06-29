import React, { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';

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
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-white tracking-wide">System Settings</h1>
        <p className="text-xs text-gray-400">Configure global panel configurations and branding defaults.</p>
      </div>

      <form onSubmit={handleSave} className="glass-panel p-6 rounded-card border border-borderSubtle space-y-4 text-xs">
        {success && (
          <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-btn font-semibold">
            Settings saved successfully!
          </p>
        )}

        <div className="space-y-1">
          <label className="text-[11px] text-gray-400 block font-medium">Panel Display Name</label>
          <input 
            type="text" className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-600"
            value={panelName} onChange={e => setPanelName(e.target.value)} required
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-gray-400 block font-medium">Welcome Banner Message</label>
          <input 
            type="text" className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-600"
            value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} required
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-gray-400 block font-medium">Maintenance Mode</label>
          <select 
            className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-600"
            value={maintenanceMode} onChange={e => setMaintenanceMode(e.target.value)}
          >
            <option value="false">Active (Online)</option>
            <option value="true">Offline (Maintenance active)</option>
          </select>
        </div>

        <button 
          type="submit" 
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-btn font-bold transition-all hover:scale-[1.02] shadow-glow pt-2"
          disabled={loading}
        >
          <Save size={14} /> {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
};
export default Settings;
