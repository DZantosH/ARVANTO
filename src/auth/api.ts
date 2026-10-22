import { AUTH_API_URL } from '@/src/config/auth';
import type { UserRole } from '@/src/database/businessRepository';

export type WebSession = {
  token: string;
  expiresAt: string;
  businessDayId: string;
  businessDayOpen: true;
  user: { id: string; name: string; username: string; role: UserRole; businessId: string };
};
export class AuthError extends Error {
  constructor(message: string, readonly kind: 'credentials' | 'revoked' | 'offline' | 'configuration' | 'response') { super(message); }
}
function nonempty(value: unknown, max = 200): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max; }
export function parseWebSession(value: unknown): WebSession {
  if (!value || typeof value !== 'object') throw new AuthError('El servicio de acceso devolvió una respuesta inválida.', 'response');
  const session = value as Partial<WebSession>; const user = session.user;
  if (session.businessDayOpen !== true) throw new AuthError('El negocio ya cerró. Inicia sesión para la siguiente jornada.', 'revoked');
  if (!nonempty(session.token, 16000) || !nonempty(session.expiresAt) || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now() || !nonempty(session.businessDayId) || !user || !nonempty(user.id) || !nonempty(user.name) || !nonempty(user.username) || !nonempty(user.businessId) || !['admin', 'manager', 'cashier'].includes(user.role)) {
    throw new AuthError('La sesión recibida no es válida o ya venció.', 'response');
  }
  return { token: session.token, expiresAt: session.expiresAt, businessDayId: session.businessDayId, businessDayOpen: true, user: { id: user.id, name: user.name, username: user.username, role: user.role, businessId: user.businessId } };
}
export async function authRequest(path: string, token?: string, body?: object): Promise<unknown> {
  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(AUTH_API_URL)) throw new AuthError('El servicio de acceso todavía no está disponible. Intenta más tarde.', 'configuration');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${AUTH_API_URL.replace(/\/$/, '')}${path}`, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) throw new AuthError(token ? 'Tu sesión terminó. Vuelve a iniciar sesión.' : 'Usuario o contraseña incorrectos.', token ? 'revoked' : 'credentials');
    if (response.status === 403 || response.status === 410) throw new AuthError('La sesión terminó o el negocio ya cerró.', 'revoked');
    if (response.status === 429) throw new AuthError('Demasiados intentos. Espera un momento antes de volver a intentar.', 'credentials');
    if (!response.ok) throw new AuthError('No se pudo contactar con el servicio de acceso.', 'offline');
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw new AuthError('El servicio de acceso devolvió una respuesta inválida.', 'response'); }
  } catch (cause) {
    if (cause instanceof AuthError) throw cause;
    throw new AuthError('No hay conexión con el servicio de acceso. Revisa tu internet.', 'offline');
  } finally { clearTimeout(timeout); }
}
export async function signIn(username: string, password: string): Promise<WebSession> {
  if (!username.trim() || !password) throw new AuthError('Escribe tu usuario y contraseña.', 'credentials');
  return parseWebSession(await authRequest('/auth/login', undefined, { username: username.trim(), password }));
}
export const validateSession = async (token: string) => parseWebSession(await authRequest('/auth/session', token));
