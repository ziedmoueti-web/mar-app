import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { PublicUser } from '@shared/types';

interface AuthState {
  user: PublicUser | null;
  onboarded: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  setSession: (user: PublicUser, onboarded: boolean) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<{ user: PublicUser; onboarded: boolean }>('/api/auth/me');
      setUser(me.user);
      setOnboarded(me.onboarded);
    } catch {
      setUser(null);
      setOnboarded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSession = useCallback((u: PublicUser, ob: boolean) => {
    setUser(u);
    setOnboarded(ob);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch { /* ignore */ }
    setUser(null);
    setOnboarded(true);
  }, []);

  const value = useMemo(
    () => ({ user, onboarded, loading, refresh, setSession, logout }),
    [user, onboarded, loading, refresh, setSession, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
