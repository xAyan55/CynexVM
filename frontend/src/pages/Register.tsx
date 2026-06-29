import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Check } from 'lucide-react';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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
      }, 2000);
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
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-xl text-white shadow-glow">C</div>
          <span className="font-bold text-xl tracking-wider text-white">CynexVM</span>
        </div>
        <div className="relative z-10 space-y-4 max-w-lg">
          <h1 className="text-4xl font-bold tracking-tight text-white leading-tight">
            Commercial SaaS-Grade Linux Container Virtualization.
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Manage full-lifecycle LXC VPS instances directly inside your Proxmox clusters. Styled with premium glassmorphism interfaces and guarded by zero-trust security.
          </p>
        </div>
        <div className="relative z-10 text-xs text-gray-500">
          &copy; {new Date().getFullYear()} CynexVM Panel. All rights reserved.
        </div>
      </div>

      {/* Right Form Split (45%) */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-[#09090B]">
        <div className="w-full max-w-md glass-panel p-8 rounded-card border border-borderSubtle shadow-2xl relative">
          <div className="mb-8 relative z-10">
            <h2 className="text-2xl font-bold text-white tracking-wide">Create Account</h2>
            <p className="text-gray-400 text-xs mt-1">Register to start managing your VPS instances.</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-btn text-xs font-semibold relative z-10">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-btn text-xs font-semibold flex items-center gap-2 relative z-10">
              <Check size={16} /> {success}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4 relative z-10">
            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 font-medium block">Username</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 text-gray-500" size={16} />
                <input
                  type="text"
                  placeholder="admin"
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn pl-11 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 font-medium block">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-gray-500" size={16} />
                <input
                  type="email"
                  placeholder="admin@gmail.com"
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn pl-11 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full glass-button-primary py-3 text-sm text-white font-bold rounded-btn transition-all mt-6 shadow-glow"
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
          </form>

          <div className="mt-8 text-center text-xs text-gray-500 relative z-10">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-500 hover:underline font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Register;
