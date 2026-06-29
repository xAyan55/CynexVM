import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
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
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">Reset Password</h1>
          <p className="text-sm text-neutral-500 mt-1">recovery link will be generated</p>
        </div>

        {success ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 mb-5 text-xs text-emerald-400">
            A password reset link has been dispatched to your email address.
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="on" noValidate>
            <div className="space-y-4">
              <div>
                <label className="auth-label" htmlFor="email">Email Address</label>
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

              <button 
                type="submit" 
                className={`auth-submit ${loading ? 'loading' : ''}`} 
                disabled={loading}
              >
                {!loading && <span className="btn-label">Send Reset Link</span>}
                {loading && <span className="spinner"></span>}
              </button>
            </div>
          </form>
        )}

        <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mt-6">
          Remembered password?{' '}
          <Link to="/login" className="font-medium text-neutral-850 dark:text-neutral-200 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      <div className="auth-image"></div>
    </div>
  );
};
export default ForgotPassword;
