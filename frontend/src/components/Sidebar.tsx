import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Server, Terminal, 
  Settings, Users, ShieldAlert, LogOut, ChevronLeft, ChevronRight, Search
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
    <aside className={`border-r border-borderSubtle bg-cardBg flex flex-col justify-between transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'} h-screen sticky top-0 overflow-y-auto z-40`}>
      {/* Top Branding Section */}
      <div>
        <div className="p-4 border-b border-borderSubtle flex items-center justify-between h-14">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <img src="/assets/logo.svg" alt="" className="w-5 h-5 object-contain" />
              <span className="font-semibold text-sm tracking-wide text-white">CynexVM</span>
            </div>
          )}
          {collapsed && (
            <img src="/assets/logo.svg" alt="" className="w-5 h-5 object-contain mx-auto" />
          )}
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className="p-1 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Global Search Button */}
        <div className="p-2 border-b border-borderSubtle">
          <button 
            onClick={onSearchOpen}
            className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#111827] hover:bg-white/5 rounded text-gray-500 hover:text-gray-300 transition-all text-xs border border-borderSubtle"
          >
            <Search size={14} />
            {!collapsed && <span>Search</span>}
          </button>
        </div>

        {/* Nav Links */}
        <nav className="py-2 space-y-0.5">
          {userLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-2.5 text-xs transition-all duration-150 border-l-2 ${
                  isActive 
                    ? 'border-accentBlue bg-white/5 text-white font-medium' 
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`
              }
            >
              <link.icon size={15} />
              {!collapsed && <span>{link.label}</span>}
            </NavLink>
          ))}

          {/* Admin Control Links */}
          {user?.role === 'Admin' && (
            <div className="pt-2 space-y-0.5">
              <span className="px-4 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider block">
                {!collapsed && 'Admin'}
              </span>
              {adminLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-4 py-2.5 text-xs transition-all duration-150 border-l-2 ${
                      isActive 
                        ? 'border-accentBlue bg-white/5 text-white font-medium' 
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`
                  }
                >
                  <link.icon size={15} />
                  {!collapsed && <span>{link.label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
      </div>

      {/* Footer Profile Section */}
      <div className="p-3 border-t border-borderSubtle">
        <div className="flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-7 h-7 rounded bg-white/5 border border-borderSubtle flex items-center justify-center font-semibold text-[11px] text-white uppercase shrink-0">
                {user?.username.slice(0, 2)}
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] font-medium text-white truncate">{user?.username}</p>
                <p className="text-[9px] text-gray-500 truncate capitalize">{user?.role}</p>
              </div>
            </div>
          )}
          <button 
            onClick={logout} 
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/5 rounded transition-all mx-auto lg:mx-0"
            title="Log out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;
