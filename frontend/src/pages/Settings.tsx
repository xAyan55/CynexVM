import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const Settings: React.FC = () => {
  const { fetchSettings: updateGlobalSettings } = useAuth();

  const [panelName, setPanelName] = useState('CynexVM');
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to CynexVM Enterprise LXC Manager');
  const [maintenanceMode, setMaintenanceMode] = useState('false');
  const [registrationEnabled, setRegistrationEnabled] = useState('true');

  // Custom Assets
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [loginImageUrl, setLoginImageUrl] = useState('');
  const [registerImageUrl, setRegisterImageUrl] = useState('');

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
        if (data.registration_enabled) setRegistrationEnabled(data.registration_enabled);
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.favicon_url) setFaviconUrl(data.favicon_url);
        if (data.login_image_url) setLoginImageUrl(data.login_image_url);
        if (data.register_image_url) setRegisterImageUrl(data.register_image_url);
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
          maintenance_mode: maintenanceMode,
          registration_enabled: registrationEnabled,
          logo_url: logoUrl,
          favicon_url: faviconUrl,
          login_image_url: loginImageUrl,
          register_image_url: registerImageUrl
        })
      });

      if (res.ok) {
        setSuccess(true);
        // Refresh context globally to apply updates immediately
        await updateGlobalSettings();
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (_) {}
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Manage your CynexVM panel configuration.</p>
      </div>

      <div className="px-8 mt-5">
        <form onSubmit={handleSave} className="space-y-6">
          {success && (
            <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
              Configuration and branding changes saved successfully!
            </p>
          )}

          {/* Branding and configuration settings card */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5">
              Panel Settings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-5 text-sm">
              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Site Title</label>
                <input 
                  type="text" 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={panelName} 
                  onChange={e => setPanelName(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Welcome Banner Message</label>
                <input 
                  type="text" 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={welcomeMessage} 
                  onChange={e => setWelcomeMessage(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">User Registration</label>
                <select 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={registrationEnabled} 
                  onChange={e => setRegistrationEnabled(e.target.value)}
                >
                  <option value="true">Enabled (Open to Public)</option>
                  <option value="false">Disabled (Invite Only)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Maintenance Mode</label>
                <select 
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={maintenanceMode} 
                  onChange={e => setMaintenanceMode(e.target.value)}
                >
                  <option value="false">Active (Online)</option>
                  <option value="true">Offline (Maintenance)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Custom Media Assets Card */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5">
              Custom Branding Assets
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-5 text-sm">
              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Logo URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/logo.png"
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={logoUrl} 
                  onChange={e => setLogoUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Favicon URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/favicon.ico"
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={faviconUrl} 
                  onChange={e => setFaviconUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Login Wallpaper URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/login-bg.jpg"
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={loginImageUrl} 
                  onChange={e => setLoginImageUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-750 dark:text-neutral-300 text-xs mb-2">Registration Wallpaper URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/register-bg.jpg"
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700/50 focus:border-blue-500 focus:outline-none text-xs w-full bg-neutral-50 dark:bg-neutral-800/10 px-4 py-2.5 text-neutral-800 dark:text-white transition"
                  value={registerImageUrl} 
                  onChange={e => setRegisterImageUrl(e.target.value)} 
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="flex min-h-10 items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-750 transition"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
};
export default Settings;
