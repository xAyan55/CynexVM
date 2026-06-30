import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Check } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, settings } = useAuth();
  const navigate = useNavigate();

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA Challenge States
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Page visible entrance animation class
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate');
      }

      if (data.requires2FA) {
        setRequires2FA(true);
        setLoading(false);
        return;
      }

      login(data.accessToken, data.refreshToken, data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, code: totpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '2FA verification failed');
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
    <div className="auth-split">
      <div className={`auth-panel ${visible ? 'visible' : ''}`} id="authPanel">
        <div className="mb-8">
          <img 
            src={settings.logo_url || "/assets/logo.png"} 
            alt="" 
            className="h-10 w-10 rounded-xl object-contain mb-5" 
            onError={(e) => { e.currentTarget.src = "/assets/logo.png"; }}
          />
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Sign in</h1>
          <p className="text-sm text-neutral-500 mt-1">to {settings.panel_name || 'CynexVM'}</p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 mb-5">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          </div>
        )}

        {!requires2FA ? (
          <form onSubmit={handleLogin} autoComplete="on" noValidate>
            <div className="space-y-4">
              <div>
                <label className="auth-label" htmlFor="identifier">Username or email</label>
                <input 
                  id="identifier" 
                  type="text" 
                  autoComplete="username"
                  required 
                  spellCheck="false" 
                  autoCapitalize="none"
                  className="auth-input" 
                  placeholder="you@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="auth-label mb-0" htmlFor="password">Password</label>
                </div>
                <input 
                  id="password" 
                  type="password" 
                  autoComplete="current-password"
                  required 
                  className="auth-input" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className={`auth-submit ${loading ? 'loading' : ''}`} 
                disabled={loading}
              >
                {!loading && <span className="btn-label">Continue</span>}
                {loading && <span className="spinner"></span>}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handle2FAVerify} autoComplete="off" noValidate>
            <div className="space-y-4">
              <div>
                <label className="auth-label" htmlFor="totp">Authenticator Token</label>
                <input 
                  id="totp" 
                  type="text" 
                  maxLength={6}
                  required 
                  className="auth-input text-center tracking-widest font-mono" 
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className={`auth-submit ${loading ? 'loading' : ''}`} 
                disabled={loading}
              >
                {!loading && <span className="btn-label">Verify & Challenge</span>}
                {loading && <span className="spinner"></span>}
              </button>
            </div>
          </form>
        )}

        {settings.registration_enabled !== 'false' && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-neutral-850 dark:text-neutral-200 hover:underline">
              Create one
            </Link>
          </p>
        )}
      </div>
      <div 
        className="auth-image animate-pulse-slow" 
        style={{ backgroundImage: settings.login_image_url ? `url(${settings.login_image_url})` : undefined }}
      ></div>
    </div>
  );
};
export default Login;
