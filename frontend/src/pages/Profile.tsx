import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, Shield, Trash2, Key, HelpCircle, HardDrive, Smartphone } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, token, fetchProfile } = useAuth();
  
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form parameters
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Active Sessions database (simulate logs for presentation)
  const [sessions, setSessions] = useState([
    { id: '1', browser: 'Chrome on Windows 10', ip: '192.168.1.100', location: 'Local Network', active: true, device: 'desktop' },
    { id: '2', browser: 'Safari on iPhone', ip: '172.56.21.84', location: 'Mobile Cellular', active: false, device: 'mobile' }
  ]);

  // Personal API keys
  const [apiKeys, setApiKeys] = useState([
    { id: 'k1', label: 'CynexVM CLI Access', key: 'cv_live_••••••••••••x9s', createdAt: '2026-06-28' }
  ]);
  const [newKeyLabel, setNewKeyLabel] = useState('');

  const handleUpdateProfile = async (field: 'username' | 'email') => {
    setError(null);
    setSuccess(null);
    const value = field === 'username' ? usernameInput : emailInput;
    if (!value) return;

    try {
      const res = await fetch('/api/v1/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ [field]: value })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }
      setSuccess(data.message);
      if (token && fetchProfile) {
        await fetchProfile(token);
      }
      if (field === 'username') setUsernameInput('');
      if (field === 'email') setEmailInput('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!currentPassword || !newPassword) {
      setError('Please fill in both password fields.');
      return;
    }

    try {
      const res = await fetch('/api/v1/auth/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }
      setSuccess(data.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    }
  };

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

  if (!user) return <div className="p-12 text-center text-neutral-500 text-sm">Loading user profile...</div>;

  return (
    <div className="space-y-6 max-w-5xl pb-12 mx-auto px-4 md:px-8">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-neutral-200/30 dark:border-white/5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img 
              id="avatar-preview"
              src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user.username)}`}
              alt="Avatar"
              className="h-16 w-16 rounded-2xl border-2 border-blue-500/20 bg-neutral-900 object-cover p-0.5 shadow-lg shadow-blue-500/10" 
            />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 rounded-full bg-emerald-500 border-2 border-white dark:border-[#09090b]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              Account Preferences
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Manage your personal credentials, sessions, and developer API tokens.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-2xl px-4 py-2 text-xs">
          <Shield className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-neutral-500 dark:text-neutral-400 font-medium">Role:</span>
          <span className="font-semibold text-neutral-950 dark:text-white uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-[10px]">
            {user.role}
          </span>
        </div>
      </div>

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl text-xs font-medium transition duration-200">
          {success}
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-medium transition duration-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Account Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Details Card */}
          <div className="bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-3xl p-6 space-y-6 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-850 dark:text-white flex items-center gap-2 border-b border-neutral-200/20 dark:border-white/5 pb-3">
              <User className="w-4 h-4 text-blue-500" /> Profile Information
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Username Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 font-medium text-neutral-500 dark:text-neutral-400">
                  Username
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <input 
                      type="text" 
                      placeholder={user.username}
                      className="w-full pl-9 pr-3 py-2 bg-neutral-900/10 dark:bg-black/25 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition-colors"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => handleUpdateProfile('username')}
                    disabled={!usernameInput}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 font-medium text-neutral-500 dark:text-neutral-400">
                  Email Address
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <input 
                      type="email" 
                      placeholder={user.email}
                      className="w-full pl-9 pr-3 py-2 bg-neutral-900/10 dark:bg-black/25 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition-colors"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => handleUpdateProfile('email')}
                    disabled={!emailInput}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Password Settings Card */}
          <div className="bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-850 dark:text-white flex items-center gap-2 border-b border-neutral-200/20 dark:border-white/5 pb-3">
              <Lock className="w-4 h-4 text-blue-500" /> Password Settings
            </h2>
            
            <form onSubmit={handleUpdatePassword} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-medium text-neutral-500 dark:text-neutral-400">Current Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <input 
                      type="password" 
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-neutral-900/10 dark:bg-black/25 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-medium text-neutral-500 dark:text-neutral-400">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <input 
                      type="password" 
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-neutral-900/10 dark:bg-black/25 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>

          {/* Session Logs Card */}
          <div className="bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-neutral-850 dark:text-white flex items-center gap-2 border-b border-neutral-200/20 dark:border-white/5 pb-3">
              <Shield className="w-4 h-4 text-blue-500" /> Active Session Logs
            </h2>

            <div className="border border-neutral-200 dark:border-neutral-800/50 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-neutral-100 dark:bg-neutral-800/30 text-neutral-450 border-b border-neutral-200 dark:border-white/5">
                  <tr>
                    <th className="p-3 font-semibold">Device / Browser</th>
                    <th className="p-3 font-semibold">IP Address</th>
                    <th className="p-3 font-semibold">Network Location</th>
                    <th className="p-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/40 text-neutral-700 dark:text-neutral-300">
                  {sessions.map(s => (
                    <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.01]">
                      <td className="p-3 flex items-center gap-2">
                        {s.device === 'desktop' ? <HardDrive className="w-4 h-4 text-neutral-400" /> : <Smartphone className="w-4 h-4 text-neutral-400" />}
                        <span className="font-medium">{s.browser}</span>
                      </td>
                      <td className="p-3 font-mono text-neutral-500">{s.ip}</td>
                      <td className="p-3 text-neutral-500">{s.location}</td>
                      <td className="p-3 text-right">
                        {s.active ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase">This Device</span>
                        ) : (
                          <button 
                            onClick={() => setSessions(sessions.filter(x => x.id !== s.id))}
                            className="text-red-500 hover:text-red-600 hover:underline font-semibold"
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

        {/* Right Column: Developer Tokens */}
        <div className="space-y-6">
          {/* API Key management Card */}
          <div className="bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-neutral-850 dark:text-white flex items-center gap-2 border-b border-neutral-200/20 dark:border-white/5 pb-3">
              <Key className="w-4 h-4 text-blue-500" /> Developer Tokens
            </h2>
            
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              API tokens allow external command-line clients (e.g. CynexVM CLI) to orchestrate virtualization actions on your host node securely.
            </p>

            <form onSubmit={handleGenerateKey} className="space-y-2 text-xs">
              <label className="font-medium text-neutral-500 dark:text-neutral-400">Generate New Token</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Key name tag (e.g. CI deploy)" 
                  className="flex-1 px-3 py-2 bg-neutral-900/10 dark:bg-black/25 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition-colors" 
                  value={newKeyLabel} 
                  onChange={e => setNewKeyLabel(e.target.value)} 
                  required 
                />
                <button type="submit" className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition shrink-0">
                  Generate
                </button>
              </div>
            </form>

            <div className="space-y-3 pt-2">
              {apiKeys.map(k => (
                <div key={k.id} className="flex items-center justify-between p-3 bg-neutral-100/50 dark:bg-white/[0.02] border border-neutral-200 dark:border-white/5 rounded-2xl text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-neutral-800 dark:text-white truncate">{k.label}</p>
                    <p className="font-mono text-neutral-500 mt-1 truncate">{k.key}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Created: {k.createdAt}</p>
                  </div>
                  <button 
                    onClick={() => setApiKeys(apiKeys.filter(x => x.id !== k.id))} 
                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition ml-3"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Developer Docs Prompt */}
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-3xl p-6 space-y-3">
            <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-450 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" /> Integration Help
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Integrate CynexVM into your automation pipelines. Consult our OpenAPI documentation to authorize REST calls using your bearer token.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
