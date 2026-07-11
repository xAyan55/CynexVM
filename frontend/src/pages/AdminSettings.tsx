import React, { useState, useEffect } from 'react';
import { Mail, Globe, Shield, Settings as SetIcon, Image, Save, Palette } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const COLOR_PRESETS: { name: string; colors: string[] }[] = [
  { name: 'Lavender Gray', colors: ['#D3D5FD', '#929AAB', '#474A56', '#0B0B0D'] },
  { name: 'Nightfall',     colors: ['#34374C', '#2C2E3E', '#EE2B47', '#F6F6F6'] },
  { name: 'Powder Blue',   colors: ['#6A759B', '#21273D', '#B9D4F1', '#F1F6F8'] },
  { name: 'Teal Dark',     colors: ['#343434', '#055E68', '#62A388', '#B9D2D2'] },
];



export const AdminSettings: React.FC = () => {
  const { fetchSettings: updateGlobalSettings } = useAuth();

  // Branding & Configuration States
  const [panelName, setPanelName] = useState('CynexVM');
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome to CynexVM Enterprise LXC Manager');
  const [maintenanceMode, setMaintenanceMode] = useState('false');
  const [registrationEnabled, setRegistrationEnabled] = useState('true');
  const [vpsMotd, setVpsMotd] = useState('');

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

  // Theme Colors
  const [colorBgPrimary, setColorBgPrimary] = useState('#0f0f0f');
  const [colorBgCard, setColorBgCard] = useState('#1a1a1a');
  const [colorAccent, setColorAccent] = useState('#e5e5e5');
  const [colorTextPrimary, setColorTextPrimary] = useState('#f0f0f0');

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
        if (data.vps_motd) setVpsMotd(data.vps_motd);
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

        // Theme Colors
        if (data.color_bg_primary) setColorBgPrimary(data.color_bg_primary);
        if (data.color_bg_card) setColorBgCard(data.color_bg_card);
        if (data.color_accent) setColorAccent(data.color_accent);
        if (data.color_text_primary) setColorTextPrimary(data.color_text_primary);

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
          vps_motd: vpsMotd,
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
          color_bg_primary: colorBgPrimary,
          color_bg_card: colorBgCard,
          color_accent: colorAccent,
          color_text_primary: colorTextPrimary,
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
    <div className="space-y-6 max-w-7xl mx-auto px-6 lg:px-8 pb-12">
      {/* Header Container with Save Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center pt-5 justify-between gap-4">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Branding & System Configuration</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Configure SMTP servers, custom brand aesthetics, user registration policies, and diagnostic webhooks.</p>
        </div>
        <button 
          type="submit" 
          form="settings-form"
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs font-semibold shadow transition disabled:opacity-40 shrink-0"
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      <div className="mt-5">
        <form id="settings-form" onSubmit={handleSave} className="space-y-6">
          {success && (
            <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
              Configuration and branding changes saved successfully!
            </p>
          )}

          {/* Symmetrical Row-based Grid System */}
          <div className="space-y-6">
            
            {/* ROW 1: Panel Settings & SMTP Transactional Mailer (Equally Sized) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* Panel Settings Card */}
              <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm flex flex-col">
                <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
                  <SetIcon size={16} /> Panel Settings
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-5 py-5 text-xs flex-1">
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

                  <div className="sm:col-span-2">
                    <label className="block text-neutral-400 mb-1">VPS Message of the Day (MOTD)</label>
                    <textarea 
                      rows={3} 
                      placeholder="Welcome to your CynexVM VPS! Managed by system administrator."
                      className="w-full al-input resize-none"
                      value={vpsMotd}
                      onChange={e => setVpsMotd(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* SMTP Mailer Card */}
              <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm flex flex-col">
                <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
                  <Mail size={16} /> SMTP Transactional Mailer
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-5 py-5 text-xs flex-1">
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

            </div>

            {/* ROW 2: Custom Assets & Discord Single Sign-On (Equally Sized) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              
              {/* Custom Assets Card */}
              <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm flex flex-col">
                <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
                  <Image size={16} /> Custom Branding Assets
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-5 py-5 text-xs flex-1">
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

                  <div className="sm:col-span-2">
                    <label className="block text-neutral-400 mb-1">Login split wallpaper URL</label>
                    <input 
                      type="url" 
                      placeholder="https://example.com/login-bg.jpg"
                      className="w-full al-input"
                      value={loginImageUrl} 
                      onChange={e => setLoginImageUrl(e.target.value)} 
                    />
                  </div>

                  <div className="sm:col-span-2">
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

              {/* Discord SSO Card */}
              <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm flex flex-col">
                <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
                  <Globe size={16} /> Discord Single Sign-On (OAuth)
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 px-5 py-5 text-xs flex-1 align-middle content-center items-start">
                  <div className="sm:col-span-2">
                    <label className="block text-neutral-400 mb-1">Client ID</label>
                    <input type="text" className="w-full al-input" value={discordId} onChange={e => setDiscordId(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-neutral-400 mb-1">Client Secret Token</label>
                    <input type="password" className="w-full al-input" value={discordSecret} onChange={e => setDiscordSecret(e.target.value)} placeholder="••••••••••••••••••••••••••••••••" />
                  </div>
                  <div className="sm:col-span-2 text-[10px] text-neutral-500 leading-relaxed mt-2 bg-neutral-900/10 dark:bg-neutral-800/10 p-3 rounded-lg border border-neutral-700/10">
                    Authentication keys are used by standard clients to securely authorize access requests. To generate credentials, configure a developer application on the Discord Developer Portal.
                  </div>
                </div>
              </div>

            </div>

            {/* ROW 3: Theme Color Customization (Full Width) */}
            <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm w-full">
              <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
                <Palette size={16} /> Theme Color Customization
              </h2>
              <div className="px-5 py-5 space-y-5">
                {/* Color pickers */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Background', value: colorBgPrimary, set: setColorBgPrimary, var: '--color-pageBg' },
                    { label: 'Card / Surface', value: colorBgCard, set: setColorBgCard, var: '--color-cardBg' },
                    { label: 'Accent', value: colorAccent, set: setColorAccent, var: '--color-accentBlue' },
                    { label: 'Text', value: colorTextPrimary, set: setColorTextPrimary, var: '--color-textStrong' },
                  ].map((c) => (
                    <div key={c.label} className="flex flex-col items-center gap-2 p-3 bg-neutral-900/20 dark:bg-black/20 rounded-xl">
                      <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-neutral-700/30" style={{ backgroundColor: c.value }}>
                        <input
                          type="color"
                          value={c.value}
                          onChange={(e) => {
                            c.set(e.target.value);
                            document.documentElement.style.setProperty(c.var, e.target.value);
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title={c.label}
                        />
                      </div>
                      <label className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">{c.label}</label>
                      <span className="text-[10px] font-mono text-neutral-500">{c.value}</span>
                    </div>
                  ))}
                </div>

                {/* Presets */}
                <div>
                  <p className="text-[11px] text-neutral-400 font-medium mb-3">Preset Palettes</p>
                  <div className="flex flex-wrap gap-3">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setColorBgPrimary(preset.colors[0]);
                          setColorBgCard(preset.colors[1]);
                          setColorAccent(preset.colors[2]);
                          setColorTextPrimary(preset.colors[3]);
                          document.documentElement.style.setProperty('--color-pageBg', preset.colors[0]);
                          document.documentElement.style.setProperty('--color-cardBg', preset.colors[1]);
                          document.documentElement.style.setProperty('--color-accentBlue', preset.colors[2]);
                          document.documentElement.style.setProperty('--color-textStrong', preset.colors[3]);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-700/30 hover:border-neutral-500/50 transition bg-neutral-900/10 dark:bg-black/10"
                      >
                        <div className="flex -space-x-1">
                          {preset.colors.map((hex, i) => (
                            <div key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: hex }} />
                          ))}
                        </div>
                        <span className="text-[11px] text-neutral-300 font-medium">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-neutral-500 leading-relaxed">
                  Changes preview instantly. Click <strong>Save Configuration</strong> to persist.
                </p>
              </div>
            </div>

            {/* ROW 4: Developer Webhooks Endpoint (Full Width across bottom) */}
            <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm w-full">
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
