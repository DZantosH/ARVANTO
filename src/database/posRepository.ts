import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCartTotalCents, getExpectedCashCents, validatePayments, type CartLine, type PaymentAmounts } from '@/src/domain/sales';

export type CashSession = {
  id: string;
  opened_at: string;
  opened_by: string;
  opening_cash_cents: number;
  closed_at: string | null;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  difference_cents: number | null;
};

export type SaleSummary = {
  id: string;
  ticket_number: number;
  total_cents: number;
  change_cents: number;
  created_at: string;
  status: 'completed' | 'cancelled';
};

export type SaleReceipt = SaleSummary & {
  session_id: string;
  items: { product_name: string; sku: string | null; quantity: number; unit_price_cents: number; line_total_cents: number }[];
  payments: { method: 'cash' | 'card' | 'transfer'; amount_cents: number }[];
};

export type CashOverview = {
  session: CashSession | null;
  cashSalesCents: number;
  cashInCents: number;
  cashOutCents: number;
  expectedCashCents: number;
  byMethod: { method: 'cash' | 'card' | 'transfer'; amount_cents: number }[];
  movements: { id: string; kind: 'in' | 'out'; amount_cents: number; reason: string; created_at: string }[];
};

export async function getOpenCashSession(db: SQLiteDatabase): Promise<CashSession | null> {
  return db.getFirstAsync<CashSession>(
    `SELECT id, opened_at, opened_by, opening_cash_cents, closed_at, expected_cash_cents, counted_cash_cents, difference_cents
     FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`,
  );
}

export async function openCashSession(db: SQLiteDatabase, openingCashCents: number): Promise<void> {
  if (!Number.isSafeInteger(openingCashCents) || openingCashCents < 0) throw new Error('El fondo inicial no es válido.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (existing) throw new Error('Ya existe un turno de caja abierto.');
    await txn.runAsync('INSERT INTO cash_sessions (id, opening_cash_cents) VALUES (?, ?)', Crypto.randomUUID(), openingCashCents);
  });
}

export async function getCashOverview(db: SQLiteDatabase): Promise<CashOverview> {
  const session = await getOpenCashSession(db);
  if (!session) return { session: null, cashSalesCents: 0, cashInCents: 0, cashOutCents: 0, expectedCashCents: 0, byMethod: [], movements: [] };
  const paymentRows = await db.getAllAsync<{ method: 'cash' | 'card' | 'transfer'; amount_cents: number }>(
    'SELECT method, SUM(amount_cents) AS amount_cents FROM payments WHERE session_id = ? GROUP BY method', session.id,
  );
  const movements = await db.getAllAsync<{ id: string; kind: 'in' | 'out'; amount_cents: number; reason: string; created_at: string }>(
    'SELECT id, kind, amount_cents, reason, created_at FROM cash_movements WHERE session_id = ? ORDER BY created_at DESC LIMIT 30', session.id,
  );
  const cashSalesCents = paymentRows.find((row) => row.method === 'cash')?.amount_cents ?? 0;
  const cashInCents = movements.reduce((sum, row) => sum + (row.kind === 'in' ? row.amount_cents : 0), 0);
  const cashOutCents = movements.reduce((sum, row) => sum + (row.kind === 'out' ? row.amount_cents : 0), 0);
  // Include all movements, not only the 30 shown in the activity list.
  const totals = await db.getFirstAsync<{ cash_in: number; cash_out: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount_cents ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN kind = 'out' THEN amount_cents ELSE 0 END), 0) AS cash_out
     FROM cash_movements WHERE session_id = ?`, session.id,
  );
  const allCashIn = totals?.cash_in ?? cashInCents;
  const allCashOut = totals?.cash_out ?? cashOutCents;
  return {
    session,
    cashSalesCents,
    cashInCents: allCashIn,
    cashOutCents: allCashOut,
    expectedCashCents: getExpectedCashCents(session.opening_cash_cents, cashSalesCents, allCashIn, allCashOut),
    byMethod: paymentRows,
    movements,
  };
}

export async function addCashMovement(db: SQLiteDatabase, kind: 'in' | 'out', amountCents: number, reason: string): Promise<void> {
  const normalizedReason = reason.trim();
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('El importe debe ser mayor a cero.');
  if (normalizedReason.length < 3 || normalizedReason.length > 160) throw new Error('Escribe un motivo de 3 a 160 caracteres.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<CashSession>('SELECT * FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre la caja para registrar movimientos.');
    if (kind === 'out') {
      const totals = await getCashTotals(txn, session);
      if (amountCents > totals.expectedCashCents) throw new Error('El retiro supera el efectivo esperado en caja.');
    }
    await txn.runAsync(
      'INSERT INTO cash_movements (id, session_id, kind, amount_cents, reason) VALUES (?, ?, ?, ?, ?)',
      Crypto.randomUUID(), session.id, kind, amountCents, normalizedReason,
    );
  });
}

export async function closeCashSession(db: SQLiteDatabase, countedCashCents: number): Promise<{ expectedCashCents: number; differenceCents: number }> {
  if (!Number.isSafeInteger(countedCashCents) || countedCashCents < 0) throw new Error('El efectivo contado no es válido.');
  let result = { expectedCashCents: 0, differenceCents: 0 };
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<CashSession>('SELECT * FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('No hay un turno abierto para cerrar.');
    const totals = await getCashTotals(txn, session);
    result = { expectedCashCents: totals.expectedCashCents, differenceCents: countedCashCents - totals.expectedCashCents };
    await txn.runAsync(
      `UPDATE cash_sessions SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       closed_by = 'Administrador', expected_cash_cents = ?, counted_cash_cents = ?, difference_cents = ? WHERE id = ? AND closed_at IS NULL`,
      result.expectedCashCents, countedCashCents, result.differenceCents, session.id,
    );
  });
  return result;
}

export async function searchSaleProducts(db: SQLiteDatabase, query: string) {
  const term = `%${query.trim().replace(/[!%_]/g, '!$&')}%`;
  return db.getAllAsync<{ id: string; name: string; sku: string | null; price_cents: number; cost_cents: number; stock_quantity: number }>(
    `SELECT id, name, sku, price_cents, cost_cents, stock_quantity FROM products
     WHERE is_active = 1 AND (name LIKE ? ESCAPE '!' OR COALESCE(sku, '') LIKE ? ESCAPE '!')
     ORDER BY name COLLATE NOCASE LIMIT 50`, term, term,
  );
}

export async function completeSale(db: SQLiteDatabase, lines: CartLine[], payments: PaymentAmounts): Promise<SaleReceipt> {
  const totalCents = getCartTotalCents(lines);
  if (!lines.length || totalCents <= 0) throw new Error('Agrega productos con precio antes de cobrar.');
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > line.stock)) {
    throw new Error('Revisa las cantidades disponibles en el carrito.');
  }
  const paymentCheck = validatePayments(totalCents, payments);
  if (!paymentCheck.valid) throw new Error('Los pagos deben cubrir el total y el efectivo recibido debe alcanzar.');

  const saleId = Crypto.randomUUID();
  let receipt: SaleReceipt | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<CashSession>('SELECT * FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre la caja antes de registrar una venta.');
    const ticket = await txn.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next FROM sales');
    const ticketNumber = ticket?.next ?? 1;
    const timestamp = new Date().toISOString();
    await txn.runAsync(
      'INSERT INTO sales (id, ticket_number, session_id, subtotal_cents, total_cents, change_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      saleId, ticketNumber, session.id, totalCents, totalCents, paymentCheck.changeCents, timestamp,
    );
    for (const line of lines) {
      const live = await txn.getFirstAsync<{ name: string; sku: string | null; price_cents: number; cost_cents: number; stock_quantity: number; is_active: number }>(
        'SELECT name, sku, price_cents, cost_cents, stock_quantity, is_active FROM products WHERE id = ?', line.productId,
      );
      if (!live || live.is_active !== 1) throw new Error(`El producto ${line.name} ya no está activo.`);
      if (live.stock_quantity < line.quantity) throw new Error(`Existencia insuficiente de ${live.name}.`);
      if (live.price_cents !== line.unitPriceCents) throw new Error(`El precio de ${live.name} cambió. Actualiza el carrito.`);
      const lineTotal = Math.round(live.price_cents * line.quantity);
      if (lineTotal <= 0) throw new Error(`${live.name} no tiene precio de venta.`);
      await txn.runAsync(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, quantity, unit_price_cents, unit_cost_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        Crypto.randomUUID(), saleId, line.productId, live.name, live.sku, line.quantity, live.price_cents, live.cost_cents, lineTotal,
      );
      const update = await txn.runAsync(
        `UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND is_active = 1 AND stock_quantity >= ?`, line.quantity, line.productId, line.quantity,
      );
      if (update.changes !== 1) throw new Error(`No se pudo descontar existencia de ${live.name}.`);
      await txn.runAsync(
        `INSERT INTO inventory_movements (id, product_id, kind, quantity_delta, reference_id, reason)
         VALUES (?, ?, 'sale', ?, ?, 'Venta')`, Crypto.randomUUID(), line.productId, -line.quantity, saleId,
      );
    }
    const paymentRows = [
      ['cash', payments.cashCents], ['card', payments.cardCents], ['transfer', payments.transferCents],
    ] as const;
    for (const [method, amount] of paymentRows) {
      if (amount > 0) await txn.runAsync(
        'INSERT INTO payments (id, sale_id, session_id, method, amount_cents) VALUES (?, ?, ?, ?, ?)',
        Crypto.randomUUID(), saleId, session.id, method, amount,
      );
    }
    receipt = {
      id: saleId, ticket_number: ticketNumber, total_cents: totalCents, change_cents: paymentCheck.changeCents,
      created_at: timestamp, status: 'completed', session_id: session.id,
      items: lines.map((line) => ({ product_name: line.name, sku: line.sku, quantity: line.quantity, unit_price_cents: line.unitPriceCents, line_total_cents: Math.round(line.unitPriceCents * line.quantity) })),
      payments: paymentRows.filter(([, amount]) => amount > 0).map(([method, amount]) => ({ method, amount_cents: amount })),
    };
  });
  if (!receipt) throw new Error('No se pudo completar la venta.');
  return receipt;
}

export async function getRecentSales(db: SQLiteDatabase): Promise<SaleSummary[]> {
  return db.getAllAsync<SaleSummary>(
    'SELECT id, ticket_number, total_cents, change_cents, created_at, status FROM sales ORDER BY created_at DESC LIMIT 30',
  );
}

export async function getSaleReceipt(db: SQLiteDatabase, id: string): Promise<SaleReceipt | null> {
  const sale = await db.getFirstAsync<SaleReceipt>(
    'SELECT id, ticket_number, session_id, total_cents, change_cents, created_at, status FROM sales WHERE id = ?', id,
  );
  if (!sale) return null;
  sale.items = await db.getAllAsync<SaleReceipt['items'][number]>(
    'SELECT product_name, sku, quantity, unit_price_cents, line_total_cents FROM sale_items WHERE sale_id = ?', id,
  );
  sale.payments = await db.getAllAsync<SaleReceipt['payments'][number]>(
    'SELECT method, amount_cents FROM payments WHERE sale_id = ?', id,
  );
  return sale;
}

async function getCashTotals(db: SQLiteDatabase, session: CashSession): Promise<{ expectedCashCents: number }> {
  const payments = await db.getFirstAsync<{ amount: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS amount FROM payments WHERE session_id = ? AND method = 'cash'`, session.id,
  );
  const movements = await db.getFirstAsync<{ cash_in: number; cash_out: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount_cents ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN kind = 'out' THEN amount_cents ELSE 0 END), 0) AS cash_out
     FROM cash_movements WHERE session_id = ?`, session.id,
  );
  return { expectedCashCents: getExpectedCashCents(session.opening_cash_cents, payments?.amount ?? 0, movements?.cash_in ?? 0, movements?.cash_out ?? 0) };
}
