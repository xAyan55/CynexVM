import React, { useState, useEffect } from 'react';
import { Mail, Globe, Shield, Settings as SetIcon, Image, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AdminSettings: React.FC = () => {
  const { fetchSettings: updateGlobalSettings } = useAuth();

  // Branding & Configuration States
  const [panelName, setPanelName] = useState('CynexVM');
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to CynexVM Enterprise LXC Manager');
  const [maintenanceMode, setMaintenanceMode] = useState('false');
  const [registrationEnabled, setRegistrationEnabled] = useState('true');

  // Custom Assets
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [loginImageUrl, setLoginImageUrl] = useState('');
  const [registerImageUrl, setRegisterImageUrl] = useState('');

  // SMTP Configuration
  const [smtpHost, setSmtpHost] = useState('smtp.mailgun.org');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('postmaster@cynexvm.net');
  const [smtpPass, setSmtpPass] = useState('');

  // Discord Configuration
  const [discordId, setDiscordId] = useState('1192837482910283');
  const [discordSecret, setDiscordSecret] = useState('');

  // Webhooks
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [newWebhook, setNewWebhook] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
        
        // SMTP
        if (data.smtp_host) setSmtpHost(data.smtp_host);
        if (data.smtp_port) setSmtpPort(parseInt(data.smtp_port, 10) || 587);
        if (data.smtp_user) setSmtpUser(data.smtp_user);
        if (data.smtp_pass) setSmtpPass(data.smtp_pass);

        // Discord
        if (data.discord_client_id) setDiscordId(data.discord_client_id);
        if (data.discord_client_secret) setDiscordSecret(data.discord_client_secret);

        // Webhooks
        if (data.webhooks_json) {
          try {
            setWebhooks(JSON.parse(data.webhooks_json));
          } catch (_) {
            setWebhooks([]);
          }
        }
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setSaving(true);

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
          register_image_url: registerImageUrl,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_user: smtpUser,
          smtp_pass: smtpPass,
          discord_client_id: discordId,
          discord_client_secret: discordSecret,
          webhooks_json: JSON.stringify(webhooks)
        })
      });

      if (res.ok) {
        setSuccess(true);
        // Refresh context globally to apply updates immediately
        await updateGlobalSettings();
        setTimeout(() => setSuccess(false), 2000);
      } else {
        alert('Failed to save settings');
      }
    } catch (_) {
      alert('Failed to save settings');
    }
    setSaving(false);
  };

  const handleAddWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhook) return;
    setWebhooks([...webhooks, { id: Math.random().toString(), url: newWebhook, event: 'instance.state_change' }]);
    setNewWebhook('');
  };

  if (loading) {
    return <div className="p-12 text-center text-neutral-500 text-xs">Querying configuration variables...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Branding & System Configuration</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Configure SMTP servers, custom brand aesthetics, user registration policies, and diagnostic webhooks.</p>
      </div>

      <div className="px-8 mt-5">
        <form onSubmit={handleSave} className="space-y-6">
          {success && (
            <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
              Configuration and branding changes saved successfully!
            </p>
          )}

          {/* Section 1: Panel branding settings */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
              <SetIcon size={16} /> Panel settings
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-5 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Site Title (Branding)</label>
                <input 
                  type="text" 
                  className="w-full al-input"
                  value={panelName} 
                  onChange={e => setPanelName(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Welcome Banner Message</label>
                <input 
                  type="text" 
                  className="w-full al-input"
                  value={welcomeMessage} 
                  onChange={e => setWelcomeMessage(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">User Registration Toggle</label>
                <select 
                  className="w-full al-input"
                  value={registrationEnabled} 
                  onChange={e => setRegistrationEnabled(e.target.value)}
                >
                  <option value="true">Enabled (Open to Public)</option>
                  <option value="false">Disabled (Invite Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Maintenance Mode</label>
                <select 
                  className="w-full al-input"
                  value={maintenanceMode} 
                  onChange={e => setMaintenanceMode(e.target.value)}
                >
                  <option value="false">Active (Online)</option>
                  <option value="true">Offline (Maintenance)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Custom Assets */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
              <Image size={16} /> Custom Branding Assets
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-5 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Logo Image URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/logo.png"
                  className="w-full al-input"
                  value={logoUrl} 
                  onChange={e => setLogoUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Favicon URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/favicon.ico"
                  className="w-full al-input"
                  value={faviconUrl} 
                  onChange={e => setFaviconUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Login split wallpaper URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/login-bg.jpg"
                  className="w-full al-input"
                  value={loginImageUrl} 
                  onChange={e => setLoginImageUrl(e.target.value)} 
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Registration split wallpaper URL</label>
                <input 
                  type="url" 
                  placeholder="https://example.com/register-bg.jpg"
                  className="w-full al-input"
                  value={registerImageUrl} 
                  onChange={e => setRegisterImageUrl(e.target.value)} 
                />
              </div>
            </div>
          </div>

          {/* Section 3: SMTP Card */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
              <Mail size={16} /> SMTP Transactional Mailer
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-5 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">SMTP Hostname</label>
                <input type="text" className="w-full al-input" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">SMTP Port</label>
                <input type="number" className="w-full al-input" value={smtpPort} onChange={e => setSmtpPort(parseInt(e.target.value, 10))} />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">SMTP Username</label>
                <input type="text" className="w-full al-input" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">SMTP Password</label>
                <input type="password" className="w-full al-input" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••••••" />
              </div>
            </div>
          </div>

          {/* Section 4: Discord OAuth Client */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
              <Globe size={16} /> Discord Single Sign-On (OAuth)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-5 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Client ID</label>
                <input type="text" className="w-full al-input" value={discordId} onChange={e => setDiscordId(e.target.value)} />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Client Secret Token</label>
                <input type="password" className="w-full al-input" value={discordSecret} onChange={e => setDiscordSecret(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" />
              </div>
            </div>
          </div>

          {/* Section 5: Webhooks config */}
          <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
            <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
              <Shield size={16} /> Developer Webhooks Endpoint
            </h2>
            <div className="px-5 py-5 space-y-4">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  placeholder="https://api.domain.com/webhooks" 
                  className="flex-1 al-input text-xs" 
                  value={newWebhook} 
                  onChange={e => setNewWebhook(e.target.value)} 
                />
                <button type="button" onClick={handleAddWebhook} className="al-btn al-btn-primary py-2 text-xs">Add Webhook</button>
              </div>

              <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-400">
                    <tr>
                      <th className="p-3">Webhook URL Target</th>
                      <th className="p-3">Event Topic</th>
                      <th className="p-3 text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                    {webhooks.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-neutral-500">No webhooks configured.</td>
                      </tr>
                    ) : (
                      webhooks.map(w => (
                        <tr key={w.id}>
                          <td className="p-3 font-mono">{w.url}</td>
                          <td className="p-3 font-medium uppercase text-blue-400">{w.event}</td>
                          <td className="p-3 text-right">
                            <button type="button" onClick={() => setWebhooks(webhooks.filter(x => x.id !== w.id))} className="text-red-500 hover:text-red-400">
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow transition disabled:opacity-40"
          >
            {saving ? 'Saving configuration...' : 'Save Configuration'}
          </button>
        </form>
      </div>
    </div>
  );
};
export default AdminSettings;
