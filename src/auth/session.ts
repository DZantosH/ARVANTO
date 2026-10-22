import type { SQLiteDatabase } from '@/src/native/database';
import { getItemAsync, setItemAsync, randomUUID, native } from '@/src/native/platform';
import { AUTH_API_URL } from '@/src/config/auth';
import { AuthError, parseWebSession, type WebSession } from './api';
import type { AppUser } from '@/src/database/businessRepository';

const SESSION_KEY = 'arvanto.web-session.v1';
export const DEVICE_ISSUER = 'arvanto:device';
export type StoredSession = { version: 1; issuer: string; epoch: number; localUserId: string; session: WebSession };
export async function saveSession(value: StoredSession | null) { await setItemAsync(SESSION_KEY, value ? JSON.stringify(value) : ''); }
export async function loadSession(db: SQLiteDatabase): Promise<StoredSession | null> {
  const encoded = await getItemAsync(SESSION_KEY);
  if (!encoded) return null;
  try {
    const value = JSON.parse(encoded) as StoredSession;
    if (value.version !== 1 || ![AUTH_API_URL, DEVICE_ISSUER].includes(value.issuer) || !Number.isSafeInteger(value.epoch) || !value.localUserId) return null;
    const session = parseWebSession(value.session);
    if (value.issuer === DEVICE_ISSUER && !await native.deviceSessionValid(session.token)) return null;
    const pending = await getItemAsync('arvanto.session-revocation.v1');
    if (pending && JSON.parse(pending).token === session.token) return null;
    const state = await db.getFirstAsync<{ session_epoch: number; business_id: string | null; last_end_reason: string }>('SELECT session_epoch, business_id, last_end_reason FROM app_auth_state WHERE id=1');
    if (!state || state.business_id !== session.user.businessId) return null;
    if (state.session_epoch !== value.epoch) {
      if (value.issuer === DEVICE_ISSUER) await native.deviceSignOut(session.token);
      else if (state.last_end_reason === 'business_closed') await setItemAsync('arvanto.session-revocation.v1', JSON.stringify({ issuer: AUTH_API_URL, token: session.token, businessDayId: session.businessDayId, reason: 'business_closed' }));
      return null;
    }
    const user = await db.getFirstAsync<{ id: string }>('SELECT id FROM app_users WHERE id=? AND is_active=1 AND remote_id=? AND business_id=?', value.localUserId, session.user.id, session.user.businessId);
    return user ? { ...value, session } : null;
  } catch { return null; }
}
export async function synchronizeAccount(db: SQLiteDatabase, session: WebSession, expectedEpoch?: number, issuer = AUTH_API_URL): Promise<{ stored: StoredSession; user: AppUser }> {
  let result!: { stored: StoredSession; user: AppUser };
  await db.withExclusiveTransactionAsync(async txn => {
    const state = await txn.getFirstAsync<{ session_epoch: number; business_id: string | null }>('SELECT session_epoch, business_id FROM app_auth_state WHERE id=1');
    if (!state) throw new Error('No se pudo abrir la configuración de acceso.');
    if (expectedEpoch !== undefined && state.session_epoch !== expectedEpoch) throw new AuthError('La sesión ya se cerró.', 'revoked');
    if (state.business_id && state.business_id !== session.user.businessId) throw new Error('Esta app contiene datos de otro negocio. Usa el usuario del negocio vinculado a este dispositivo.');
    const existing = await txn.getFirstAsync<{ id: string }>('SELECT id FROM app_users WHERE remote_id=? AND business_id=?', session.user.id, session.user.businessId);
    const id = existing?.id ?? randomUUID(); const account = session.user;
    if (existing) await txn.runAsync('UPDATE app_users SET name=?, username=?, role=?, is_active=1 WHERE id=?', account.name, account.username, account.role, id);
    else await txn.runAsync('INSERT INTO app_users (id,name,pin_hash,role,username,remote_id,business_id) VALUES (?,?,?,?,?,?,?)', id, account.name, 'web-account:no-local-password', account.role, account.username, account.id, account.businessId);
    await txn.runAsync("UPDATE app_auth_state SET business_id=?, last_end_reason='' WHERE id=1", account.businessId);
    result = { stored: { version: 1, issuer, epoch: state.session_epoch, localUserId: id, session }, user: { id, name: account.name, role: account.role, is_active: 1 } };
  });
  return result;
}
export async function invalidateLocalSession(db: SQLiteDatabase) {
  // Database invalidation survives a crash before the encrypted token is removed.
  await db.runAsync('UPDATE app_auth_state SET session_epoch=session_epoch+1 WHERE id=1');
  await saveSession(null);
}
