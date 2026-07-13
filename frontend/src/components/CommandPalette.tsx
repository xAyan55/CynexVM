import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Terminal, Server, Shield, Settings, Users, HardDrive, RotateCw, MonitorPlay, Mail } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = [
    { name: 'Navigate to Instances Dashboard', action: () => navigate('/'), icon: MonitorPlay, category: 'User Panel' },
    { name: 'View Account Settings & Keys', action: () => navigate('/profile'), icon: Settings, category: 'User Panel' },
    { name: 'Forgot Password Retrieval', action: () => navigate('/forgot-password'), icon: Shield, category: 'Authentication' },
    { name: 'Reset Account Password', action: () => navigate('/reset-password'), icon: Shield, category: 'Authentication' },
    
    // Admin Commands
    { name: 'Admin Cluster Overview', action: () => navigate('/admin/dashboard'), icon: Server, category: 'Admin Panel' },
    { name: 'Manage User Accounts', action: () => navigate('/admin/users'), icon: Users, category: 'Admin Panel' },
    { name: 'Global Container Allocations', action: () => navigate('/admin/instances'), icon: MonitorPlay, category: 'Admin Panel' },
    { name: 'Configure Host Nodes', action: () => navigate('/admin/nodes'), icon: Server, category: 'Admin Panel' },
    { name: 'Registry OS Templates', action: () => navigate('/admin/templates'), icon: HardDrive, category: 'Admin Panel' },
    { name: 'Inspect Security Audit Logs', action: () => navigate('/admin/audit-logs'), icon: Shield, category: 'Admin Panel' },
    { name: 'Email System & SMTP Configuration', action: () => navigate('/admin/email'), icon: Mail, category: 'Admin Panel' },
    { name: 'Configure Global OAuth', action: () => navigate('/admin/settings'), icon: Settings, category: 'Admin Panel' },
    { name: 'Monitor Task Workers Queue', action: () => navigate('/admin/jobs'), icon: RotateCw, category: 'Admin Panel' },
  ];

  const filtered = commands.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  // Monitor shortcut triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
      setQuery('');
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24 px-4">
      <div 
        className="w-full max-w-lg al-card overflow-hidden bg-[#1a1a1a]"
        onKeyDown={handleKeyDown}
      >
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 bg-neutral-900/40">
          <Search className="text-gray-400" size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or page name..."
            className="w-full bg-transparent border-0 outline-none text-white text-xs placeholder-gray-500 font-sans"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400">ESC</span>
        </div>

        {/* Filtered Search Results */}
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">No commands found</div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              return (
                <div
                  key={cmd.name}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition select-none ${
                    selectedIndex === idx 
                      ? 'bg-white/10 text-white' 
                      : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={14} />
                    <span className="text-xs font-medium">{cmd.name}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider font-semibold opacity-60">
                    {cmd.category}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
export default CommandPalette;
