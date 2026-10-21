import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  cost_cents: number;
  price_cents: number;
  stock_quantity: number;
  minimum_stock: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  sku: string | null;
  name: string;
  description: string;
  costCents: number;
  priceCents: number;
  minimumStock: number;
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
    conditions.push("(name LIKE ? ESCAPE '!' OR COALESCE(sku, '') LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')");
    const escaped = `%${trimmedSearch.replace(/[!%_]/g, '!$&')}%`;
    parameters.push(escaped, escaped, escaped);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM products ${where}`,
    ...parameters,
  );
  const items = await db.getAllAsync<Product>(
    `SELECT id, sku, name, description, cost_cents, price_cents, stock_quantity, minimum_stock, is_active, created_at, updated_at
     FROM products ${where}
     ORDER BY is_active DESC, name COLLATE NOCASE ASC
     LIMIT ? OFFSET ?`,
    ...parameters,
    PAGE_SIZE,
    offset,
  );

  return { items, total: count?.total ?? 0 };
}

export async function createProduct(db: SQLiteDatabase, input: ProductInput): Promise<string> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO products (id, sku, name, description, cost_cents, price_cents, stock_quantity, minimum_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    normalizeSku(input.sku),
    input.name.trim(),
    input.description.trim(),
    input.costCents,
    input.priceCents,
    input.openingStock ?? 0,
    input.minimumStock,
  );
  return id;
}

export async function importProducts(db: SQLiteDatabase, inputs: ProductInput[]): Promise<void> {
  if (!inputs.length) return;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const seenSkus = new Set<string>();
    for (const input of inputs) {
      const sku = normalizeSku(input.sku);
      if (sku) {
        const key = sku.toLocaleUpperCase('en-US');
        if (seenSkus.has(key)) throw new Error('duplicate_import_sku');
        seenSkus.add(key);
        const existing = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM products WHERE sku = ? COLLATE NOCASE LIMIT 1', sku,
        );
        if (existing) throw new Error('duplicate_existing_sku');
      }
      await transaction.runAsync(
        `INSERT INTO products (id, sku, name, description, cost_cents, price_cents, stock_quantity, minimum_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        sku,
        input.name.trim(),
        input.description.trim(),
        input.costCents,
        input.priceCents,
        input.openingStock ?? 0,
        input.minimumStock,
      );
    }
  });
}

export async function updateProduct(db: SQLiteDatabase, id: string, input: ProductInput): Promise<void> {
  await db.runAsync(
    `UPDATE products
     SET sku = ?, name = ?, description = ?, cost_cents = ?, price_cents = ?, minimum_stock = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`,
    normalizeSku(input.sku),
    input.name.trim(),
    input.description.trim(),
    input.costCents,
    input.priceCents,
    input.minimumStock,
    id,
  );
}

export async function setProductActive(db: SQLiteDatabase, id: string, isActive: boolean): Promise<void> {
  await db.runAsync(
    `UPDATE products SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    isActive ? 1 : 0,
    id,
  );
}

function normalizeSku(sku: string | null): string | null {
  const normalized = sku?.trim().toUpperCase() ?? '';
  return normalized || null;
}
