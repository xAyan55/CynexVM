import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, FileText, Globe, Shield, Upload } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, fetchProfile } = useAuth();
  
  // 2FA Setup states
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form parameters
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [descInput, setDescInput] = useState('');

  if (!user) return <div className="p-12 text-center text-neutral-500">Loading user profile...</div>;

  return (
    <div className="space-y-6">
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
            <h1 className="text-base font-medium text-neutral-800 dark:text-white">Account</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Manage your profile and preferences.</p>
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
      <div className="mx-8 space-y-4">
        <div className="bg-neutral-50 dark:bg-white/5 rounded-2xl border border-neutral-200 dark:border-white/5 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

            {/* Username Update */}
            <div className="col-span-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <User className="w-3 h-3" /> Username
              </label>
              <div className="flex gap-1.5">
                <input 
                  type="text" 
                  placeholder={user.username}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none text-xs w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                />
                <button className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium transition">
                  Save
                </button>
              </div>
            </div>

            {/* Email Update */}
            <div className="col-span-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Mail className="w-3 h-3" /> Email Address
              </label>
              <div className="flex gap-1.5">
                <input 
                  type="email" 
                  placeholder={user.email}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none text-xs w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                />
                <button className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium transition">
                  Save
                </button>
              </div>
            </div>

            {/* Change Password */}
            <div className="col-span-2 space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Lock className="w-3 h-3" /> Change Password
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input 
                  type="password" 
                  placeholder="Current password"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none text-xs w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors"
                />
                <input 
                  type="password" 
                  placeholder="New password"
                  className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none text-xs w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors"
                />
              </div>
              <button className="mt-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium transition">
                Update Password
              </button>
            </div>

            {/* Description */}
            <div className="col-span-2">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <FileText className="w-3 h-3" /> Description Profile Notes
              </label>
              <textarea 
                rows={2}
                placeholder="Write something about your account..."
                className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 focus:outline-none text-xs w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors resize-none"
                value={descInput}
                onChange={e => setDescInput(e.target.value)}
              />
              <button className="mt-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium transition">
                Save Description
              </button>
            </div>

            {/* Language Selection */}
            <div className="col-span-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Globe className="w-3 h-3" /> Language preference
              </label>
              <select className="rounded-lg border border-neutral-200 dark:border-neutral-600/30 focus:border-neutral-400 dark:focus:border-white/50 outline-none text-xs w-full bg-white dark:bg-[#111]/20 px-3 py-1.5 text-neutral-850 dark:text-white transition-colors mb-2">
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
              </select>
              <button className="rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-3 py-1.5 text-xs font-medium transition">
                Save
              </button>
            </div>

            {/* Multi-Factor Authentication */}
            <div className="col-span-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                <Shield className="w-3 h-3" /> Multi-factor authentication
              </label>
              <p className="text-xs text-neutral-400 mb-2 leading-relaxed">
                TOTP validation security checks are active on this system.
              </p>
              <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase">
                Active / Enforced
              </span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
export default Profile;
