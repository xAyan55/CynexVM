import React, { createContext, useState, useEffect, useContext } from 'react';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
  twoFactorEnabled: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string, userData: User) => void;
  logout: () => Promise<void>;
  fetchProfile: (authToken?: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-login on load if token is cached
  useEffect(() => {
    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
      setToken(savedToken);
      fetchProfile(savedToken).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const fetchProfile = async (authToken?: string) => {
    const activeToken = authToken || token;
    if (!activeToken) return false;

    try {
      const res = await fetch('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      } else {
        // Token might be expired, clear auth
        clearAuth();
        return false;
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      return false;
    }
  };

  const login = (accessToken: string, refreshToken: string, userData: User) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setToken(accessToken);
    setUser(userData);
  };

  const clearAuth = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setToken(null);
    setUser(null);
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (_) {}
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
