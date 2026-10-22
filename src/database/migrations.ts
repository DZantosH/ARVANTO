import type { SQLiteDatabase } from '@/src/native/database';

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
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
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
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 1);
    });
  }

  if ((current?.version ?? 0) < 2) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0);
        UPDATE products SET sku = NULL WHERE sku IS NOT NULL AND trim(sku) = '';
        CREATE UNIQUE INDEX products_sku_nocase_idx
          ON products (sku COLLATE NOCASE)
          WHERE sku IS NOT NULL;
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 2);
    });
  }

  if ((current?.version ?? 0) < 3) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
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
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 3);
    });
  }

  if ((current?.version ?? 0) < 4) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        DROP INDEX inventory_movements_product_time_idx;
        ALTER TABLE inventory_movements RENAME TO inventory_movements_v3;
        CREATE TABLE inventory_movements (
          id TEXT PRIMARY KEY NOT NULL,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          kind TEXT NOT NULL CHECK (kind IN ('sale', 'adjustment', 'purchase')),
          quantity_delta REAL NOT NULL CHECK (quantity_delta <> 0),
          reference_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        INSERT INTO inventory_movements SELECT * FROM inventory_movements_v3;
        DROP TABLE inventory_movements_v3;
        CREATE INDEX inventory_movements_product_time_idx ON inventory_movements (product_id, created_at DESC);

        CREATE TABLE customers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          credit_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_cents >= 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX customers_name_idx ON customers (name COLLATE NOCASE);
        ALTER TABLE sales ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT;
        ALTER TABLE sales ADD COLUMN credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0);

        CREATE TABLE credit_payments (
          id TEXT PRIMARY KEY NOT NULL,
          customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
          method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX credit_payments_customer_time_idx ON credit_payments (customer_id, created_at DESC);

        CREATE TABLE suppliers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE purchases (
          id TEXT PRIMARY KEY NOT NULL,
          supplier_id TEXT REFERENCES suppliers(id) ON DELETE RESTRICT,
          reference TEXT NOT NULL DEFAULT '',
          total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX purchases_created_at_idx ON purchases (created_at DESC);
        CREATE TABLE purchase_items (
          id TEXT PRIMARY KEY NOT NULL,
          purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          product_name TEXT NOT NULL,
          quantity REAL NOT NULL CHECK (quantity > 0),
          unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
          line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
        );
        CREATE INDEX purchase_items_purchase_idx ON purchase_items (purchase_id);

        CREATE TABLE app_users (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          pin_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX app_users_active_idx ON app_users (is_active, name COLLATE NOCASE);
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 4);
    });
  }

  if ((current?.version ?? 0) < 5) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE sales ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0);
        CREATE TABLE sale_returns (
          id TEXT PRIMARY KEY NOT NULL,
          sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
          reason TEXT NOT NULL,
          refund_cents INTEGER NOT NULL CHECK (refund_cents >= 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX sale_returns_sale_idx ON sale_returns (sale_id, created_at);
        CREATE TABLE sale_return_items (
          id TEXT PRIMARY KEY NOT NULL,
          return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE RESTRICT,
          sale_item_id TEXT NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          quantity REAL NOT NULL CHECK (quantity > 0),
          refund_cents INTEGER NOT NULL CHECK (refund_cents >= 0)
        );
        CREATE TABLE sales_documents (
          id TEXT PRIMARY KEY NOT NULL,
          document_number INTEGER NOT NULL UNIQUE,
          kind TEXT NOT NULL CHECK (kind IN ('quote', 'layaway')),
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'converted', 'cancelled', 'expired')),
          customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
          customer_name TEXT NOT NULL DEFAULT '',
          subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
          discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
          tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
          total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
          expires_at TEXT,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX sales_documents_open_idx ON sales_documents (status, kind, created_at DESC);
        CREATE TABLE sales_document_items (
          id TEXT PRIMARY KEY NOT NULL,
          document_id TEXT NOT NULL REFERENCES sales_documents(id) ON DELETE RESTRICT,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          product_name TEXT NOT NULL,
          sku TEXT,
          quantity REAL NOT NULL CHECK (quantity > 0),
          unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
          line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
        );
        CREATE INDEX sales_document_items_doc_idx ON sales_document_items (document_id);
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 5);
    });
  }

  if ((current?.version ?? 0) < 6) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE sale_returns ADD COLUMN cash_refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (cash_refund_cents >= 0);
        ALTER TABLE sale_returns ADD COLUMN card_refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (card_refund_cents >= 0);
        ALTER TABLE sale_returns ADD COLUMN transfer_refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (transfer_refund_cents >= 0);
        ALTER TABLE sale_returns ADD COLUMN credit_refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_refund_cents >= 0);
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 6);
    });
  }

  if ((current?.version ?? 0) < 7) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE products ADD COLUMN barcode TEXT;
        ALTER TABLE products ADD COLUMN unit_name TEXT NOT NULL DEFAULT 'pieza';
        ALTER TABLE products ADD COLUMN sale_unit_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN sale_unit_factor REAL NOT NULL DEFAULT 1 CHECK (sale_unit_factor > 0);
        ALTER TABLE products ADD COLUMN sale_unit_price_cents INTEGER CHECK (sale_unit_price_cents IS NULL OR sale_unit_price_cents >= 0);
        CREATE UNIQUE INDEX products_barcode_nocase_idx ON products (barcode COLLATE NOCASE) WHERE barcode IS NOT NULL;

        ALTER TABLE sale_items ADD COLUMN inventory_quantity REAL NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0);
        ALTER TABLE sale_items ADD COLUMN unit_name TEXT NOT NULL DEFAULT 'pieza';
        ALTER TABLE sale_items ADD COLUMN unit_factor REAL NOT NULL DEFAULT 1 CHECK (unit_factor > 0);
        UPDATE sale_items SET inventory_quantity = quantity;
        ALTER TABLE sale_return_items ADD COLUMN inventory_quantity REAL NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0);
        UPDATE sale_return_items SET inventory_quantity = quantity;
        ALTER TABLE sales_document_items ADD COLUMN unit_name TEXT NOT NULL DEFAULT 'pieza';
        ALTER TABLE sales_document_items ADD COLUMN unit_factor REAL NOT NULL DEFAULT 1 CHECK (unit_factor > 0);
        ALTER TABLE sales_document_items ADD COLUMN inventory_quantity REAL NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0);
        UPDATE sales_document_items SET inventory_quantity = quantity;

        CREATE TABLE inventory_counts (
          id TEXT PRIMARY KEY NOT NULL,
          count_number INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
          started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          completed_at TEXT,
          created_by TEXT NOT NULL DEFAULT 'Administrador',
          completed_by TEXT
        );
        CREATE UNIQUE INDEX inventory_one_open_count_idx ON inventory_counts ((1)) WHERE status = 'open';
        CREATE INDEX inventory_counts_time_idx ON inventory_counts (started_at DESC);
        CREATE TABLE inventory_count_items (
          id TEXT PRIMARY KEY NOT NULL,
          count_id TEXT NOT NULL REFERENCES inventory_counts(id) ON DELETE RESTRICT,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          product_name TEXT NOT NULL,
          barcode TEXT,
          system_quantity REAL NOT NULL CHECK (system_quantity >= 0),
          counted_quantity REAL CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
          counted_at TEXT,
          applied_delta REAL,
          UNIQUE (count_id, product_id)
        );
        CREATE INDEX inventory_count_items_count_idx ON inventory_count_items (count_id, product_name COLLATE NOCASE);
        CREATE INDEX inventory_count_items_barcode_idx ON inventory_count_items (count_id, barcode COLLATE NOCASE);
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 7);
    });
  }

  if ((current?.version ?? 0) < 8) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE purchases ADD COLUMN status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('pending', 'partial', 'received'));
        ALTER TABLE purchases ADD COLUMN is_legacy INTEGER NOT NULL DEFAULT 0 CHECK (is_legacy IN (0, 1));
        ALTER TABLE purchase_items ADD COLUMN received_quantity REAL NOT NULL DEFAULT 0 CHECK (received_quantity >= 0);
        UPDATE purchase_items SET received_quantity = quantity;
        UPDATE purchases SET is_legacy = 1;

        CREATE TABLE purchase_receipts (
          id TEXT PRIMARY KEY NOT NULL,
          purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
          reference TEXT NOT NULL DEFAULT '',
          received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX purchase_receipts_purchase_idx ON purchase_receipts (purchase_id, received_at DESC);
        CREATE TABLE purchase_receipt_items (
          id TEXT PRIMARY KEY NOT NULL,
          receipt_id TEXT NOT NULL REFERENCES purchase_receipts(id) ON DELETE RESTRICT,
          purchase_item_id TEXT NOT NULL REFERENCES purchase_items(id) ON DELETE RESTRICT,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
          quantity REAL NOT NULL CHECK (quantity > 0),
          unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0)
        );
        CREATE INDEX purchase_receipt_items_receipt_idx ON purchase_receipt_items (receipt_id);
        INSERT INTO purchase_receipts (id, purchase_id, reference, received_at, created_by)
          SELECT 'legacy-' || id, id, reference, created_at, created_by FROM purchases;
        INSERT INTO purchase_receipt_items (id, receipt_id, purchase_item_id, product_id, quantity, unit_cost_cents)
          SELECT lower(hex(randomblob(16))), 'legacy-' || purchase_id, id, product_id, received_quantity, unit_cost_cents
          FROM purchase_items WHERE received_quantity > 0;

        CREATE TABLE supplier_payments (
          id TEXT PRIMARY KEY NOT NULL,
          purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
          supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
          session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE RESTRICT,
          method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          created_by TEXT NOT NULL DEFAULT 'Administrador'
        );
        CREATE INDEX supplier_payments_purchase_time_idx ON supplier_payments (purchase_id, created_at DESC);
        CREATE INDEX supplier_payments_supplier_time_idx ON supplier_payments (supplier_id, created_at DESC);
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 8);
    });
  }

  if ((current?.version ?? 0) < 9) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE sales ADD COLUMN cancelled_by TEXT;
        ALTER TABLE sales ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '';
        ALTER TABLE sales_documents ADD COLUMN cancelled_by TEXT;
        ALTER TABLE sales_documents ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '';
        ALTER TABLE inventory_counts ADD COLUMN cancelled_by TEXT;
        CREATE TABLE audit_logs (
          id TEXT PRIMARY KEY NOT NULL,
          actor_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
          actor_name TEXT NOT NULL DEFAULT 'Sistema',
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
        CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
        CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, created_at DESC);

        CREATE TRIGGER audit_sales_insert AFTER INSERT ON sales BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Venta registrada', 'Venta', NEW.id,
            'Ticket #' || NEW.ticket_number || ' · total ' || NEW.total_cents || ' centavos · crédito ' || NEW.credit_cents || ' centavos');
        END;
        CREATE TRIGGER audit_sale_returns_insert AFTER INSERT ON sale_returns BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Devolución registrada', 'Venta', NEW.sale_id,
            'Reembolso ' || NEW.refund_cents || ' centavos · ' || NEW.reason);
        END;
        CREATE TRIGGER audit_sales_cancelled AFTER UPDATE OF status ON sales WHEN OLD.status='completed' AND NEW.status='cancelled' BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), COALESCE(NEW.cancelled_by, NEW.created_by), 'Venta cancelada', 'Venta', NEW.id,
            'Ticket #' || NEW.ticket_number || ' · ' || COALESCE(NEW.cancel_reason, 'Sin motivo'));
        END;
        CREATE TRIGGER audit_credit_payments_insert AFTER INSERT ON credit_payments BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Abono de cliente', 'Cliente', NEW.customer_id,
            NEW.amount_cents || ' centavos · ' || NEW.method);
        END;
        CREATE TRIGGER audit_cash_sessions_insert AFTER INSERT ON cash_sessions BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.opened_by, 'Caja abierta', 'Caja', NEW.id,
            'Fondo inicial ' || NEW.opening_cash_cents || ' centavos');
        END;
        CREATE TRIGGER audit_cash_sessions_close AFTER UPDATE OF closed_at ON cash_sessions WHEN OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.closed_by, 'Caja cerrada', 'Caja', NEW.id,
            'Diferencia ' || COALESCE(NEW.difference_cents, 0) || ' centavos');
        END;
        CREATE TRIGGER audit_cash_movements_insert AFTER INSERT ON cash_movements BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by,
            CASE NEW.kind WHEN 'in' THEN 'Entrada de caja' ELSE 'Salida de caja' END,
            'Caja', NEW.session_id, NEW.amount_cents || ' centavos · ' || NEW.reason);
        END;
        CREATE TRIGGER audit_inventory_adjustments AFTER INSERT ON inventory_movements WHEN NEW.kind IN ('adjustment', 'purchase') BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by,
            CASE NEW.kind WHEN 'purchase' THEN 'Existencia recibida' ELSE 'Inventario ajustado' END,
            'Producto', NEW.product_id, NEW.quantity_delta || ' unidades · ' || NEW.reason);
        END;
        CREATE TRIGGER audit_purchases_insert AFTER INSERT ON purchases BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Compra creada', 'Compra', NEW.id,
            'Referencia ' || COALESCE(NULLIF(NEW.reference, ''), 'sin referencia') || ' · total ' || NEW.total_cents || ' centavos');
        END;
        CREATE TRIGGER audit_purchase_receipts_insert AFTER INSERT ON purchase_receipts BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Recepción de compra', 'Compra', NEW.purchase_id,
            'Remisión ' || COALESCE(NULLIF(NEW.reference, ''), 'sin referencia'));
        END;
        CREATE TRIGGER audit_supplier_payments_insert AFTER INSERT ON supplier_payments BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Abono a proveedor', 'Compra', NEW.purchase_id,
            NEW.amount_cents || ' centavos · ' || NEW.method);
        END;
        CREATE TRIGGER audit_inventory_counts_insert AFTER INSERT ON inventory_counts BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by, 'Conteo iniciado', 'Inventario', NEW.id,
            'Conteo físico #' || NEW.count_number);
        END;
        CREATE TRIGGER audit_inventory_counts_status AFTER UPDATE OF status ON inventory_counts WHEN OLD.status='open' AND NEW.status IN ('completed','cancelled') BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), COALESCE(NEW.completed_by, NEW.cancelled_by, NEW.created_by),
            CASE NEW.status WHEN 'completed' THEN 'Conteo finalizado' ELSE 'Conteo cancelado' END,
            'Inventario', NEW.id, 'Conteo físico #' || NEW.count_number);
        END;
        CREATE TRIGGER audit_sales_documents_insert AFTER INSERT ON sales_documents BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), NEW.created_by,
            CASE NEW.kind WHEN 'quote' THEN 'Cotización creada' ELSE 'Apartado creado' END,
            'Documento de venta', NEW.id, 'Documento #' || NEW.document_number || ' · total ' || NEW.total_cents || ' centavos');
        END;
        CREATE TRIGGER audit_sales_documents_cancelled AFTER UPDATE OF status ON sales_documents WHEN OLD.status='open' AND NEW.status='cancelled' BEGIN
          INSERT INTO audit_logs (id, actor_name, action, entity_type, entity_id, summary)
          VALUES (lower(hex(randomblob(16))), COALESCE(NEW.cancelled_by, NEW.created_by), 'Documento cancelado', 'Documento de venta', NEW.id,
            'Documento #' || NEW.document_number || ' · ' || COALESCE(NEW.cancel_reason, 'Sin motivo'));
        END;
      `);
      await txn.runAsync('INSERT INTO schema_migrations (version) VALUES (?)', 9);
    });
  }
  if ((current?.version ?? 0) < 10) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        ALTER TABLE app_users ADD COLUMN username TEXT;
        ALTER TABLE app_users ADD COLUMN remote_id TEXT;
        ALTER TABLE app_users ADD COLUMN business_id TEXT;
        CREATE UNIQUE INDEX app_users_remote_idx ON app_users(remote_id,business_id) WHERE remote_id IS NOT NULL;
        CREATE TABLE app_auth_state (
          id INTEGER PRIMARY KEY CHECK(id=1),
          session_epoch INTEGER NOT NULL DEFAULT 0,
          last_end_reason TEXT NOT NULL DEFAULT '',
          business_id TEXT
        );
        INSERT INTO app_auth_state(id) VALUES(1);
      `);
      await txn.runAsync('INSERT INTO schema_migrations(version) VALUES(?)', 10);
    });
  }

}
