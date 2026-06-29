import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Server, Terminal, 
  Settings, Users, ShieldAlert, LogOut, ChevronLeft, ChevronRight, Activity, Search
} from 'lucide-react';

interface SidebarProps {
  onSearchOpen: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSearchOpen }) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const userLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/instances', label: 'Instances', icon: Server },
    { to: '/profile', label: 'Profile', icon: Users },
  ];

  const adminLinks = [
    { to: '/admin/nodes', label: 'Nodes', icon: Server },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldAlert },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className={`glass-panel m-4 rounded-card flex flex-col justify-between transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'} h-[calc(100vh-2rem)] sticky top-4 overflow-y-auto z-40`}>
      {/* Top Branding Section */}
      <div>
        <div className="p-4 border-b border-borderSubtle flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-glow">C</div>
              <span className="font-semibold text-lg tracking-wide text-white">CynexVM</span>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-glow mx-auto">C</div>
          )}
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className="p-1 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Global Search Button */}
        <div className="p-3">
          <button 
            onClick={onSearchOpen}
            className="w-full flex items-center gap-3 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-btn text-gray-400 hover:text-white transition-all text-sm border border-borderSubtle hover:scale-[1.02]"
          >
            <Search size={16} />
            {!collapsed && <span>Search (Ctrl+K)</span>}
          </button>
        </div>

        {/* Nav Links */}
        <nav className="p-3 space-y-1">
          <span className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
            {collapsed ? '•' : 'Navigation'}
          </span>
          {userLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-all duration-200 ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-glow hover:scale-[1.02]' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <link.icon size={18} />
              {!collapsed && <span>{link.label}</span>}
            </NavLink>
          ))}

          {/* Admin Control Links */}
          {user?.role === 'Admin' && (
            <div className="pt-4 space-y-1">
              <span className="px-3 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                {collapsed ? '•' : 'Administration'}
              </span>
              {adminLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-all duration-200 ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-glow hover:scale-[1.02]' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <link.icon size={18} />
                  {!collapsed && <span>{link.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
      </div>

      {/* Footer Profile Section */}
      <div className="p-3 border-t border-borderSubtle">
        <div className="flex items-center justify-between gap-3 p-1">
          {!collapsed && (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center font-semibold text-white uppercase border border-borderSubtle">
                {user?.username.slice(0, 2)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-medium text-white truncate">{user?.username}</p>
                <p className="text-[10px] text-gray-500 truncate">{user?.role}</p>
              </div>
            </div>
          )}
          <button 
            onClick={logout} 
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;
