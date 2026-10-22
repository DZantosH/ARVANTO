import * as Crypto from '@/src/native/platform';
import type { SQLiteDatabase } from '@/src/native/database';

export type AuditActor = { id?: string | null; name?: string };
export type AuditEventInput = { actor?: AuditActor | null; action: string; entityType: string; entityId?: string; summary?: string };
export type AuditEvent = { id: string; actor_id: string | null; actor_name: string; action: string; entity_type: string; entity_id: string; summary: string; created_at: string };

export async function recordAuditEvent(db: SQLiteDatabase, event: AuditEventInput) {
  const actorName = event.actor?.name?.trim() || (event.actor?.id ? (await db.getFirstAsync<{ name: string }>('SELECT name FROM app_users WHERE id=?', event.actor.id))?.name : null) || 'Sistema';
  await db.runAsync(
    'INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
    Crypto.randomUUID(), event.actor?.id ?? null, actorName.slice(0, 100),
    event.action.trim().slice(0, 60), event.entityType.trim().slice(0, 60), event.entityId ?? '', event.summary?.trim().slice(0, 300) ?? '',
  );
}

export async function getAuditLog(db: SQLiteDatabase, days = 30, query = '') {
  const term = `%${query.trim().replace(/[!%_]/g, '!$&')}%`;
  const limitDays = Math.max(0, Math.min(3650, Math.trunc(days)));
  return db.getAllAsync<AuditEvent>(
    `SELECT id, actor_id, actor_name, action, entity_type, entity_id, summary, created_at FROM audit_logs
     WHERE ((?=1 AND date(created_at,'localtime')=date('now','localtime')) OR (?=3650) OR (?<>1 AND ?<>3650 AND created_at >= datetime('now', ?)))
       AND (? = '' OR actor_name LIKE ? ESCAPE '!' OR action LIKE ? ESCAPE '!' OR entity_type LIKE ? ESCAPE '!' OR summary LIKE ? ESCAPE '!')
     ORDER BY created_at DESC LIMIT 300`, limitDays, limitDays, limitDays, limitDays, `-${limitDays} days`, query.trim(), term, term, term, term,
  );
}
