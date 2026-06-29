import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Terminal, Server, Shield, Settings } from 'lucide-react';

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
    { name: 'Navigate to Dashboard', action: () => navigate('/'), icon: Server, category: 'Navigation' },
    { name: 'Navigate to Instances', action: () => navigate('/instances'), icon: Terminal, category: 'Navigation' },
    { name: 'Configure System Settings', action: () => navigate('/admin/settings'), icon: Settings, category: 'Admin' },
    { name: 'Inspect System Logs', action: () => navigate('/admin/audit-logs'), icon: Shield, category: 'Admin' },
    { name: 'Configure Hypervisor Nodes', action: () => navigate('/admin/nodes'), icon: Server, category: 'Admin' },
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
        if (isOpen) onClose();
        else onClose(); // parent handles toggle
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
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
        className="w-full max-w-lg al-card overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-borderSubtle bg-secondaryBg/20">
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
        <div className="max-h-80 overflow-y-auto p-1.5 bg-cardBg">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500">No commands found</div>
          ) : (
            filtered.map((cmd, idx) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.name}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-btn text-left text-xs transition-colors ${
                    idx === selectedIndex 
                      ? 'bg-blue-600 text-white font-medium' 
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={14} />
                    <span>{cmd.name}</span>
                  </div>
                  <span className="text-[9px] text-gray-500 uppercase">{cmd.category}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
export default CommandPalette;
