import React, { useState } from 'react';
import { Mail, Globe, Shield, RefreshCw } from 'lucide-react';

export const AdminSettings: React.FC = () => {
  // Config states
  const [smtpHost, setSmtpHost] = useState('smtp.mailgun.org');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('postmaster@cynexvm.net');
  const [smtpPass, setSmtpPass] = useState('••••••••••••');

  const [discordId, setDiscordId] = useState('1192837482910283');
  const [discordSecret, setDiscordSecret] = useState('••••••••••••••••••••••••••••••••');

  const [webhooks, setWebhooks] = useState([
    { id: '1', url: 'https://discord.com/api/webhooks/...', event: 'instance.create' }
  ]);
  const [newWebhook, setNewWebhook] = useState('');

  const handleAddWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWebhook) return;
    setWebhooks([...webhooks, { id: Math.random().toString(), url: newWebhook, event: 'instance.state_change' }]);
    setNewWebhook('');
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">Branding & System Configuration</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Configure SMTP servers, API client integrations, Discord login endpoints, and diagnostic webhooks.</p>
      </div>

      <div className="px-8 mt-5 space-y-6">
        {/* SMTP Card */}
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
              <input type="password" className="w-full al-input" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Discord OAuth Client */}
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
              <input type="password" className="w-full al-input" value={discordSecret} onChange={e => setDiscordSecret(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Webhooks config */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 shadow-sm">
          <h2 className="text-[13px] font-medium text-neutral-800 dark:text-white px-5 py-3.5 bg-neutral-50 dark:bg-white/5 rounded-t-xl border-b border-neutral-200 dark:border-white/5 flex items-center gap-2">
            <Shield size={16} /> Developer Webhooks Endpoint
          </h2>
          <div className="px-5 py-5 space-y-4">
            <form onSubmit={handleAddWebhook} className="flex gap-3">
              <input 
                type="text" placeholder="https://api.domain.com/webhooks" className="flex-1 al-input text-xs" 
                value={newWebhook} onChange={e => setNewWebhook(e.target.value)} required 
              />
              <button type="submit" className="al-btn al-btn-primary py-2 text-xs">Add Webhook</button>
            </form>

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
                  {webhooks.map(w => (
                    <tr key={w.id}>
                      <td className="p-3 font-mono">{w.url}</td>
                      <td className="p-3 font-medium uppercase text-blue-400">{w.event}</td>
                      <td className="p-3 text-right">
                        <button type="button" onClick={() => setWebhooks(webhooks.filter(x => x.id !== w.id))} className="text-red-500 hover:text-red-400">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <button type="button" className="al-btn al-btn-primary px-4 py-2">
          Save Configuration
        </button>
      </div>
    </div>
  );
};
export default AdminSettings;
