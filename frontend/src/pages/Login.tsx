import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Check } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

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
        throw new Error(data.error || 'Incorrect username or password.');
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
    <div className="auth-split">
      <div className={`auth-panel ${visible ? 'visible' : ''}`} id="authPanel">
        <div className="mb-8">
          <img src="/assets/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain mb-5" />
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Sign in</h1>
          <p className="text-sm text-neutral-500 mt-1">to CynexVM</p>
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
                <label className="auth-label" htmlFor="password">Password</label>
                <div className="pw-wrapper">
                  <input 
                    id="password" 
                    type={showPassword ? 'text' : 'password'} 
                    autoComplete="current-password"
                    required 
                    className="auth-input" 
                    placeholder="••••••••" 
                    style={{ paddingRight: '40px' }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    className="pw-toggle" 
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Show password"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <label className="cb-row" id="rememberLabel" onClick={() => setRemember(!remember)}>
                <span 
                  className="cb-box" 
                  style={{
                    backgroundColor: remember ? '#ffffff' : '',
                    borderColor: remember ? '#ffffff' : ''
                  }}
                >
                  {remember && <Check size={10} strokeWidth={2.5} className="text-neutral-900" />}
                </span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">Remember me</span>
              </label>

              <button 
                type="submit" 
                className={`auth-submit ${loading ? 'loading' : ''}`} 
                disabled={loading}
              >
                {!loading && <span className="btn-label">Sign in</span>}
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

        <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-neutral-850 dark:text-neutral-200 hover:underline">
            Create one
          </Link>
        </p>
      </div>
      <div className="auth-image"></div>
    </div>
  );
};
export default Login;
