import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Key, User, Trash2, Shield, AlertTriangle, Eye, EyeOff } from 'lucide-react';

interface SystemApiKey {
  id: string;
  label: string;
  key: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
}

interface UserListItem {
  id: string;
  username: string;
  email: string;
}

export const AdminApiKeys: React.FC = () => {
  const { token } = useAuth();
  const [keys, setKeys] = useState<SystemApiKey[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Raw generated key display
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadKeys();
    loadUsers();
  }, [token]);

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/v1/auth/admin/apikeys', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch (_) {}
  };

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/v1/auth/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        if (data.length > 0) {
          setSelectedUserId(data[0].id);
        }
      }
    } catch (_) {}
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setGeneratedKey(null);
    if (!newKeyLabel || !selectedUserId) return;

    try {
      const res = await fetch('/api/v1/auth/admin/apikeys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newKeyLabel, userId: selectedUserId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate API Key');
      }
      setSuccess(data.message);
      setGeneratedKey(data.key.rawKey);
      setShowKey(true);
      setNewKeyLabel('');
      loadKeys();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API token globally? Any external integrations using it will immediately fail.')) return;
    try {
      const res = await fetch(`/api/v1/auth/admin/apikeys/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        loadKeys();
        setSuccess('API Token has been globally revoked.');
      }
    } catch (_) {}
  };

  return (
    <div className="space-y-6 max-w-6xl pb-12 mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200/30 dark:border-white/5">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-500" /> Global API Keys
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
            Audit and orchestrate API tokens across all customers and automation integrations.
          </p>
        </div>
      </div>

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl text-xs font-medium">
          {success}
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* Generated Token Warning Banner */}
      {generatedKey && (
        <div className="p-5 bg-blue-500/10 border border-blue-500/25 rounded-2xl text-xs space-y-3">
          <div className="flex items-center gap-2 font-semibold text-blue-600 dark:text-blue-400">
            <Shield className="w-4 h-4" /> Copy Generated System API Key
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
            This token will only be shown to you once. Please copy it immediately and store it securely.
          </p>
          <div className="flex items-center gap-2">
            <input 
              type={showKey ? 'text' : 'password'}
              readOnly 
              value={generatedKey} 
              className="flex-1 bg-white dark:bg-black/45 border border-neutral-200 dark:border-white/5 font-mono px-3 py-2 rounded-xl text-neutral-850 dark:text-white focus:outline-none"
            />
            <button 
              onClick={() => setShowKey(!showKey)}
              className="p-2 hover:bg-white/5 rounded-xl transition text-neutral-500 hover:text-white"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(generatedKey);
                alert('Copied to clipboard!');
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Keys list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-3xl p-6 space-y-4 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-850 dark:text-white">Active System API Keys</h2>
            
            <div className="border border-neutral-200 dark:border-neutral-800/50 rounded-2xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-neutral-100 dark:bg-neutral-800/30 text-neutral-450 border-b border-neutral-200 dark:border-white/5">
                  <tr>
                    <th className="p-3 font-semibold">Key Tag</th>
                    <th className="p-3 font-semibold">Owner Profile</th>
                    <th className="p-3 font-semibold">Token Preview</th>
                    <th className="p-3 font-semibold">Created</th>
                    <th className="p-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/40 text-neutral-700 dark:text-neutral-300">
                  {keys.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-neutral-500">No active system API keys found.</td>
                    </tr>
                  ) : (
                    keys.map(k => (
                      <tr key={k.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.01]">
                        <td className="p-3 font-semibold text-neutral-800 dark:text-white">{k.label}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-350">
                            <User className="w-3 h-3 text-neutral-400" />
                            <span className="font-medium">{k.user.username}</span>
                            <span className="text-neutral-500 font-mono text-[10px]">({k.user.email})</span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-neutral-500">{k.key}</td>
                        <td className="p-3 text-neutral-500">{k.createdAt}</td>
                        <td className="p-3 text-right">
                          <button 
                            onClick={() => handleRevokeKey(k.id)}
                            className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
                          >
                            <Trash2 size={14} />
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

        {/* Right: Key generator form */}
        <div className="space-y-6">
          <div className="bg-white/5 border border-neutral-200/30 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-neutral-850 dark:text-white">Generate System Key</h2>
            
            <form onSubmit={handleGenerateKey} className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="font-medium text-neutral-500 dark:text-neutral-400">Key Name Tag</label>
                <input 
                  type="text" 
                  placeholder="Key name (e.g. WHMCS sync)" 
                  className="w-full px-3 py-2 bg-neutral-900/10 dark:bg-black/25 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition" 
                  value={newKeyLabel} 
                  onChange={e => setNewKeyLabel(e.target.value)} 
                  required 
                />
              </div>

              <div className="space-y-2">
                <label className="font-medium text-neutral-500 dark:text-neutral-400">Assign To User</label>
                <select
                  className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 focus:border-blue-500 focus:outline-none rounded-xl text-neutral-850 dark:text-white transition"
                  value={selectedUserId}
                  onChange={e => setSelectedUserId(e.target.value)}
                  required
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <button 
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition"
              >
                Generate Token
              </button>
            </form>
          </div>

          {/* Security warning card */}
          <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-3xl p-6 space-y-3">
            <h3 className="text-xs font-semibold text-yellow-600 dark:text-yellow-450 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Security Advisory
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              API keys grant full programmatic access bypasses (including VM destruction). Exercise extreme caution when assigning global API keys to administrative users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminApiKeys;
