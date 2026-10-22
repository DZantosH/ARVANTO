import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type InventoryMovement = { id: string; product_name: string; sku: string | null; unit_name: string; kind: 'sale' | 'adjustment' | 'purchase'; quantity_delta: number; reason: string; created_at: string; created_by: string };
export type Customer = { id: string; name: string; phone: string; email: string; address: string; credit_limit_cents: number; is_active: number; balance_cents: number };
export type Supplier = { id: string; name: string; phone: string; email: string; balance_cents?: number };
export type ProductOption = { id: string; name: string; sku: string | null; barcode: string | null; unit_name: string; cost_cents: number; stock_quantity: number };
export type AppUser = { id: string; name: string; role: 'admin' | 'manager' | 'cashier'; is_active: number };
export type UserRole = AppUser['role'];

async function makePinHash(pin: string, salt: string) {
  return `${salt}$${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`)}`;
}

export async function getUsers(db: SQLiteDatabase) {
  return db.getAllAsync<AppUser>('SELECT id, name, role, is_active FROM app_users ORDER BY is_active DESC, name COLLATE NOCASE');
}

export async function createUser(db: SQLiteDatabase, name: string, pin: string, role: UserRole) {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 80) throw new Error('El nombre debe tener entre 2 y 80 caracteres.');
  if (!/^\d{6,8}$/.test(pin)) throw new Error('El PIN debe tener entre 6 y 8 dígitos.');
  const existing = await db.getAllAsync<{ pin_hash: string }>('SELECT pin_hash FROM app_users');
  for (const record of existing) {
    const separator = record.pin_hash.indexOf('$');
    if (separator > 0 && await makePinHash(pin, record.pin_hash.slice(0, separator)) === record.pin_hash) throw new Error('Ese PIN ya está asignado a otro usuario. Elige uno distinto.');
  }
  const salt = Crypto.randomUUID();
  await db.runAsync('INSERT INTO app_users (id, name, pin_hash, role) VALUES (?, ?, ?, ?)', Crypto.randomUUID(), normalized, await makePinHash(pin, salt), role);
}

export async function authenticateUser(db: SQLiteDatabase, pin: string): Promise<AppUser | null> {
  const candidates = await db.getAllAsync<AppUser & { pin_hash: string }>('SELECT id, name, role, is_active, pin_hash FROM app_users WHERE is_active = 1');
  let match: AppUser | null = null;
  for (const candidate of candidates) {
    const separator = candidate.pin_hash.indexOf('$');
    const salt = candidate.pin_hash.slice(0, separator);
    if (separator > 0 && await makePinHash(pin, salt) === candidate.pin_hash) {
      if (match) return null;
      const { pin_hash: _pinHash, ...user } = candidate;
      match = user;
    }
  }
  return match;
}

export async function setUserActive(db: SQLiteDatabase, id: string, active: boolean) {
  await db.runAsync('UPDATE app_users SET is_active = ? WHERE id = ?', active ? 1 : 0, id);
}

export async function getInventoryMovements(db: SQLiteDatabase, productId?: string) {
  const where = productId ? 'WHERE m.product_id = ?' : '';
  const args = productId ? [productId] : [];
  return db.getAllAsync<InventoryMovement>(
    `SELECT m.id, p.name AS product_name, p.sku, p.unit_name, m.kind, m.quantity_delta, m.reason, m.created_at, m.created_by
     FROM inventory_movements m JOIN products p ON p.id = m.product_id ${where}
     ORDER BY m.created_at DESC LIMIT 100`, ...args,
  );
}

export async function adjustInventory(db: SQLiteDatabase, productId: string, delta: number, reason: string, createdBy = 'Administrador') {
  const note = reason.trim();
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) throw new Error('La cantidad debe ser distinta de cero y válida.');
  if (note.length < 3 || note.length > 160) throw new Error('El motivo debe tener entre 3 y 160 caracteres.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const product = await txn.getFirstAsync<{ stock_quantity: number; is_active: number }>('SELECT stock_quantity, is_active FROM products WHERE id = ?', productId);
    if (!product || !product.is_active) throw new Error('El producto no existe o está inactivo.');
    const next = product.stock_quantity + delta;
    if (next < 0) throw new Error('El ajuste dejaría existencias negativas.');
    await txn.runAsync('UPDATE products SET stock_quantity = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?', next, productId);
    await txn.runAsync('INSERT INTO inventory_movements (id, product_id, kind, quantity_delta, reference_id, reason, created_by) VALUES (?, ?, \'adjustment\', ?, ?, ?, ?)', Crypto.randomUUID(), productId, delta, Crypto.randomUUID(), note, createdBy);
  });
}

export async function getCustomers(db: SQLiteDatabase, query = '') {
  const term = `%${query.trim().replace(/[!%_]/g, '!$&')}%`;
  return db.getAllAsync<Customer>(
    `SELECT c.id, c.name, c.phone, c.email, c.address, c.credit_limit_cents, c.is_active,
      COALESCE((SELECT SUM(s.credit_cents) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed'), 0) -
      COALESCE((SELECT SUM(r.credit_refund_cents) FROM sale_returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=c.id AND s.status='completed'), 0) -
      COALESCE((SELECT SUM(cp.amount_cents) FROM credit_payments cp WHERE cp.customer_id = c.id), 0) AS balance_cents
     FROM customers c WHERE c.name LIKE ? ESCAPE '!' OR c.phone LIKE ? ESCAPE '!'
     ORDER BY c.is_active DESC, c.name COLLATE NOCASE LIMIT 100`, term, term,
  );
}

export async function createCustomer(db: SQLiteDatabase, values: { name: string; phone: string; email: string; address: string; creditLimitCents: number }) {
  const name = values.name.trim();
  if (name.length < 2 || name.length > 100) throw new Error('El nombre debe tener entre 2 y 100 caracteres.');
  if (!Number.isSafeInteger(values.creditLimitCents) || values.creditLimitCents < 0) throw new Error('El límite de crédito no es válido.');
  await db.runAsync('INSERT INTO customers (id, name, phone, email, address, credit_limit_cents) VALUES (?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), name, values.phone.trim(), values.email.trim(), values.address.trim(), values.creditLimitCents);
}

export async function addCreditPayment(db: SQLiteDatabase, customerId: string, method: 'cash' | 'card' | 'transfer', amountCents: number, note: string, createdBy = 'Administrador') {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('El abono debe ser mayor a cero.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre caja para registrar un abono.');
    const customer = await txn.getFirstAsync<{ balance: number }>(
      `SELECT COALESCE((SELECT SUM(credit_cents) FROM sales WHERE customer_id = ? AND status = 'completed'), 0) -
       COALESCE((SELECT SUM(r.credit_refund_cents) FROM sale_returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=? AND s.status='completed'), 0) -
       COALESCE((SELECT SUM(amount_cents) FROM credit_payments WHERE customer_id = ?), 0) AS balance`, customerId, customerId, customerId,
    );
    if (!customer || amountCents > customer.balance) throw new Error('El abono supera el saldo pendiente del cliente.');
    await txn.runAsync('INSERT INTO credit_payments (id, customer_id, session_id, method, amount_cents, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), customerId, session.id, method, amountCents, note.trim().slice(0, 160), createdBy);
  });
}

export async function getActiveSuppliers(db: SQLiteDatabase) {
  return db.getAllAsync<Supplier & { balance_cents: number }>(
    `SELECT s.id, s.name, s.phone, s.email,
      COALESCE((SELECT SUM(p.total_cents) FROM purchases p WHERE p.supplier_id=s.id AND p.is_legacy=0),0) -
      COALESCE((SELECT SUM(sp.amount_cents) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) AS balance_cents
     FROM suppliers s ORDER BY s.name COLLATE NOCASE`,
  );
}

export async function getActiveProductOptions(db: SQLiteDatabase) {
  return db.getAllAsync<ProductOption>('SELECT id, name, sku, barcode, unit_name, cost_cents, stock_quantity FROM products WHERE is_active = 1 ORDER BY name COLLATE NOCASE LIMIT 500');
}

export async function getLowStockProducts(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: string; name: string; sku: string | null; barcode: string | null; stock_quantity: number; minimum_stock: number; unit_name: string }>(
    'SELECT id,name,sku,barcode,stock_quantity,minimum_stock,unit_name FROM products WHERE is_active=1 AND minimum_stock>0 AND stock_quantity<=minimum_stock ORDER BY (minimum_stock-stock_quantity) DESC,name COLLATE NOCASE LIMIT 100',
  );
}

export async function createSupplier(db: SQLiteDatabase, name: string, phone = '', email = '') {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 100) throw new Error('El proveedor debe tener entre 2 y 100 caracteres.');
  await db.runAsync('INSERT INTO suppliers (id, name, phone, email) VALUES (?, ?, ?, ?)', Crypto.randomUUID(), normalized, phone.trim(), email.trim());
}

export async function createPurchaseOrder(db: SQLiteDatabase, supplierId: string | null, reference: string, lines: { product: ProductOption; quantity: number; unitCostCents: number }[], createdBy = 'Administrador') {
  if (!lines.length) throw new Error('Agrega al menos un producto a la compra.');
  if (!supplierId) throw new Error('Selecciona un proveedor para generar la cuenta por pagar.');
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000) throw new Error(`Revisa la cantidad de ${line.product.name}.`);
    if (!Number.isSafeInteger(line.unitCostCents) || line.unitCostCents < 0) throw new Error(`Revisa el costo de ${line.product.name}.`);
  }
  const purchaseId = Crypto.randomUUID();
  const total = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCostCents), 0);
  if (!Number.isSafeInteger(total)) throw new Error('El total de compra excede el límite permitido.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (supplierId && !await txn.getFirstAsync<{ id: string }>('SELECT id FROM suppliers WHERE id = ?', supplierId)) throw new Error('El proveedor seleccionado ya no existe.');
    await txn.runAsync('INSERT INTO purchases (id, supplier_id, reference, total_cents, status, created_by) VALUES (?, ?, ?, ?, \'pending\', ?)', purchaseId, supplierId, reference.trim().slice(0, 80), total, createdBy);
    for (const line of lines) {
      const current = await txn.getFirstAsync<{ name: string; is_active: number }>('SELECT name, is_active FROM products WHERE id = ?', line.product.id);
      if (!current || !current.is_active) throw new Error(`El producto ${line.product.name} ya no está activo.`);
      const lineTotal = Math.round(line.quantity * line.unitCostCents);
      await txn.runAsync('INSERT INTO purchase_items (id, purchase_id, product_id, product_name, quantity, unit_cost_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), purchaseId, line.product.id, current.name, line.quantity, line.unitCostCents, lineTotal);
    }
  });
}

export async function receivePurchaseItems(db: SQLiteDatabase, purchaseId: string, lines: { itemId: string; quantity: number }[], receiptReference: string, createdBy = 'Administrador') {
  if (!lines.length) throw new Error('Indica al menos una cantidad por recibir.');
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1_000_000)) throw new Error('Las cantidades recibidas deben ser mayores a cero.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const purchase = await txn.getFirstAsync<{ reference: string; status: string }>('SELECT reference, status FROM purchases WHERE id=?', purchaseId);
    if (!purchase || purchase.status === 'received') throw new Error('La compra ya fue recibida por completo o no existe.');
    const receiptId = Crypto.randomUUID();
    await txn.runAsync('INSERT INTO purchase_receipts (id, purchase_id, reference, created_by) VALUES (?, ?, ?, ?)', receiptId, purchaseId, receiptReference.trim().slice(0, 80), createdBy);
    for (const line of lines) {
      const item = await txn.getFirstAsync<{ product_id: string; product_name: string; quantity: number; received_quantity: number; unit_cost_cents: number }>(
        'SELECT product_id, product_name, quantity, received_quantity, unit_cost_cents FROM purchase_items WHERE id=? AND purchase_id=?', line.itemId, purchaseId,
      );
      if (!item) throw new Error('Un renglón de la compra ya no existe.');
      if (line.quantity > item.quantity - item.received_quantity + 0.000001) throw new Error(`La recepción supera lo pendiente de ${item.product_name}.`);
      const product = await txn.getFirstAsync<{ id: string }>('SELECT id FROM products WHERE id=?', item.product_id);
      if (!product) throw new Error(`${item.product_name} ya no existe; no se puede recibir.`);
      await txn.runAsync('INSERT INTO purchase_receipt_items (id, receipt_id, purchase_item_id, product_id, quantity, unit_cost_cents) VALUES (?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), receiptId, line.itemId, item.product_id, line.quantity, item.unit_cost_cents);
      await txn.runAsync('UPDATE purchase_items SET received_quantity=received_quantity+? WHERE id=?', line.quantity, line.itemId);
      await txn.runAsync('UPDATE products SET stock_quantity=stock_quantity+?, cost_cents=?, updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id=?', line.quantity, item.unit_cost_cents, item.product_id);
      await txn.runAsync('INSERT INTO inventory_movements (id, product_id, kind, quantity_delta, reference_id, reason, created_by) VALUES (?, ?, \'purchase\', ?, ?, ?, ?)', Crypto.randomUUID(), item.product_id, line.quantity, receiptId, `Recepción ${purchase.reference || purchaseId.slice(0, 8)}`, createdBy);
    }
    const remaining = await txn.getFirstAsync<{ items: number; complete: number }>(
      'SELECT COUNT(*) AS items, SUM(CASE WHEN received_quantity >= quantity-0.000001 THEN 1 ELSE 0 END) AS complete FROM purchase_items WHERE purchase_id=?', purchaseId,
    );
    await txn.runAsync('UPDATE purchases SET status=? WHERE id=?', remaining?.items && remaining.complete === remaining.items ? 'received' : 'partial', purchaseId);
  });
}

export async function addSupplierPayment(db: SQLiteDatabase, purchaseId: string, method: 'cash' | 'card' | 'transfer', amountCents: number, note: string, createdBy = 'Administrador') {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('El abono debe ser mayor a cero.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre caja para registrar un abono al proveedor.');
    const purchase = await txn.getFirstAsync<{ supplier_id: string | null; total_cents: number; paid_cents: number; reference: string }>(
      `SELECT p.supplier_id, p.total_cents, COALESCE(SUM(sp.amount_cents),0) AS paid_cents, p.reference
       FROM purchases p LEFT JOIN supplier_payments sp ON sp.purchase_id=p.id WHERE p.id=? GROUP BY p.id`, purchaseId,
    );
    if (!purchase?.supplier_id) throw new Error('La compra no está vinculada a un proveedor.');
    if (amountCents > purchase.total_cents - purchase.paid_cents) throw new Error('El abono supera el saldo pendiente de esta compra.');
    await txn.runAsync('INSERT INTO supplier_payments (id, purchase_id, supplier_id, session_id, method, amount_cents, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', Crypto.randomUUID(), purchaseId, purchase.supplier_id, session.id, method, amountCents, note.trim().slice(0, 160), createdBy);
    if (method === 'cash') await txn.runAsync('INSERT INTO cash_movements (id, session_id, kind, amount_cents, reason, created_by) VALUES (?, ?, \'out\', ?, ?, ?)', Crypto.randomUUID(), session.id, amountCents, `Abono proveedor${purchase.reference ? ` · ${purchase.reference}` : ''}`, createdBy);
  });
}

export async function getPurchaseDetails(db: SQLiteDatabase, purchaseId: string) {
  const items = await db.getAllAsync<{ id: string; product_name: string; quantity: number; received_quantity: number; unit_cost_cents: number; line_total_cents: number; unit_name: string }>(
    `SELECT i.id, i.product_name, i.quantity, i.received_quantity, i.unit_cost_cents, i.line_total_cents, p.unit_name
     FROM purchase_items i LEFT JOIN products p ON p.id=i.product_id WHERE i.purchase_id=? ORDER BY i.product_name COLLATE NOCASE`, purchaseId,
  );
  const payments = await db.getAllAsync<{ id: string; method: 'cash' | 'card' | 'transfer'; amount_cents: number; note: string; created_at: string; created_by: string }>(
    'SELECT id, method, amount_cents, note, created_at, created_by FROM supplier_payments WHERE purchase_id=? ORDER BY created_at DESC', purchaseId,
  );
  const receipts = await db.getAllAsync<{ id: string; reference: string; received_at: string; created_by: string; detail: string }>(
    `SELECT r.id, r.reference, r.received_at, r.created_by,
       group_concat(printf('%g %s %s', ri.quantity, COALESCE(p.unit_name,'unidad'), pi.product_name), ', ') AS detail
     FROM purchase_receipts r JOIN purchase_receipt_items ri ON ri.receipt_id=r.id
     JOIN purchase_items pi ON pi.id=ri.purchase_item_id LEFT JOIN products p ON p.id=ri.product_id
     WHERE r.purchase_id=? GROUP BY r.id ORDER BY r.received_at DESC`, purchaseId,
  );
  return { items, payments, receipts };
}

export async function getPurchases(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: string; supplier_name: string | null; reference: string; total_cents: number; paid_cents: number; balance_cents: number; status: 'pending' | 'partial' | 'received'; created_at: string; items_count: number }>(
    `SELECT p.id, s.name AS supplier_name, p.reference, p.total_cents, p.status, p.created_at,
       CASE WHEN p.is_legacy=1 THEN p.total_cents ELSE COALESCE((SELECT SUM(sp2.amount_cents) FROM supplier_payments sp2 WHERE sp2.purchase_id=p.id),0) END AS paid_cents,
       CASE WHEN p.is_legacy=1 THEN 0 ELSE p.total_cents - COALESCE((SELECT SUM(sp2.amount_cents) FROM supplier_payments sp2 WHERE sp2.purchase_id=p.id),0) END AS balance_cents,
       COUNT(DISTINCT i.id) AS items_count
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN purchase_items i ON i.purchase_id = p.id LEFT JOIN supplier_payments sp ON sp.purchase_id=p.id
     GROUP BY p.id ORDER BY p.created_at DESC LIMIT 50`,
  );
}

export async function getBusinessReport(db: SQLiteDatabase) {
  const today = await db.getFirstAsync<{ sales_cents: number; tickets: number; cost_cents: number; credit_cents: number }>(
    `SELECT COALESCE(SUM(total_cents), 0) - COALESCE((SELECT SUM(r.refund_cents) FROM sale_returns r JOIN sales rs ON rs.id=r.sale_id WHERE rs.status='completed' AND date(r.created_at, 'localtime') = date('now', 'localtime')),0) AS sales_cents,
      COUNT(*) AS tickets, COALESCE(SUM(credit_cents), 0) AS credit_cents,
      (SELECT CAST(ROUND(COALESCE(SUM(i.unit_cost_cents * i.inventory_quantity), 0)) AS INTEGER) - COALESCE((SELECT ROUND(SUM(si.unit_cost_cents * ri.inventory_quantity)) FROM sale_return_items ri JOIN sale_items si ON si.id=ri.sale_item_id JOIN sale_returns sr ON sr.id=ri.return_id WHERE date(sr.created_at, 'localtime') = date('now', 'localtime')),0) FROM sale_items i JOIN sales s ON s.id = i.sale_id
       WHERE s.status = 'completed' AND date(s.created_at, 'localtime') = date('now', 'localtime')) AS cost_cents
     FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = date('now', 'localtime')`,
  );
  const inventory = await db.getFirstAsync<{ products: number; low_stock: number; stock_value_cents: number }>(
    `SELECT COUNT(*) AS products, SUM(CASE WHEN stock_quantity <= minimum_stock THEN 1 ELSE 0 END) AS low_stock,
      CAST(ROUND(COALESCE(SUM(stock_quantity * cost_cents), 0)) AS INTEGER) AS stock_value_cents FROM products WHERE is_active = 1`,
  );
  const purchases = await db.getFirstAsync<{ total_cents: number; count: number }>(
    `SELECT COALESCE(SUM(total_cents), 0) AS total_cents, COUNT(*) AS count FROM purchases WHERE date(created_at, 'localtime') = date('now', 'localtime')`,
  );
  const receivables = await db.getFirstAsync<{ balance_cents: number }>(
    `SELECT COALESCE((SELECT SUM(credit_cents) FROM sales WHERE status = 'completed'), 0) - COALESCE((SELECT SUM(r.credit_refund_cents) FROM sale_returns r JOIN sales s ON s.id=r.sale_id WHERE s.status='completed'), 0) - COALESCE((SELECT SUM(amount_cents) FROM credit_payments), 0) AS balance_cents`,
  );
  const payables = await db.getFirstAsync<{ balance_cents: number }>(
    'SELECT COALESCE((SELECT SUM(total_cents) FROM purchases WHERE is_legacy=0 AND supplier_id IS NOT NULL),0)-COALESCE((SELECT SUM(amount_cents) FROM supplier_payments),0) AS balance_cents',
  );
  return { salesCents: today?.sales_cents ?? 0, tickets: today?.tickets ?? 0, costCents: today?.cost_cents ?? 0, creditCents: today?.credit_cents ?? 0, products: inventory?.products ?? 0, lowStock: inventory?.low_stock ?? 0, stockValueCents: inventory?.stock_value_cents ?? 0, purchasesCents: purchases?.total_cents ?? 0, purchaseCount: purchases?.count ?? 0, receivablesCents: receivables?.balance_cents ?? 0, payablesCents: payables?.balance_cents ?? 0 };
}
