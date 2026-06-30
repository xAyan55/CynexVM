import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { Search } from 'lucide-react';

// Public/Auth Pages
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { EmailVerification } from './pages/EmailVerification';

// User Panel Pages
import { Dashboard } from './pages/Dashboard';
import { InstanceDetails } from './pages/InstanceDetails';
import { Profile } from './pages/Profile';

// Admin Panel Pages
import { Nodes } from './pages/Nodes';
import { AuditLogs } from './pages/AuditLogs';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminInstances } from './pages/AdminInstances';
import { TemplatesImages } from './pages/TemplatesImages';
import { AdminSettings } from './pages/AdminSettings';
import { JobsQueues } from './pages/JobsQueues';

// Page loading spinner matching Airlink's preparing experience screen
const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-[#0f0f0f]">
      <div className="flex flex-col items-center gap-4">
        <img src="/assets/logo.png" alt="" className="w-[42px] h-[42px] object-contain rounded-xl" />
        <p className="text-sm font-semibold tracking-tight text-white font-sans">CynexVM</p>
        <div className="w-32 h-[1.5px] bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-white animate-pulse w-full"></div>
        </div>
        <p className="text-[11px] text-neutral-500 font-sans">Preparing your experience...</p>
      </div>
    </div>
  );
};

// Protected layout wrapper
const AppLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  // Bind CTRL + K keyboard shortcut matching template.ejs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SocketProvider>
      <div className="h-screen bg-neutral-50 dark:bg-[#0f0f0f] text-neutral-800 dark:text-[#a3a3a3] antialiased">
        <div className="flex h-screen overflow-hidden">
          {/* Navigation Sidebar */}
          <Sidebar />

          {/* Page column container with header offset */}
          <div id="colcont" className="flex-1 lg:pl-56 flex flex-col min-w-0">
            {/* Top Fixed Header Navigation */}
            <div className="fixed top-0 left-0 lg:left-56 right-0 z-40 flex h-16 shrink-0 items-center gap-x-4 bg-white/8 dark:bg-[#141414]/8 backdrop-blur-xl border-b border-neutral-200/30 dark:border-white/5 px-4 sm:gap-x-6 sm:px-4 lg:px-4">
              <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
                <div className="relative flex flex-1 flex-col">
                  
                  {/* Search Bar Input (triggers palette) */}
                  <div 
                    onClick={() => setSearchOpen(true)}
                    className="lg:-ml-2 flex items-center w-fit mt-3 px-4 py-2 h-10 rounded-xl border border-neutral-300 dark:border-white/5 active:scale-100 duration-200 hover:border-neutral-400 dark:hover:border-neutral-300/10 bg-transparent text-neutral-800 dark:text-white cursor-pointer"
                    role="search"
                  >
                    <Search className="h-5 w-5 text-neutral-400 shrink-0" />
                    <span className="bg-transparent border-transparent ml-2 text-sm text-zinc-500 font-normal select-none pr-8">
                      Search
                    </span>
                    <div className="ml-2 px-1 py-0.5 text-[10px] w-[55px] font-medium text-neutral-700 dark:text-neutral-400 bg-neutral-200 dark:bg-neutral-800 rounded-md border border-neutral-300 dark:border-neutral-700 text-center shrink-0">
                      CTRL + K
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Routed Content Viewport */}
            <main id="page-content" className="flex-1 overflow-y-auto pt-16">
              <div className="px-12 pt-6 pb-8">
                <Outlet />
              </div>
            </main>
          </div>
        </div>

        {/* Command Search Palette */}
        <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </SocketProvider>
  );
};

// Protected Admin Route wrapper
const AdminRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
  const { user } = useAuth();
  if (!user || user.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }
  return element;
};

export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public Auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<EmailVerification />} />

          {/* Secure Panel routes */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/instances/:id" element={<InstanceDetails />} />
            <Route path="/profile" element={<Profile />} />
            
            {/* Admin only subroutes */}
            <Route path="/admin/dashboard" element={<AdminRoute element={<AdminDashboard />} />} />
            <Route path="/admin/users" element={<AdminRoute element={<AdminUsers />} />} />
            <Route path="/admin/instances" element={<AdminRoute element={<AdminInstances />} />} />
            <Route path="/admin/nodes" element={<AdminRoute element={<Nodes />} />} />
            <Route path="/admin/templates" element={<AdminRoute element={<TemplatesImages />} />} />
            <Route path="/admin/audit-logs" element={<AdminRoute element={<AuditLogs />} />} />
            <Route path="/admin/settings" element={<AdminRoute element={<AdminSettings />} />} />
            <Route path="/admin/tasks" element={<AdminRoute element={<JobsQueues />} />} />
          </Route>

          {/* Catch-all redirects */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
};
export default App;
