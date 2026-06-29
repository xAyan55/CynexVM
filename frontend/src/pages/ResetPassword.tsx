import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1000);
  };

  return (
    <div className="auth-split">
      <div className={`auth-panel ${visible ? 'visible' : ''}`} id="authPanel">
        <div className="mb-8">
          <img src="/assets/logo.png" alt="" className="h-10 w-10 rounded-xl object-contain mb-5" />
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Choose New Password</h1>
          <p className="text-sm text-neutral-500 mt-1">Enter your new credentials</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 text-xs text-emerald-400">
              Password has been successfully reset.
            </div>
            <Link to="/login" className="block text-center font-semibold text-neutral-850 dark:text-neutral-250 hover:underline">
              Proceed to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off" noValidate>
            <div className="space-y-4">
              <div>
                <label className="auth-label" htmlFor="password">New Password</label>
                <input 
                  id="password" 
                  type="password" 
                  autoComplete="new-password"
                  required 
                  className="auth-input" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="auth-label" htmlFor="confirmPassword">Confirm Password</label>
                <input 
                  id="confirmPassword" 
                  type="password" 
                  autoComplete="new-password"
                  required 
                  className="auth-input" 
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className={`auth-submit ${loading ? 'loading' : ''}`} 
                disabled={loading}
              >
                {!loading && <span className="btn-label">Update Password</span>}
                {loading && <span className="spinner"></span>}
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="auth-image"></div>
    </div>
  );
};
export default ResetPassword;
