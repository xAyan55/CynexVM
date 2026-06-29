import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export const Register: React.FC = () => {
  const navigate = useNavigate();

  // Form fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Validation / Feedback states
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Entrance animation state
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  // Password strength computation variables (matches register.ejs logic)
  const getPasswordStrength = () => {
    if (!password) return { width: '0%', color: '', label: '8+ characters, one letter, one number.' };
    const score = [
      password.length >= 8,
      /[A-Za-z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password)
    ].filter(Boolean).length;

    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
    const labels = ['Too short', 'Weak', 'Fair', 'Strong'];
    const widths = ['25%', '50%', '75%', '100%'];
    const idx = Math.max(0, score - 1);

    return {
      width: widths[idx],
      color: colors[idx],
      label: labels[idx]
    };
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Front-end validation rules matching register.ejs
    if (username.length < 3 || !/^[A-Za-z0-9]+$/.test(username)) {
      setError('Username must be 3–20 characters, letters and numbers only.');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password needs 8+ chars, at least one letter and one number.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      navigate('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength();

  return (
    <div className="auth-split">
      <div className={`auth-panel ${visible ? 'visible' : ''}`} id="authPanel">
        <div className="mb-8">
          <img src="/assets/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain mb-5" />
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Create account</h1>
          <p className="text-sm text-neutral-500 mt-1">CynexVM</p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 mb-5">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleRegister} autoComplete="on" noValidate>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="auth-label" htmlFor="username">Username</label>
                <input 
                  id="username" 
                  type="text" 
                  autoComplete="username"
                  required 
                  spellCheck="false" 
                  autoCapitalize="none" 
                  maxLength={20}
                  className="auth-input" 
                  placeholder="johndoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="auth-label" htmlFor="email">Email</label>
                <input 
                  id="email" 
                  type="email" 
                  autoComplete="email"
                  required 
                  className="auth-input" 
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="auth-label" htmlFor="password">Password</label>
              <div className="pw-wrapper">
                <input 
                  id="password" 
                  type={showPassword ? 'text' : 'password'} 
                  autoComplete="new-password"
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
                  aria-label="Show/Hide password"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {/* Password Strength Meter */}
              <div className="pw-strength">
                <div 
                  className="pw-bar" 
                  style={{ 
                    width: strength.width, 
                    backgroundColor: strength.color 
                  }}
                ></div>
              </div>
              <p 
                className="pw-hint" 
                style={{ color: strength.color || undefined }}
              >
                {strength.label}
              </p>
            </div>

            <button 
              type="submit" 
              className={`auth-submit ${loading ? 'loading' : ''}`} 
              disabled={loading}
            >
              {!loading && <span className="btn-label">Create account</span>}
              {loading && <span className="spinner"></span>}
            </button>
          </div>
        </form>

        <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mt-6">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-neutral-800 dark:text-neutral-200 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      
      {/* Right panel split wallpaper for registration */}
      <div 
        className="auth-image" 
        style={{ backgroundImage: "url('/assets/wallpapers/register.jpeg')" }}
      ></div>
    </div>
  );
};
export default Register;
