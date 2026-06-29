import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export const Register: React.FC = () => {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

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

      setSuccess('Account created successfully! Redirecting...');
      setTimeout(() => {
        navigate('/login');
      }, 1500);
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
        <div className="flex items-center gap-3">
          <img src="/assets/logo.svg" alt="" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-semibold text-base tracking-wide">CynexVM</span>
        </div>

        <div className="space-y-3 max-w-sm">
          <h1 className="text-xl font-medium tracking-tight text-white leading-tight">
            LXC Virtualization Control Panel.
          </h1>
          <p className="text-gray-500 text-xs leading-relaxed">
            Provision and manage containers directly inside Proxmox nodes. A clean, minimal layout designed exclusively for infrastructure management.
          </p>
        </div>

        <div className="text-[10px] text-gray-600">
          &copy; {new Date().getFullYear()} CynexVM.
        </div>
      </div>

      {/* Right Form Split (45%) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-[#09090B]">
        <div className="w-full max-w-sm al-card p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Create Account</h2>
            <p className="text-gray-500 text-xs mt-1">Register to start managing your VPS instances.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-btn text-xs">
              {success}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium block">Username</label>
              <input
                type="text"
                placeholder="admin"
                className="w-full al-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 font-medium block">Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full al-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {loading ? 'Registering...' : 'Register'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-500 hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Register;
