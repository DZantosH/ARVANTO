import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { recordAuditEvent } from './auditRepository';

export type Product = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string;
  cost_cents: number;
  price_cents: number;
  stock_quantity: number;
  minimum_stock: number;
  unit_name: string;
  sale_unit_name: string;
  sale_unit_factor: number;
  sale_unit_price_cents: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string;
  costCents: number;
  priceCents: number;
  minimumStock: number;
  unitName: string;
  saleUnitName: string;
  saleUnitFactor: number;
  saleUnitPriceCents: number | null;
  openingStock?: number;
};

export type ProductStatusFilter = 'active' | 'inactive' | 'all';

export type ProductPage = {
  items: Product[];
  total: number;
};

const PAGE_SIZE = 40;

export async function searchProducts(
  db: SQLiteDatabase,
  search: string,
  status: ProductStatusFilter,
  offset = 0,
): Promise<ProductPage> {
  const conditions: string[] = [];
  const parameters: (string | number)[] = [];

  if (status !== 'all') {
    conditions.push('is_active = ?');
    parameters.push(status === 'active' ? 1 : 0);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    conditions.push("(name LIKE ? ESCAPE '!' OR COALESCE(sku, '') LIKE ? ESCAPE '!' OR COALESCE(barcode, '') LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')");
    const escaped = `%${trimmedSearch.replace(/[!%_]/g, '!$&')}%`;
    parameters.push(escaped, escaped, escaped, escaped);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM products ${where}`,
    ...parameters,
  );
  const items = await db.getAllAsync<Product>(
    `SELECT id, sku, barcode, name, description, cost_cents, price_cents, stock_quantity, minimum_stock, unit_name, sale_unit_name, sale_unit_factor, sale_unit_price_cents, is_active, created_at, updated_at
     FROM products ${where}
     ORDER BY is_active DESC, name COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
    ...parameters,
    PAGE_SIZE,
    offset,
  );

  return { items, total: count?.total ?? 0 };
}

export async function createProduct(db: SQLiteDatabase, input: ProductInput, createdBy = 'Administrador', actorId?: string): Promise<string> {
  const id = Crypto.randomUUID();
  const openingStock = input.openingStock ?? 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO products (id, sku, barcode, name, description, cost_cents, price_cents, stock_quantity, minimum_stock, unit_name, sale_unit_name, sale_unit_factor, sale_unit_price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, normalizeSku(input.sku), normalizeBarcode(input.barcode), input.name.trim(), input.description.trim(), input.costCents, input.priceCents, openingStock, input.minimumStock, input.unitName, input.saleUnitName, input.saleUnitFactor, input.saleUnitPriceCents,
    );
    if (openingStock > 0) await txn.runAsync(
      `INSERT INTO inventory_movements (id, product_id, kind, quantity_delta, reference_id, reason, created_by)
       VALUES (?, ?, 'adjustment', ?, ?, 'Existencia inicial', ?)`, Crypto.randomUUID(), id, openingStock, id, createdBy,
    );
    await recordAuditEvent(txn, { actor: { id: actorId, name: createdBy }, action: 'Producto creado', entityType: 'Producto', entityId: id, summary: input.name.trim() });
  });
  return id;
}

export async function importProducts(db: SQLiteDatabase, inputs: ProductInput[], createdBy = 'Administrador', actorId?: string): Promise<void> {
  if (!inputs.length) return;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    for (const input of inputs) {
      const sku = normalizeSku(input.sku);
      const barcode = normalizeBarcode(input.barcode);
      const productId = Crypto.randomUUID();
      const openingStock = input.openingStock ?? 0;
      if (sku) {
        const key = sku.toLocaleUpperCase('en-US');
        if (seenSkus.has(key)) throw new Error('duplicate_import_sku');
        seenSkus.add(key);
        const existing = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM products WHERE sku = ? COLLATE NOCASE LIMIT 1', sku,
        );
        if (existing) throw new Error('duplicate_existing_sku');
      }
      if (barcode) {
        const key = barcode.toLocaleUpperCase('en-US');
        if (seenBarcodes.has(key)) throw new Error('duplicate_import_barcode');
        seenBarcodes.add(key);
        const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM products WHERE barcode = ? COLLATE NOCASE LIMIT 1', barcode);
        if (existing) throw new Error('duplicate_existing_barcode');
      }
      await transaction.runAsync(
        `INSERT INTO products (id, sku, barcode, name, description, cost_cents, price_cents, stock_quantity, minimum_stock, unit_name, sale_unit_name, sale_unit_factor, sale_unit_price_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        productId,
        sku,
        barcode,
        input.name.trim(),
        input.description.trim(),
        input.costCents,
        input.priceCents,
        openingStock,
        input.minimumStock,
        input.unitName,
        input.saleUnitName,
        input.saleUnitFactor,
        input.saleUnitPriceCents,
      );
      if (openingStock > 0) await transaction.runAsync(
        `INSERT INTO inventory_movements (id, product_id, kind, quantity_delta, reference_id, reason, created_by)
         VALUES (?, ?, 'adjustment', ?, ?, 'Existencia inicial', ?)`,
        Crypto.randomUUID(), productId, openingStock, productId, createdBy,
      );
    }
    await recordAuditEvent(transaction, { actor: { id: actorId, name: createdBy }, action: 'Catálogo importado', entityType: 'Producto', summary: `${inputs.length} productos importados.` });
  });
}

export async function updateProduct(db: SQLiteDatabase, id: string, input: ProductInput, updatedBy = 'Administrador', actorId?: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const current = await txn.getFirstAsync<{ stock_quantity: number; unit_name: string; sale_unit_name: string; sale_unit_factor: number; sale_unit_price_cents: number | null }>(
      'SELECT stock_quantity,unit_name,sale_unit_name,sale_unit_factor,sale_unit_price_cents FROM products WHERE id=?', id,
    );
    if (!current) throw new Error('No se encontró el producto.');
    if (current.stock_quantity > 0 && current.unit_name !== input.unitName) throw new Error('No se puede cambiar la unidad base mientras haya existencias. Ajusta el inventario primero.');
    const conversionChanged = current.sale_unit_name !== input.saleUnitName || current.sale_unit_factor !== input.saleUnitFactor || current.sale_unit_price_cents !== input.saleUnitPriceCents;
    if (conversionChanged) {
      const reservation = await txn.getFirstAsync<{ id: string }>(
        "SELECT i.id FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE i.product_id=? AND d.kind='layaway' AND d.status='open' LIMIT 1", id,
      );
      if (reservation) throw new Error('Cancela los apartados abiertos de este producto antes de cambiar su unidad de venta.');
    }
    await txn.runAsync(
      `UPDATE products
       SET sku = ?, barcode = ?, name = ?, description = ?, cost_cents = ?, price_cents = ?, minimum_stock = ?, unit_name = ?, sale_unit_name = ?, sale_unit_factor = ?, sale_unit_price_cents = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
      normalizeSku(input.sku), normalizeBarcode(input.barcode), input.name.trim(), input.description.trim(), input.costCents, input.priceCents,
      input.minimumStock, input.unitName, input.saleUnitName, input.saleUnitFactor, input.saleUnitPriceCents, id,
    );
    await recordAuditEvent(txn, { actor: { id: actorId, name: updatedBy }, action: 'Producto actualizado', entityType: 'Producto', entityId: id, summary: input.name.trim() });
  });
}

export async function setProductActive(db: SQLiteDatabase, id: string, isActive: boolean, updatedBy = 'Administrador', actorId?: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const product = await txn.getFirstAsync<{ name: string }>('SELECT name FROM products WHERE id=?', id);
    if (!product) throw new Error('No se encontró el producto.');
    await txn.runAsync(`UPDATE products SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, isActive ? 1 : 0, id);
    await recordAuditEvent(txn, { actor: { id: actorId, name: updatedBy }, action: isActive ? 'Producto activado' : 'Producto desactivado', entityType: 'Producto', entityId: id, summary: product.name });
  });
}

function normalizeSku(sku: string | null): string | null {
  const normalized = sku?.trim().toUpperCase() ?? '';
  return normalized || null;
}

function normalizeBarcode(barcode: string | null): string | null {
  const normalized = barcode?.trim() ?? '';
  return normalized || null;
}
