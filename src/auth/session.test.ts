jest.mock('@/src/native/platform', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), randomUUID: () => 'local-user' }));
jest.mock('@/src/config/auth', () => ({ AUTH_API_URL: 'https://arvanto.asyncz.tech/api' }));
import { getItemAsync, setItemAsync } from '@/src/native/platform';
import type { SQLiteDatabase } from '@/src/native/database';
import { invalidateLocalSession, loadSession, saveSession, synchronizeAccount } from './session';

const stored = () => ({ version: 1 as const, issuer: 'https://arvanto.asyncz.tech/api', epoch: 3, localUserId: 'local-user', session: { token: 'token', expiresAt: '2099-01-01T00:00:00Z', businessDayId: 'day-1', businessDayOpen: true as const, user: { id: 'web-user', name: 'Operador', username: 'operador', role: 'cashier' as const, businessId: 'store-1' } } });
const first = jest.fn(); const run = jest.fn();
const db = { getFirstAsync: first, runAsync: run, withExclusiveTransactionAsync: async (action: (txn: unknown) => Promise<void>) => action(db) } as unknown as SQLiteDatabase;
beforeEach(() => { jest.clearAllMocks(); run.mockResolvedValue({ changes: 1 }); });

test('restores an authenticated session after reopening the app', async () => {
  jest.mocked(getItemAsync).mockResolvedValue(JSON.stringify(stored()));
  first.mockResolvedValueOnce({ session_epoch: 3, business_id: 'store-1' }).mockResolvedValueOnce({ id: 'local-user' });
  expect(await loadSession(db)).toEqual(stored());
});
test('a completed business closure prevents restoring even a leftover encrypted token', async () => {
  jest.mocked(getItemAsync).mockResolvedValue(JSON.stringify(stored()));
  first.mockResolvedValueOnce({ session_epoch: 4, business_id: 'store-1' });
  expect(await loadSession(db)).toBeNull();
});
test('a closure interrupted before logout queues remote revocation on the next start', async () => {
  jest.mocked(getItemAsync).mockResolvedValue(JSON.stringify(stored()));
  first.mockResolvedValueOnce({ session_epoch: 4, business_id: 'store-1', last_end_reason: 'business_closed' });
  expect(await loadSession(db)).toBeNull();
  expect(setItemAsync).toHaveBeenCalledWith('arvanto.session-revocation.v1', expect.stringContaining('business_closed'));
});
test('a durable logout marker prevents restore after a crash before the token is cleared', async () => {
  jest.mocked(getItemAsync).mockResolvedValueOnce(JSON.stringify(stored())).mockResolvedValueOnce(JSON.stringify({ token: 'token', reason: 'manual' }));
  expect(await loadSession(db)).toBeNull();
  expect(first).not.toHaveBeenCalled();
});
test('does not restore sessions for another API, another business or inactive accounts', async () => {
  jest.mocked(getItemAsync).mockResolvedValueOnce(JSON.stringify({ ...stored(), issuer: 'https://other.invalid' }));
  expect(await loadSession(db)).toBeNull();
  jest.mocked(getItemAsync).mockResolvedValue(JSON.stringify(stored()));
  first.mockResolvedValueOnce({ session_epoch: 3, business_id: 'other-business' });
  expect(await loadSession(db)).toBeNull();
  first.mockResolvedValueOnce({ session_epoch: 3, business_id: 'store-1' }).mockResolvedValueOnce(null);
  expect(await loadSession(db)).toBeNull();
});
test('expired or corrupt saved sessions cannot bypass login', async () => {
  const value = stored(); value.session.expiresAt = '2000-01-01T00:00:00Z';
  jest.mocked(getItemAsync).mockResolvedValueOnce(JSON.stringify(value)).mockResolvedValueOnce('invalid-json');
  expect(await loadSession(db)).toBeNull(); expect(await loadSession(db)).toBeNull();
});
test('logout invalidates the database epoch before clearing secure storage', async () => {
  const order: string[] = [];
  run.mockImplementationOnce(async () => { order.push('epoch'); return { changes: 1 }; });
  jest.mocked(setItemAsync).mockImplementationOnce(async () => { order.push('token-cleared'); });
  await invalidateLocalSession(db);
  expect(order).toEqual(['epoch', 'token-cleared']);
});
test('persists the token without retaining the password', async () => {
  await saveSession(stored());
  const persisted = JSON.parse(jest.mocked(setItemAsync).mock.calls[0][1]);
  expect(persisted.session.token).toBe('token');
  expect(JSON.stringify(persisted)).not.toContain('password');
});
test('prevents mixing two businesses in the same local catalog', async () => {
  first.mockResolvedValueOnce({ session_epoch: 3, business_id: 'different-store' });
  await expect(synchronizeAccount(db, stored().session)).rejects.toThrow('otro negocio');
  expect(run).not.toHaveBeenCalled();
});
test('a delayed server response cannot reopen a business day closed locally', async () => {
  first.mockResolvedValueOnce({ session_epoch: 4, business_id: 'store-1' });
  await expect(synchronizeAccount(db, stored().session, 3)).rejects.toMatchObject({ kind: 'revoked' });
  expect(run).not.toHaveBeenCalled();
});
