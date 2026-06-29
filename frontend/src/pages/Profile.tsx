import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, FileText, Globe, Shield, Upload, Trash2, Key } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user } = useAuth();
  
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form parameters
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [descInput, setDescInput] = useState('');

  // Active Sessions database
  const [sessions, setSessions] = useState([
    { id: '1', browser: 'Chrome on Windows 10', ip: '192.168.1.100', location: 'Local Network', active: true },
    { id: '2', browser: 'Safari on iPhone', ip: '172.56.21.84', location: 'Mobile Cellular', active: false }
  ]);

  // Personal API keys
  const [apiKeys, setApiKeys] = useState([
    { id: 'k1', label: 'CynexVM CLI Access', key: 'cv_live_••••••••••••x9s', createdAt: '2026-06-28' }
  ]);
  const [newKeyLabel, setNewKeyLabel] = useState('');

  const handleGenerateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyLabel) return;
    setApiKeys([...apiKeys, {
      id: Math.random().toString(),
      label: newKeyLabel,
      key: 'cv_live_' + Math.random().toString(36).substring(2, 15) + '••••',
      createdAt: new Date().toISOString().split('T')[0]
    }]);
    setNewKeyLabel('');
  };

  if (!user) return <div className="p-12 text-center text-neutral-500">Loading user profile...</div>;

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header with Avatar and Title */}
      <div className="px-8 pt-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img 
              id="avatar-preview"
              src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user.username)}`}
              alt="Avatar"
              className="h-12 w-12 rounded-xl border border-neutral-200 dark:border-white/10 object-cover" 
            />
            <label className="absolute -bottom-1.5 -right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-neutral-800 dark:bg-white border-2 border-white dark:border-neutral-900 cursor-pointer hover:bg-neutral-700 dark:hover:bg-neutral-200 transition">
              <Upload className="w-3 h-3 text-white dark:text-neutral-900" strokeWidth={2.5} />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-medium text-neutral-800 dark:text-white">Account Preferences</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Manage your personal credentials, sessions, and developer tokens.</p>
          </div>
        </div>
      </div>

      {success && (
        <div className="mx-8 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-btn text-xs font-semibold">
          {success}
        </div>
      )}

      {error && (
        <div className="mx-8 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Unified Settings Card Grid */}
      <div className="mx-8 space-y-6">
        {/* Info card */}
        <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/5 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            
            {/* Username Update */}
            <div className="col-span-1 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <User className="w-3 h-3" /> Username
              </label>
              <div className="flex gap-1.5">
                <input 
                  type="text" 
                  placeholder={user.username}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                />
                <button className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 font-medium transition">
                  Save
                </button>
              </div>
            </div>

            {/* Email Update */}
            <div className="col-span-1 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Mail className="w-3 h-3" /> Email Address
              </label>
              <div className="flex gap-1.5">
                <input 
                  type="email" 
                  placeholder={user.email}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-855 dark:text-white transition-colors"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                />
                <button className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 font-medium transition">
                  Save
                </button>
              </div>
            </div>

            {/* Change Password */}
            <div className="col-span-2 space-y-1 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Lock className="w-3 h-3" /> Change Password
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input 
                  type="password" 
                  placeholder="Current password"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-855 dark:text-white transition-colors"
                />
                <input 
                  type="password" 
                  placeholder="New password"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-855 dark:text-white transition-colors"
                />
              </div>
              <button className="mt-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 font-medium transition">
                Update Password
              </button>
            </div>
          </div>
        </div>

        {/* API keys manager card */}
        <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/5 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-white flex items-center gap-2">
            <Key className="w-4 h-4" /> Personal Developer API Tokens
          </h2>
          <form onSubmit={handleGenerateKey} className="flex gap-3 text-xs">
            <input 
              type="text" placeholder="Key name tag (e.g. CI deployment)" className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-600/30 w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-white outline-none" 
              value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} required 
            />
            <button type="submit" className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 font-medium transition">
              Generate Key
            </button>
          </form>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-neutral-100 dark:bg-neutral-800/30 text-neutral-400">
                <tr>
                  <th className="p-3">Label</th>
                  <th className="p-3">Token Access</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-850 text-neutral-300">
                {apiKeys.map(k => (
                  <tr key={k.id}>
                    <td className="p-3 font-semibold">{k.label}</td>
                    <td className="p-3 font-mono text-neutral-400">{k.key}</td>
                    <td className="p-3 text-neutral-500">{k.createdAt}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => setApiKeys(apiKeys.filter(x => x.id !== k.id))} className="text-red-500 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sessions & Devices list card */}
        <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/5 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-850 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4" /> Browser Session Logins
          </h2>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-neutral-100 dark:bg-neutral-800/30 text-neutral-400">
                <tr>
                  <th className="p-3">Browser / OS</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">Network Location</th>
                  <th className="p-3 text-right">Session status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-855 text-neutral-350">
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td className="p-3 font-medium">{s.browser}</td>
                    <td className="p-3 font-mono text-neutral-400">{s.ip}</td>
                    <td className="p-3">{s.location}</td>
                    <td className="p-3 text-right">
                      {s.active ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase">This Device</span>
                      ) : (
                        <button 
                          onClick={() => setSessions(sessions.filter(x => x.id !== s.id))}
                          className="text-red-500 hover:text-red-450 hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
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
export default Profile;
