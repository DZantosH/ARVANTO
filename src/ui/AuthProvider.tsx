import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useSQLiteContext } from '@/src/native/database';
import type { AppUser } from '@/src/database/businessRepository';
import { recordAuditEvent } from '@/src/database/auditRepository';
import { AuthError, authRequest, signIn, validateSession } from '@/src/auth/api';
import { invalidateLocalSession, loadSession, saveSession, synchronizeAccount, type StoredSession, DEVICE_ISSUER } from '@/src/auth/session';
import { getItemAsync, setItemAsync, native } from '@/src/native/platform';
import { AUTH_API_URL } from '@/src/config/auth';

type AuthValue = { user: AppUser | null; ready: boolean; login: (username: string, password: string) => Promise<void>; logout: (reason?: 'manual' | 'business_closed') => Promise<void>; refreshSession: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);
const PENDING_REVOCATION = 'arvanto.session-revocation.v1';
let pendingRequest: Promise<void> | null = null;
function sendPendingRevocation(): Promise<void> {
  if (pendingRequest) return pendingRequest;
  pendingRequest = (async () => {
    const encoded = await getItemAsync(PENDING_REVOCATION);
    if (!encoded) return;
    const pending = JSON.parse(encoded) as { issuer: string; token: string; businessDayId: string; reason: string };
    if (pending.issuer !== AUTH_API_URL) { await setItemAsync(PENDING_REVOCATION, ''); return; }
    try {
      if (pending.reason === 'business_closed') await authRequest(`/business-days/${encodeURIComponent(pending.businessDayId)}/close`, pending.token, {});
      else await authRequest('/auth/logout', pending.token, {});
    } catch (cause) { if (!(cause instanceof AuthError && cause.kind === 'revoked')) throw cause; }
    if (await getItemAsync(PENDING_REVOCATION) === encoded) await setItemAsync(PENDING_REVOCATION, '');
  })().finally(() => { pendingRequest = null; });
  return pendingRequest;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  const active = useRef<StoredSession | null>(null);
  const operation = useRef(0);
  const refreshing = useRef(false);
  const logout = useCallback(async (reason: 'manual' | 'business_closed' = 'manual') => {
    operation.current += 1;
    const previous = active.current; active.current = null; setUser(null);
    const ending = await db.getFirstAsync<{ last_end_reason: string }>('SELECT last_end_reason FROM app_auth_state WHERE id=1');
    const effectiveReason = ending?.last_end_reason === 'business_closed' ? 'business_closed' : reason;
    // Persist revocation before clearing credentials, so offline closures can be retried.
    try {
      if (previous?.issuer === DEVICE_ISSUER) await native.deviceSignOut(previous.session.token);
      else if (previous) await setItemAsync(PENDING_REVOCATION, JSON.stringify({ issuer: AUTH_API_URL, token: previous.session.token, businessDayId: previous.session.businessDayId, reason: effectiveReason }));
    } finally { await invalidateLocalSession(db); }
    if (previous) {
      await recordAuditEvent(db, { actor: { id: previous.localUserId, name: previous.session.user.name }, action: 'Cierre de sesión', entityType: 'Sesión', summary: effectiveReason === 'business_closed' ? 'Jornada terminada y negocio cerrado.' : 'Cierre manual.' }).catch(() => undefined);
      void sendPendingRevocation().catch(() => undefined);
    }
  }, [db]);
  const refreshSession = useCallback(async () => {
    if (refreshing.current || !active.current) return;
    refreshing.current = true;
    const revision = operation.current; const current = active.current;
    try {
      const cached = await loadSession(db);
      if (!cached) { if (revision === operation.current) await logout(); return; }
      if (current.issuer === DEVICE_ISSUER) return;
      const remote = await validateSession(current.session.token);
      if (remote.user.id !== current.session.user.id || remote.user.businessId !== current.session.user.businessId || remote.businessDayId !== current.session.businessDayId) throw new AuthError('La jornada o la cuenta cambió.', 'revoked');
      if (revision !== operation.current) return;
      const updated = await synchronizeAccount(db, remote, current.epoch);
      if (revision !== operation.current) return;
      await saveSession(updated.stored);
      if (revision !== operation.current) { await saveSession(null); return; }
      active.current = updated.stored; setUser(updated.user);
    } catch (cause) {
      // Connection failures preserve a previously authenticated, unexpired local session.
      if (!(cause instanceof AuthError && cause.kind === 'offline') && revision === operation.current) await logout();
    } finally { refreshing.current = false; }
  }, [db, logout]);
  useEffect(() => {
    let mounted = true;
    const revision = operation.current;
    void (async () => {
      try {
        const cached = await loadSession(db);
        if (!mounted || revision !== operation.current) return;
        if (cached) {
          const current = await db.getFirstAsync<AppUser>('SELECT id,name,role,is_active FROM app_users WHERE id=? AND is_active=1', cached.localUserId);
          if (mounted && revision === operation.current && current) { active.current = cached; setUser(current); }
        } else await saveSession(null);
      } finally { if (mounted) setReady(true); }
      if (mounted) { void sendPendingRevocation().catch(() => undefined); await refreshSession(); }
    })().catch(() => { if (mounted) setReady(true); });
    void sendPendingRevocation().catch(() => undefined);
    return () => { mounted = false; };
  }, [db, refreshSession]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') { void refreshSession().catch(() => undefined); void sendPendingRevocation().catch(() => undefined); } });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refreshSession().catch(() => undefined); }, 30_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [refreshSession]);
  const login = useCallback(async (username: string, password: string) => {
    const revision = ++operation.current;
    // Do not open a new day until an offline closure has reached the server.
    const deviceSession = await native.deviceSignIn(username, password);
    if (!deviceSession) await sendPendingRevocation();
    const remote = deviceSession ?? await signIn(username, password);
    if (revision !== operation.current) return;
    const updated = await synchronizeAccount(db, remote, undefined, deviceSession ? DEVICE_ISSUER : AUTH_API_URL);
    if (revision !== operation.current) return;
    await saveSession(updated.stored);
    if (revision !== operation.current) { await saveSession(null); return; }
    active.current = updated.stored; setUser(updated.user);
    await recordAuditEvent(db, { actor: { id: updated.user.id, name: updated.user.name }, action: 'Inicio de sesión', entityType: 'Sesión', summary: deviceSession ? 'Cuenta habilitada para este dispositivo · sesión de jornada.' : 'Cuenta registrada en la web · sesión de jornada.' }).catch(() => undefined);
  }, [db]);
  const value = useMemo(() => ({ user, ready, login, logout, refreshSession }), [user, ready, login, logout, refreshSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider'); return value; }
