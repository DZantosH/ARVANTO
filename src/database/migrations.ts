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
}
