jest.mock('@/src/config/auth', () => ({ AUTH_API_URL: 'https://arvanto.asyncz.tech/api' }));
import { authRequest, parseWebSession, signIn, validateSession } from './api';

const valid = () => ({ token: 'opaque-token', expiresAt: new Date(Date.now() + 3600000).toISOString(), businessDayId: 'day-1', businessDayOpen: true, user: { id: 'web-user', name: 'Operador', username: 'operador', role: 'cashier', businessId: 'store-1' } });
const request = jest.fn();
beforeEach(() => { globalThis.fetch = request; request.mockReset(); });
test('sends username and password only to the HTTPS login endpoint', async () => {
  request.mockResolvedValue({ ok: true, status: 200, json: async () => valid() });
  await signIn(' operador ', ' contraseña con espacios ');
  expect(request.mock.calls[0][0]).toBe('https://arvanto.asyncz.tech/api/auth/login');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ username: 'operador', password: ' contraseña con espacios ' });
});
test('rejects incorrect credentials without creating an account', async () => {
  request.mockResolvedValue({ ok: false, status: 401 });
  await expect(signIn('operador', 'invalid')).rejects.toMatchObject({ kind: 'credentials' });
  expect(request).toHaveBeenCalledTimes(1);
});
test('rejects revoked sessions and closed business days', async () => {
  request.mockResolvedValue({ ok: false, status: 403 });
  await expect(validateSession('token')).rejects.toMatchObject({ kind: 'revoked' });
  expect(() => parseWebSession({ ...valid(), businessDayOpen: false })).toThrow('negocio ya cerró');
});
test('rejects expired sessions and unknown roles', () => {
  expect(() => parseWebSession({ ...valid(), expiresAt: '2000-01-01T00:00:00Z' })).toThrow();
  expect(() => parseWebSession({ ...valid(), user: { ...valid().user, role: 'superuser' } })).toThrow();
});
test('distinguishes connection failure from a malformed authenticated response', async () => {
  request.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(validateSession('token')).rejects.toMatchObject({ kind: 'offline' });
  request.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error('invalid JSON'); } });
  await expect(validateSession('token')).rejects.toMatchObject({ kind: 'response' });
});
test('does not contact the server with empty credentials', async () => {
  await expect(signIn('', '')).rejects.toThrow('usuario y contraseña');
  expect(request).not.toHaveBeenCalled();
});
test('recognizes server throttling', async () => {
  request.mockResolvedValue({ ok: false, status: 429 });
  await expect(authRequest('/auth/login', undefined, {})).rejects.toThrow('Demasiados intentos');
});
