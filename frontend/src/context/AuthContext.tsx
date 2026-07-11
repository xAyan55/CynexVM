import React, { createContext, useState, useEffect, useContext } from 'react';

export interface SystemSettings {
  panel_name?: string;
  welcome_message?: string;
  maintenance_mode?: string;
  logo_url?: string;
  favicon_url?: string;
  login_image_url?: string;
  register_image_url?: string;
  registration_enabled?: string;
  color_bg_primary?: string;
  color_bg_card?: string;
  color_accent?: string;
  color_text_primary?: string;
}

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
  settings: SystemSettings;
  login: (accessToken: string, refreshToken: string, userData: User) => void;
  logout: () => Promise<void>;
  fetchProfile: (authToken?: string) => Promise<boolean>;
  fetchSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SystemSettings>({
    panel_name: 'CynexVM',
    welcome_message: 'Welcome to CynexVM Enterprise LXC Manager',
    maintenance_mode: 'false',
    logo_url: '',
    favicon_url: '',
    login_image_url: '',
    register_image_url: '',
    registration_enabled: 'true'
  });

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

  // Periodic token refresh check (every 4 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const savedRefreshToken = localStorage.getItem('refreshToken');
      if (savedRefreshToken && token) {
        attemptTokenRefresh();
      }
    }, 4 * 60 * 1000);

    return () => clearInterval(interval);
  }, [token]);

  const attemptTokenRefresh = async (): Promise<string | null> => {
    const savedRefreshToken = localStorage.getItem('refreshToken');
    if (!savedRefreshToken) return null;

    try {
      const res = await fetch('/api/v1/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: savedRefreshToken })
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        setToken(data.accessToken);
        return data.accessToken;
      } else if (res.status === 401) {
        // Refresh token itself expired, clear session
        clearAuth();
      }
    } catch (err) {
      console.warn('Silent token refresh failed (network/server temporary error):', err);
    }
    return null;
  };

  const fetchProfile = async (authToken?: string): Promise<boolean> => {
    let activeToken = authToken || token;
    if (!activeToken) return false;

    try {
      let res = await fetch('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });

      // If token expired, try to refresh it once
      if (res.status === 401) {
        const refreshedToken = await attemptTokenRefresh();
        if (refreshedToken) {
          activeToken = refreshedToken;
          res = await fetch('/api/v1/auth/me', {
            headers: {
              'Authorization': `Bearer ${activeToken}`
            }
          });
        }
      }

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return true;
      } else if (res.status === 401) {
        // Explicit unauthorized only - clear auth
        clearAuth();
        return false;
      }
      // Keep user state for other status codes (e.g. 502/503/504 server restarts)
      return true;
    } catch (err) {
      console.error('Failed to fetch user profile (ignoring transient network error):', err);
      // Do NOT log out on network/fetch errors, keep session intact
      return true;
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/v1/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    // Dynamic tab document title update
    if (settings.panel_name) {
      document.title = settings.panel_name;
    }

    // Dynamic browser favicon update
    if (settings.favicon_url) {
      const link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      if (link) {
        link.href = settings.favicon_url;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'shortcut icon';
        newLink.href = settings.favicon_url;
        document.head.appendChild(newLink);
      }
    }

    // Theme color customization — map settings to CSS custom properties
    const colorMap: Record<string, string> = {
      color_bg_primary: '--color-pageBg',
      color_bg_card: '--color-cardBg',
      color_accent: '--color-accentBlue',
      color_text_primary: '--color-textStrong',
    };

    for (const [settingKey, cssVar] of Object.entries(colorMap)) {
      const value = (settings as any)[settingKey];
      if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
        root.style.setProperty(cssVar, value);
      }
    }
  }, [settings]);

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
    <AuthContext.Provider value={{ user, token, loading, settings, login, logout, fetchProfile, fetchSettings }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
