import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA Challenge States
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, deviceId: 'browser' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.requires2FA) {
        setRequires2FA(true);
        setTempToken(data.tempToken);
      } else {
        login(data.accessToken, data.refreshToken, data.user);
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/2fa/validate-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, code: totpCode, deviceId: 'browser' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid 2FA code');
      }

      login(data.accessToken, data.refreshToken, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#09090B] text-white">
      {/* Left Branding Split (55%) */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between p-16 border-r border-borderSubtle bg-[#09090B]">
        {/* Logo Branding */}
        <div className="flex items-center gap-3">
          <img src="/assets/logo.svg" alt="" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-semibold text-base tracking-wide">CynexVM</span>
        </div>

        {/* Small Description */}
        <div className="space-y-3 max-w-sm">
          <h1 className="text-xl font-medium tracking-tight text-white leading-tight">
            LXC Virtualization Control Panel.
          </h1>
          <p className="text-gray-500 text-xs leading-relaxed">
            Provision and manage containers directly inside Proxmox nodes. A clean, minimal layout designed exclusively for infrastructure management.
          </p>
        </div>

        {/* Footer info */}
        <div className="text-[10px] text-gray-600">
          &copy; {new Date().getFullYear()} CynexVM.
        </div>
      </div>

      {/* Right Form Split (45%) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-[#09090B]">
        <div className="w-full max-w-sm al-card p-8">
          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">
              {requires2FA ? 'Two-Factor Challenge' : 'Sign in'}
            </h2>
            <p className="text-gray-500 text-xs mt-1">
              {requires2FA 
                ? 'Enter your authenticator token code.' 
                : 'to access your container instances.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs">
              {error}
            </div>
          )}

          {/* Login Form */}
          {!requires2FA ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium block">Username or Email</label>
                <input
                  type="text"
                  placeholder="you@example.com"
                  className="w-full al-input"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium block">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full al-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full al-btn al-btn-primary py-2.5 mt-4"
              >
                {loading ? 'Authenticating...' : 'Sign in'}
              </button>
            </form>
          ) : (
            // 2FA Verification Form
            <form onSubmit={handle2FAVerify} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-medium block">Authenticator Token</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  className="w-full al-input text-center tracking-widest font-mono"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full al-btn al-btn-primary py-2.5 mt-4"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-500 hover:underline">Create account</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
