import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { Organization, User } from '../lib/types';

interface AuthState {
  user: User | null;
  organizations: Organization[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; fullName: string; organizationName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshOrganizations: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      const res = await api.get<{ data: { user: User; organizations: Organization[] } }>('/v1/auth/me');
      setUser(res.data.user);
      setOrganizations(res.data.organizations);
      connectSocket();
    } catch {
      setUser(null);
      setOrganizations([]);
    }
  }, []);

  useEffect(() => {
    // On first load there's no access token yet — try a silent refresh
    // against the httpOnly cookie before deciding the person is logged out.
    (async () => {
      try {
        const res = await api.post<{ data: { accessToken: string } }>('/v1/auth/refresh');
        setAccessToken(res.data.accessToken);
        await loadMe();
      } catch {
        // no valid session — that's fine, land on the login page
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ data: { accessToken: string; user: User } }>('/v1/auth/login', { email, password });
      setAccessToken(res.data.accessToken);
      await loadMe();
    },
    [loadMe]
  );

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; organizationName: string }) => {
      await api.post('/v1/auth/register', input);
      await login(input.email, input.password);
    },
    [login]
  );

  const logout = useCallback(async () => {
    await api.post('/v1/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setOrganizations([]);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, organizations, loading, login, register, logout, refreshOrganizations: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
