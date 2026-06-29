import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, AlertTriangle, CheckCircle, X } from 'lucide-react';

export const Profile: React.FC = () => {
  const { user, fetchProfile } = useAuth();
  
  // 2FA Setup state
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleStart2faSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setShow2faSetup(true);
      } else {
        throw new Error(data.error || 'Failed to initiate 2FA setup');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: verificationCode })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Two-factor authentication enabled successfully!');
        setShow2faSetup(false);
        setVerificationCode('');
        fetchProfile();
      } else {
        throw new Error(data.error || 'Verification code failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return <div className="p-12 text-center text-gray-500">Loading user profile...</div>;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-white tracking-wide">Account Profile</h1>
        <p className="text-xs text-gray-400">View profile credentials and configure security settings.</p>
      </div>

      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-btn text-xs font-semibold flex items-center gap-2">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Account Info Card */}
      <div className="al-card p-6 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-white">General Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] text-gray-500 block">Username</span>
            <span className="text-white font-semibold">{user.username}</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 block">Email Address</span>
            <span className="text-white font-semibold">{user.email}</span>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 block">Assigned Role</span>
            <span className="text-white font-semibold">{user.role}</span>
          </div>
        </div>
      </div>

      {/* Security Policies 2FA */}
      <div className="al-card p-6 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield size={16} className="text-blue-500" /> Multi-Factor Authentication
        </h3>
        <p className="text-gray-400 leading-relaxed text-[11px]">
          Enhance security by requiring an authenticator code (TOTP) from your mobile device during sign in attempts.
        </p>

        {user.twoFactorEnabled ? (
          <div className="flex items-center gap-2 text-emerald-400 font-semibold bg-emerald-500/5 border border-emerald-500/15 p-3 rounded-btn">
            <CheckCircle size={16} /> Two-factor authentication (TOTP) is active on this account.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-400 bg-amber-500/5 border border-amber-500/15 p-3 rounded-btn">
              <AlertTriangle size={16} /> 2FA is currently disabled. We strongly recommend enabling it.
            </div>
            <button 
              onClick={handleStart2faSetup}
              className="al-btn al-btn-primary px-4 py-2 font-bold"
              disabled={loading}
            >
              Configure 2FA Setup
            </button>
          </div>
        )}
      </div>

      {/* 2FA Setup Modal Popup */}
      {show2faSetup && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm al-card p-6 space-y-4 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-borderSubtle pb-2">
              <h3 className="text-sm font-bold text-white">Configure Authenticator App</h3>
              <button onClick={() => setShow2faSetup(false)} className="text-gray-400 hover:text-white"><X size={16} /></button>
            </div>
            
            <p className="text-[10px] text-gray-400 text-center leading-relaxed">
              Scan the QR code below using Google Authenticator, Authy, or your preferred TOTP client.
            </p>

            <div className="bg-white p-2 rounded-lg w-44 h-44 mx-auto flex items-center justify-center border border-borderSubtle">
              <img src={qrCode} alt="2FA QR Code" className="w-full h-full" />
            </div>

            <div className="text-center font-mono text-[10px] bg-secondaryBg/40 p-2 rounded text-gray-300 select-all border border-borderSubtle">
              Secret: {secret}
            </div>

            <form onSubmit={handleConfirm2fa} className="space-y-3 pt-2 text-xs">
              <div>
                <label className="text-[10px] text-gray-500 block mb-1">Enter Authenticator Verification Code</label>
                <input 
                  type="text" maxLength={6} placeholder="123456" className="w-full al-input text-center tracking-widest font-mono"
                  value={verificationCode} onChange={e => setVerificationCode(e.target.value)} required
                />
              </div>
              <button type="submit" className="w-full al-btn al-btn-primary py-2.5 font-bold" disabled={loading}>
                Verify and Activate
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default Profile;
