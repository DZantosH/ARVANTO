import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { authenticateUser, createUser, type AppUser, type UserRole } from '@/src/database/businessRepository';

type AuthValue = { user: AppUser | null; ready: boolean; userCount: number; login: (pin: string) => Promise<boolean>; logout: () => void; createAccount: (name: string, pin: string, role: UserRole) => Promise<void>; reloadUsers: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const reloadUsers = useCallback(async () => {
    const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM app_users WHERE is_active = 1');
    setUserCount(result?.count ?? 0);
  }, [db]);
  useEffect(() => {
    let mounted = true;
    void db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM app_users WHERE is_active = 1')
      .then((result) => { if (mounted) setUserCount(result?.count ?? 0); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, [db]);
  const login = useCallback(async (pin: string) => {
    const match = await authenticateUser(db, pin);
    setUser(match);
    return Boolean(match);
  }, [db]);
  const createAccount = useCallback(async (name: string, pin: string, role: UserRole) => {
    await createUser(db, name, pin, role);
    await reloadUsers();
    if (userCount === 0) {
      const match = await authenticateUser(db, pin);
      setUser(match);
    }
  }, [db, reloadUsers, userCount]);
  const value = useMemo(() => ({ user, ready, userCount, login, logout: () => setUser(null), createAccount, reloadUsers }), [user, ready, userCount, login, createAccount, reloadUsers]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
