import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Server, Settings, ShieldAlert, LogOut, 
  Users, HardDrive, RotateCw, MonitorPlay, User, Key
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();

  const userLinks = [
    { to: '/', label: 'Instances', icon: MonitorPlay },
    { to: '/profile', label: 'My Profile', icon: User },
  ];

  const adminLinks = [
    { to: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/instances', label: 'Global Instances', icon: MonitorPlay },
    { to: '/admin/nodes', label: 'Host Nodes', icon: Server },
    { to: '/admin/templates', label: 'OS Templates', icon: HardDrive },
    { to: '/admin/apikeys', label: 'API Keys', icon: Key },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldAlert },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
    { to: '/admin/tasks', label: 'Tasks Logs', icon: RotateCw },
  ];

  return (
    <div id="pc-sidebar" className="sidebar transition fixed inset-y-0 z-50 flex w-56 flex-col left-0">
      <div id="pc-sidebar2" className="flex flex-col h-full bg-white/8 dark:bg-[#141414]/8 border-r border-neutral-200/30 dark:border-white/5">
        
        {/* Top: Logo */}
        <div className="pl-6 pt-4 pb-4 flex min-w-0 shrink-0">
          <a href="/" className="flex items-center min-w-0">
            <img src="/assets/logo.png" alt="Logo" className="logo-bg p-1 h-10 w-10 rounded-xl mr-3 shrink-0 inline-flex bg-neutral-950/90 dark:bg-transparent" />
            <h1 className="text-neutral-700 dark:text-white font-medium tracking-tight text-lg truncate min-w-0">CynexVM</h1>
          </a>
        </div>

        {/* User Card Link */}
        <NavLink 
          to="/profile" 
          id="sidebar-account-link" 
          className={({ isActive }) => 
            `sidebar-special-link flex items-center space-x-4 py-4 px-4 border-y border-neutral-800/10 dark:border-white/5 shrink-0 transition-colors group ${
              isActive ? 'bg-neutral-200/40 dark:bg-white/[0.08]' : 'hover:bg-neutral-100 dark:hover:bg-white/[0.05]'
            }`
          }
        >
          <img 
            className="h-8 w-8 rounded-xl border border-neutral-700/10 shrink-0" 
            src={`https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(user?.username || 'user')}`} 
            alt="User avatar" 
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-700 dark:text-white truncate group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
              <span id="sidebar-username">{user?.username}</span>
              <span className="text-xs text-neutral-500">
                <sup className="mt-1">#{(user?.id || 1).toString().padStart(4, '0')}</sup>
              </span>
            </p>
            <p id="sidebar-description" className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
              {user?.role === 'Admin' ? 'Administrator' : 'Customer Account'}
            </p>
          </div>
        </NavLink>

        {/* Scrollable Nav */}
        <nav className="flex-1 overflow-y-auto">
          <ul role="list" className="py-2">
            <li>
              <ul role="list" className="-mx-2 space-y-1 relative">
                {userLinks.map((item) => (
                  <li key={item.to} className="nav-item">
                    <NavLink
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        `nav-link mt-1 px-4 mx-4 group flex gap-x-3 py-1.5 rounded-xl text-sm leading-6 font-normal transition-all duration-200 ${
                          isActive
                            ? 'bg-neutral-200 border border-neutral-350 dark:bg-white/5 dark:border-white/5 text-neutral-950 dark:text-white font-medium'
                            : 'text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white'
                        }`
                      }
                    >
                      <item.icon className="w-5 h-5 mt-0.5" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}

                {user?.role === 'Admin' && (
                  <>
                    <p className="pl-8 text-neutral-600 dark:text-neutral-400 text-xs font-medium pt-6 pb-2">
                      <span>Admin Panel</span>
                    </p>
                    {adminLinks.map((item) => (
                      <li key={item.to} className="nav-item">
                        <NavLink
                          to={item.to}
                          className={({ isActive }) =>
                            `nav-link mt-1 px-4 mx-4 group flex gap-x-3 py-1.5 rounded-xl text-sm leading-6 font-normal transition-all duration-200 ${
                              isActive
                                ? 'bg-neutral-200 border border-neutral-350 dark:bg-white/5 dark:border-white/5 text-neutral-950 dark:text-white font-medium'
                                : 'text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white'
                            }`
                          }
                        >
                          <item.icon className="w-5 h-5 mt-0.5" />
                          <span>{item.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </>
                )}
              </ul>
            </li>
          </ul>
        </nav>

        {/* Static bottom: logout */}
        <div className="shrink-0 border-t border-neutral-800/10 dark:border-white/5">
          <button 
            onClick={logout} 
            id="sidebar-logout-link" 
            className="w-full sidebar-special-link group flex gap-x-3 pl-6 py-4 text-sm font-medium leading-6 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 transition-colors duration-200"
          >
            <LogOut className="w-5 h-5 mt-0.5 shrink-0" />
            <span>Logout</span>
          </button>
        </div>

      </div>
    </div>
  );
};
export default Sidebar;
