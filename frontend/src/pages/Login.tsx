import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Key, Mail, Lock } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, fetchProfile } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA Challenge States
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // 1. Canvas particle animation on left side
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 600);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 800);

    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2 + 1,
      });
    }

    const handleResize = () => {
      width = canvas.width = canvas.parentElement?.clientWidth || 600;
      height = canvas.height = canvas.parentElement?.clientHeight || 800;
    };
    window.addEventListener('resize', handleResize);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
      ctx.fillRect(0, 0, width, height);

      // Draw grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw particles
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      });

      // Link nearby particles
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.1)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
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
    <div className="min-h-screen w-full flex">
      {/* Left Wallpaper Split (55%) */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 overflow-hidden bg-[#09090B] border-r border-borderSubtle">
        <canvas ref={canvasRef} className="absolute inset-0 z-0" />
        
        {/* Logo Branding */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-xl text-white shadow-glow">C</div>
          <span className="font-bold text-xl tracking-wider text-white">CynexVM</span>
        </div>

        {/* Marketing Slogan */}
        <div className="relative z-10 space-y-4 max-w-lg">
          <h1 className="text-4xl font-bold tracking-tight text-white leading-tight">
            Commercial SaaS-Grade Linux Container Virtualization.
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Manage full-lifecycle LXC VPS instances directly inside your Proxmox clusters. Styled with premium glassmorphism interfaces and guarded by zero-trust security.
          </p>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-gray-500">
          &copy; {new Date().getFullYear()} CynexVM Panel. All rights reserved.
        </div>
      </div>

      {/* Right Form Split (45%) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-[#09090B]">
        <div className="w-full max-w-md glass-panel p-8 rounded-card border border-borderSubtle shadow-2xl relative">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-indigo-600/10 rounded-full blur-3xl" />

          {/* Heading */}
          <div className="mb-8 relative z-10">
            <h2 className="text-2xl font-bold text-white tracking-wide">
              {requires2FA ? 'Two-Factor Challenge' : 'Sign In'}
            </h2>
            <p className="text-gray-400 text-xs mt-1 leading-relaxed">
              {requires2FA 
                ? 'Enter the 6-digit verification code from your authenticator app.' 
                : 'Welcome back! Authenticate to access your container instances.'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs font-semibold relative z-10">
              {error}
            </div>
          )}

          {/* Login Form */}
          {!requires2FA ? (
            <form onSubmit={handleLogin} className="space-y-4 relative z-10">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 font-medium block">Username or Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 text-gray-500" size={16} />
                  <input
                    type="text"
                    placeholder="admin@gmail.com"
                    className="w-full bg-white/5 border border-borderSubtle rounded-btn pl-11 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 font-medium block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 text-gray-500" size={16} />
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-borderSubtle rounded-btn pl-11 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 text-gray-400 hover:text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-gray-800 bg-white/5 text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  Remember Me
                </label>
                <Link to="/forgot-password" className="text-blue-500 hover:underline">Forgot password?</Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full glass-button-primary py-3 text-sm text-white font-bold rounded-btn transition-all mt-6 shadow-glow"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          ) : (
            // 2FA Verification Form
            <form onSubmit={handle2FAVerify} className="space-y-4 relative z-10">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 font-medium block">6-Digit Code</label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-3 text-gray-500" size={16} />
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    className="w-full bg-white/5 border border-borderSubtle rounded-btn pl-11 pr-4 py-2.5 text-sm text-white font-mono tracking-widest text-center placeholder-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full glass-button-primary py-3 text-sm text-white font-bold rounded-btn transition-all mt-6 shadow-glow"
              >
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          )}

          <div className="mt-8 text-center text-xs text-gray-500 relative z-10">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-500 hover:underline font-medium">Create account</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Login;
