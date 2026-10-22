import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type InventoryCount = {
  id: string;
  count_number: number;
  status: 'open' | 'completed' | 'cancelled';
  started_at: string;
  created_by: string;
  completed_at: string | null;
  completed_by: string | null;
};

export type InventoryCountItem = {
  id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  sku: string | null;
  unit_name: string;
  system_quantity: number;
  counted_quantity: number | null;
  counted_at: string | null;
  applied_delta: number | null;
};

export type InventoryCountDetail = { count: InventoryCount; items: InventoryCountItem[] };

export async function getOpenInventoryCount(db: SQLiteDatabase): Promise<InventoryCountDetail | null> {
  const count = await db.getFirstAsync<InventoryCount>("SELECT id,count_number,status,started_at,created_by,completed_at,completed_by FROM inventory_counts WHERE status='open' LIMIT 1");
  if (!count) return null;
  return { count, items: await getCountItems(db, count.id) };
}

export async function getCountItems(db: SQLiteDatabase, countId: string): Promise<InventoryCountItem[]> {
  return db.getAllAsync<InventoryCountItem>(
    `SELECT i.id,i.product_id,i.product_name,i.barcode,p.sku,p.unit_name,i.system_quantity,i.counted_quantity,i.counted_at,i.applied_delta
     FROM inventory_count_items i JOIN products p ON p.id=i.product_id WHERE i.count_id=? ORDER BY i.product_name COLLATE NOCASE`, countId,
  );
}

export async function startInventoryCount(db: SQLiteDatabase, createdBy = 'Administrador'): Promise<string> {
  const id = Crypto.randomUUID();
  await db.withExclusiveTransactionAsync(async (txn) => {
    const open = await txn.getFirstAsync<{ id: string }>("SELECT id FROM inventory_counts WHERE status='open' LIMIT 1");
    if (open) throw new Error('Ya hay un conteo físico abierto. Reanúdalo para continuar.');
    const next = await txn.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(count_number),0)+1 AS next FROM inventory_counts');
    await txn.runAsync('INSERT INTO inventory_counts (id,count_number,created_by) VALUES (?,?,?)', id, next?.next ?? 1, createdBy);
    const products = await txn.getAllAsync<{ id: string; name: string; barcode: string | null; stock_quantity: number }>('SELECT id,name,barcode,stock_quantity FROM products WHERE is_active=1 ORDER BY name COLLATE NOCASE');
    for (const product of products) await txn.runAsync(
      'INSERT INTO inventory_count_items (id,count_id,product_id,product_name,barcode,system_quantity) VALUES (?,?,?,?,?,?)',
      Crypto.randomUUID(), id, product.id, product.name, product.barcode, product.stock_quantity,
    );
  });
  return id;
}

export async function setCountedQuantity(db: SQLiteDatabase, countId: string, itemId: string, quantity: number): Promise<void> {
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000_000 || Math.round(quantity * 1000) !== quantity * 1000) throw new Error('La cantidad debe ser cero o positiva y tener hasta tres decimales.');
  const result = await db.runAsync(
    `UPDATE inventory_count_items SET counted_quantity=?,counted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=? AND count_id=? AND EXISTS (SELECT 1 FROM inventory_counts WHERE id=? AND status='open')`,
    quantity, itemId, countId, countId,
  );
  if (result.changes !== 1) throw new Error('El conteo ya no está abierto. Actualiza la pantalla.');
}

export async function findCountItemByCode(db: SQLiteDatabase, countId: string, code: string): Promise<InventoryCountItem | null> {
  const normalized = code.trim();
  if (!normalized) return null;
  return db.getFirstAsync<InventoryCountItem>(
    `SELECT i.id,i.product_id,i.product_name,i.barcode,p.sku,p.unit_name,i.system_quantity,i.counted_quantity,i.counted_at,i.applied_delta
     FROM inventory_count_items i JOIN products p ON p.id=i.product_id
     WHERE i.count_id=? AND (i.barcode=? COLLATE NOCASE OR p.barcode=? COLLATE NOCASE OR p.sku=? COLLATE NOCASE)
     LIMIT 1`, countId, normalized, normalized, normalized,
  );
}

export async function completeInventoryCount(db: SQLiteDatabase, countId: string, completedBy = 'Administrador'): Promise<{ changedProducts: number; changedUnits: number }> {
  let result = { changedProducts: 0, changedUnits: 0 };
  await db.withExclusiveTransactionAsync(async (txn) => {
    const count = await txn.getFirstAsync<{ count_number: number; status: string }>('SELECT count_number,status FROM inventory_counts WHERE id=?', countId);
    if (!count || count.status !== 'open') throw new Error('El conteo ya no está abierto.');
    const missing = await txn.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM products p WHERE p.is_active=1 AND NOT EXISTS (
       SELECT 1 FROM inventory_count_items i WHERE i.count_id=? AND i.product_id=p.id)`, countId,
    );
    if (missing?.count) throw new Error('Se agregaron productos después de iniciar el conteo. Cancélalo y comienza uno nuevo para incluirlos.');
    const items = await txn.getAllAsync<{ id: string; product_id: string; system_quantity: number; counted_quantity: number | null; counted_at: string | null }>(
      'SELECT id,product_id,system_quantity,counted_quantity,counted_at FROM inventory_count_items WHERE count_id=?', countId,
    );
    const pending = items.filter((item) => item.counted_quantity === null || !item.counted_at);
    if (pending.length) throw new Error(`Faltan ${pending.length} productos por contar.`);
    for (const item of items) {
      const live = await txn.getFirstAsync<{ stock_quantity: number; is_active: number }>('SELECT stock_quantity,is_active FROM products WHERE id=?', item.product_id);
      if (!live) throw new Error('Un producto del conteo ya no existe.');
      const moves = await txn.getFirstAsync<{ delta: number }>(
        'SELECT COALESCE(SUM(quantity_delta),0) AS delta FROM inventory_movements WHERE product_id=? AND created_at>?', item.product_id, item.counted_at!,
      );
      const expectedAtCount = live.stock_quantity - (moves?.delta ?? 0);
      const delta = item.counted_quantity! - expectedAtCount;
      const finalQuantity = live.stock_quantity + delta;
      if (finalQuantity < 0) throw new Error('El conteo produciría existencias negativas; revisa los movimientos recientes.');
      if (Math.abs(delta) > 0.0000001) {
        await txn.runAsync("UPDATE products SET stock_quantity=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", finalQuantity, item.product_id);
        await txn.runAsync(
          "INSERT INTO inventory_movements (id,product_id,kind,quantity_delta,reference_id,reason,created_by) VALUES (?,?,'adjustment',?,?,?,?)",
          Crypto.randomUUID(), item.product_id, delta, countId, `Conteo físico #${count.count_number}`, completedBy,
        );
        result.changedProducts += 1;
        result.changedUnits += Math.abs(delta);
      }
      await txn.runAsync('UPDATE inventory_count_items SET applied_delta=? WHERE id=?', delta, item.id);
    }
    await txn.runAsync("UPDATE inventory_counts SET status='completed',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),completed_by=? WHERE id=? AND status='open'", completedBy, countId);
  });
  return result;
}

export async function cancelInventoryCount(db: SQLiteDatabase, countId: string, cancelledBy = 'Administrador'): Promise<void> {
  await db.runAsync("UPDATE inventory_counts SET status='cancelled',cancelled_by=? WHERE id=? AND status='open'", cancelledBy, countId);
}
