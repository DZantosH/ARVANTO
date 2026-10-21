import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const current = await db.getFirstAsync<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  if ((current?.version ?? 0) < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE business_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          business_name TEXT NOT NULL DEFAULT 'Mi ferretería',
          currency TEXT NOT NULL DEFAULT 'MXN',
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        INSERT INTO business_settings (id) VALUES (1);

        CREATE TABLE products (
          id TEXT PRIMARY KEY NOT NULL,
          sku TEXT UNIQUE,
          name TEXT NOT NULL,
          price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
          stock_quantity REAL NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
          minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX products_active_name_idx ON products (is_active, name);
      `);
      await db.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 1);
    });
  }

  if ((current?.version ?? 0) < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0);
        UPDATE products SET sku = NULL WHERE sku IS NOT NULL AND trim(sku) = '';
        CREATE UNIQUE INDEX products_sku_nocase_idx
          ON products (sku COLLATE NOCASE)
          WHERE sku IS NOT NULL;
      `);
      await db.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 2);
    });
  }

  if ((current?.version ?? 0) < 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE cash_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          opened_by TEXT NOT NULL DEFAULT 'Administrador',
          opening_cash_cents INTEGER NOT NULL CHECK (opening_cash_cents >= 0),
          closed_at TEXT,
          closed_by TEXT,
          expected_cash_cents INTEGER CHECK (expected_cash_cents >= 0),
          counted_cash_cents INTEGER CHECK (counted_cash_cents >= 0),
          difference_cents INTEGER,
          CHECK ((closed_at IS NULL AND counted_cash_cents IS NULL) OR (closed_at IS NOT NULL AND counted_cash_cents IS NOT NULL))
        );
        CREATE UNIQUE INDEX cash_one_open_session_idx ON cash_sessions ((1)) WHERE closed_at IS NULL;

        CREATE TABLE cash_movements (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
          kind TEXT NOT NULL CHECK (kind IN ('in', 'out')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX cash_movements_session_time_idx ON cash_movements (session_id, created_at);

        CREATE TABLE sales (
          id TEXT PRIMARY KEY NOT NULL,
          ticket_number INTEGER NOT NULL UNIQUE,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
          subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
          discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
          total_cents INTEGER NOT NULL CHECK (total_cents > 0),
          change_cents INTEGER NOT NULL DEFAULT 0 CHECK (change_cents >= 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX sales_created_at_idx ON sales (created_at DESC);
        CREATE INDEX sales_session_idx ON sales (session_id, created_at);

        CREATE TABLE sale_items (
          id TEXT PRIMARY KEY NOT NULL,
          sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          product_name TEXT NOT NULL,
          sku TEXT,
          quantity REAL NOT NULL CHECK (quantity > 0),
          unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
          unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
          line_total_cents INTEGER NOT NULL CHECK (line_total_cents > 0)
        );
        CREATE INDEX sale_items_sale_idx ON sale_items (sale_id);

        CREATE TABLE payments (
          id TEXT PRIMARY KEY NOT NULL,
          sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
          method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX payments_session_method_idx ON payments (session_id, method);

        CREATE TABLE inventory_movements (
          id TEXT PRIMARY KEY NOT NULL,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          kind TEXT NOT NULL CHECK (kind IN ('sale', 'adjustment')),
          quantity_delta REAL NOT NULL CHECK (quantity_delta <> 0),
          reference_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX inventory_movements_product_time_idx ON inventory_movements (product_id, created_at DESC);
      `);
      await db.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 3);
    });
  }
}
