import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Sidebar } from './components/Sidebar';
import { CommandPalette } from './components/CommandPalette';

// Pages
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Instances } from './pages/Instances';
import { InstanceDetails } from './pages/InstanceDetails';
import { Nodes } from './pages/Nodes';
import { AuditLogs } from './pages/AuditLogs';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';

// Protected layout wrapper
const AppLayout: React.FC = () => {
  const { user, loading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center text-xs text-gray-500">
        Authenticating session...
      </div>
    );
  }

  // Redirect to login if session is empty
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SocketProvider>
      <div className="min-h-screen bg-[#09090B] flex text-white relative">
        {/* Navigation Sidebar */}
        <Sidebar onSearchOpen={() => setSearchOpen(true)} />
        
        {/* Command Search Palette */}
        <CommandPalette isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* Routed Content page */}
        <main className="flex-1 p-6 overflow-y-auto max-h-screen">
          {/* Top Navbar Greeting header */}
          <header className="flex justify-between items-center mb-6 pb-4 border-b border-borderSubtle">
            <div className="text-xs text-gray-400">
              Welcome back, <span className="text-white font-semibold">{user.username}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-gray-500 font-medium tracking-wide uppercase">CynexVM API Link Active</span>
            </div>
          </header>

          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
};

export const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public Auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Secure Panel routes */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/instances" element={<Instances />} />
            <Route path="/instances/:id" element={<InstanceDetails />} />
            <Route path="/profile" element={<Profile />} />
            
            {/* Admin only subroutes */}
            <Route path="/admin/nodes" element={<Nodes />} />
            <Route path="/admin/audit-logs" element={<AuditLogs />} />
            <Route path="/admin/settings" element={<Settings />} />
          </Route>

          {/* Catch-all redirects */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
};
export default App;
