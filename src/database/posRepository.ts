import * as Crypto from '@/src/native/platform';
import type { SQLiteDatabase } from '@/src/native/database';
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

export type SalesDocument = {
  id: string; document_number: number; kind: 'quote' | 'layaway'; status: 'open' | 'converted' | 'cancelled' | 'expired';
  customer_name: string; subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number; created_at: string; expires_at: string | null;
};

export type SaleReceipt = SaleSummary & {
  session_id: string;
  customer_name?: string | null;
  credit_cents?: number;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  items: { id: string; product_name: string; sku: string | null; quantity: number; returned_quantity: number; unit_name: string; unit_factor: number; unit_price_cents: number; line_total_cents: number }[];
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

export async function openCashSession(db: SQLiteDatabase, openingCashCents: number, createdBy = 'Administrador'): Promise<void> {
  if (!Number.isSafeInteger(openingCashCents) || openingCashCents < 0) throw new Error('El fondo inicial no es válido.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (existing) throw new Error('Ya existe un turno de caja abierto.');
    await txn.runAsync('INSERT INTO cash_sessions (id, opened_by, opening_cash_cents) VALUES (?, ?, ?)', Crypto.randomUUID(), createdBy, openingCashCents);
  });
}

export async function getCashOverview(db: SQLiteDatabase): Promise<CashOverview> {
  const session = await getOpenCashSession(db);
  if (!session) return { session: null, cashSalesCents: 0, cashInCents: 0, cashOutCents: 0, expectedCashCents: 0, byMethod: [], movements: [] };
  const paymentRows = await db.getAllAsync<{ method: 'cash' | 'card' | 'transfer'; amount_cents: number }>(
    `SELECT method, SUM(amount_cents) AS amount_cents FROM (
       SELECT method, amount_cents FROM payments WHERE session_id = ?
       UNION ALL SELECT method, amount_cents FROM credit_payments WHERE session_id = ?
     ) GROUP BY method`, session.id, session.id,
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

export async function addCashMovement(db: SQLiteDatabase, kind: 'in' | 'out', amountCents: number, reason: string, createdBy = 'Administrador'): Promise<void> {
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
      'INSERT INTO cash_movements (id, session_id, kind, amount_cents, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      Crypto.randomUUID(), session.id, kind, amountCents, normalizedReason, createdBy,
    );
  });
}

export async function closeCashSession(db: SQLiteDatabase, countedCashCents: number, closedBy = 'Administrador'): Promise<{ expectedCashCents: number; differenceCents: number }> {
  if (!Number.isSafeInteger(countedCashCents) || countedCashCents < 0) throw new Error('El efectivo contado no es válido.');
  let result = { expectedCashCents: 0, differenceCents: 0 };
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<CashSession>('SELECT * FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('No hay un turno abierto para cerrar.');
    const totals = await getCashTotals(txn, session);
    result = { expectedCashCents: totals.expectedCashCents, differenceCents: countedCashCents - totals.expectedCashCents };
    await txn.runAsync(
      `UPDATE cash_sessions SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       closed_by = ?, expected_cash_cents = ?, counted_cash_cents = ?, difference_cents = ? WHERE id = ? AND closed_at IS NULL`,
      closedBy, result.expectedCashCents, countedCashCents, result.differenceCents, session.id,
    );
  });
  return result;
}

export async function searchSaleProducts(db: SQLiteDatabase, query: string) {
  const term = `%${query.trim().replace(/[!%_]/g, '!$&')}%`;
  return db.getAllAsync<{ id: string; name: string; sku: string | null; barcode: string | null; price_cents: number; cost_cents: number; stock_quantity: number; unit_name: string; sale_unit_name: string; sale_unit_factor: number; sale_unit_price_cents: number | null }>(
    `SELECT p.id, p.name, p.sku, p.barcode, p.price_cents, p.cost_cents, p.unit_name, p.sale_unit_name, p.sale_unit_factor, p.sale_unit_price_cents,
            MAX(0, p.stock_quantity - COALESCE((SELECT SUM(i.inventory_quantity) FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE i.product_id=p.id AND d.kind='layaway' AND d.status='open'),0)) AS stock_quantity
     FROM products p
     WHERE p.is_active = 1 AND (p.name LIKE ? ESCAPE '!' OR COALESCE(p.sku, '') LIKE ? ESCAPE '!' OR COALESCE(p.barcode,'') LIKE ? ESCAPE '!')
     ORDER BY p.name COLLATE NOCASE LIMIT 50`, term, term, term,
  );
}

export async function completeSale(db: SQLiteDatabase, lines: CartLine[], payments: PaymentAmounts, customerId: string | null = null, creditCents = 0, createdBy = 'Administrador', adjustments: { discountCents?: number; taxCents?: number; documentId?: string | null } = {}): Promise<SaleReceipt> {
  const subtotalCents = getCartTotalCents(lines);
  const discountCents = adjustments.discountCents ?? 0;
  const taxCents = adjustments.taxCents ?? 0;
  if (![discountCents, taxCents].every((amount) => Number.isSafeInteger(amount) && amount >= 0) || discountCents > subtotalCents) throw new Error('Revisa el descuento y los impuestos.');
  const totalCents = subtotalCents - discountCents + taxCents;
  if (!lines.length || totalCents <= 0) throw new Error('Agrega productos con precio antes de cobrar.');
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > line.stock)) {
    throw new Error('Revisa las cantidades disponibles en el carrito.');
  }
  const paymentCheck = validatePayments(totalCents, payments, creditCents);
  if (!paymentCheck.valid) throw new Error('Los pagos deben cubrir el total y el efectivo recibido debe alcanzar.');

  const saleId = Crypto.randomUUID();
  let receipt: SaleReceipt | null = null;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const session = await txn.getFirstAsync<CashSession>('SELECT * FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre la caja antes de registrar una venta.');
    let documentKind: 'quote'|'layaway'|null = null;
    if (adjustments.documentId) {
      const document = await txn.getFirstAsync<{ kind: 'quote'|'layaway' }>('SELECT kind FROM sales_documents WHERE id=? AND status=\'open\'', adjustments.documentId);
      if (!document) throw new Error('El documento ya no está abierto; vuelve a cargarlo antes de cobrar.');
      documentKind = document.kind;
    }
    let customerName: string | null = null;
    if (creditCents > 0) {
      if (!customerId) throw new Error('Selecciona un cliente para registrar crédito.');
      const customer = await txn.getFirstAsync<{ name: string; credit_limit_cents: number }>('SELECT name, credit_limit_cents FROM customers WHERE id = ? AND is_active = 1', customerId);
      if (!customer) throw new Error('El cliente no existe o está inactivo.');
      const balance = await txn.getFirstAsync<{ amount: number }>(
        `SELECT COALESCE((SELECT SUM(credit_cents) FROM sales WHERE customer_id = ? AND status = 'completed'), 0) -
         COALESCE((SELECT SUM(r.credit_refund_cents) FROM sale_returns r JOIN sales s ON s.id=r.sale_id WHERE s.customer_id=?), 0) -
         COALESCE((SELECT SUM(amount_cents) FROM credit_payments WHERE customer_id = ?), 0) AS amount`, customerId, customerId, customerId,
      );
      if (customer.credit_limit_cents > 0 && (balance?.amount ?? 0) + creditCents > customer.credit_limit_cents) throw new Error('El crédito supera el límite disponible del cliente.');
      customerName = customer.name;
    }
    const ticket = await txn.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next FROM sales');
    const ticketNumber = ticket?.next ?? 1;
    const timestamp = new Date().toISOString();
    await txn.runAsync(
      'INSERT INTO sales (id, ticket_number, session_id, subtotal_cents, discount_cents, tax_cents, total_cents, change_cents, created_at, customer_id, credit_cents, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      saleId, ticketNumber, session.id, subtotalCents, discountCents, taxCents, totalCents, paymentCheck.changeCents, timestamp, customerId, creditCents, createdBy,
    );
    for (const line of lines) {
      const live = await txn.getFirstAsync<{ name: string; sku: string | null; price_cents: number; cost_cents: number; stock_quantity: number; is_active: number; unit_name: string; sale_unit_name: string; sale_unit_factor: number; sale_unit_price_cents: number | null }>(
        'SELECT name, sku, price_cents, cost_cents, stock_quantity, is_active, unit_name, sale_unit_name, sale_unit_factor, sale_unit_price_cents FROM products WHERE id = ?', line.productId,
      );
      if (!live || live.is_active !== 1) throw new Error(`El producto ${line.name} ya no está activo.`);
      const lineUnitName = line.unitName ?? live.unit_name;
      const factor = line.inventoryFactor ?? 1;
      const expectedPrice = lineUnitName === live.unit_name ? live.price_cents : live.sale_unit_price_cents ?? Math.round(live.price_cents * live.sale_unit_factor);
      if ((lineUnitName !== live.unit_name && lineUnitName !== live.sale_unit_name) || factor !== (lineUnitName === live.unit_name ? 1 : live.sale_unit_factor) || line.unitPriceCents !== expectedPrice) throw new Error(`La unidad o precio de ${live.name} cambió. Actualiza el carrito.`);
      const inventoryQuantity = line.quantity * factor;
      const reserved = await txn.getFirstAsync<{ quantity: number }>("SELECT COALESCE(SUM(i.inventory_quantity),0) AS quantity FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE i.product_id=? AND d.kind='layaway' AND d.status='open'", line.productId);
      const ownReserved = documentKind === 'layaway' && adjustments.documentId ? await txn.getFirstAsync<{ quantity: number }>("SELECT COALESCE(SUM(inventory_quantity),0) AS quantity FROM sales_document_items WHERE document_id=? AND product_id=?", adjustments.documentId, line.productId) : null;
      if (live.stock_quantity - (reserved?.quantity ?? 0) + (ownReserved?.quantity ?? 0) < inventoryQuantity) throw new Error(`Existencia insuficiente de ${live.name}; hay unidades apartadas para otros clientes.`);
      const lineTotal = Math.round(live.price_cents * line.quantity);
      if (lineTotal <= 0) throw new Error(`${live.name} no tiene precio de venta.`);
      await txn.runAsync(
        'INSERT INTO sale_items (id, sale_id, product_id, product_name, sku, quantity, inventory_quantity, unit_name, unit_factor, unit_price_cents, unit_cost_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        Crypto.randomUUID(), saleId, line.productId, live.name, live.sku, line.quantity, inventoryQuantity, lineUnitName, factor, line.unitPriceCents, live.cost_cents, lineTotal,
      );
      const update = await txn.runAsync(
        `UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND is_active = 1 AND stock_quantity >= ?`, inventoryQuantity, line.productId, inventoryQuantity,
      );
      if (update.changes !== 1) throw new Error(`No se pudo descontar existencia de ${live.name}.`);
      await txn.runAsync(
        `INSERT INTO inventory_movements (id, product_id, kind, quantity_delta, reference_id, reason, created_by)
         VALUES (?, ?, 'sale', ?, ?, 'Venta', ?)`, Crypto.randomUUID(), line.productId, -inventoryQuantity, saleId, createdBy,
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
    if (adjustments.documentId) {
      const converted = await txn.runAsync("UPDATE sales_documents SET status='converted' WHERE id=? AND status='open'", adjustments.documentId);
      if (converted.changes !== 1) throw new Error('El documento ya no está abierto; vuelve a cargarlo antes de cobrar.');
    }
    receipt = {
      id: saleId, ticket_number: ticketNumber, total_cents: totalCents, change_cents: paymentCheck.changeCents,
      created_at: timestamp, status: 'completed', session_id: session.id, customer_name: customerName, credit_cents: creditCents,
      subtotal_cents: subtotalCents, discount_cents: discountCents, tax_cents: taxCents,
      items: await txn.getAllAsync<SaleReceipt['items'][number]>('SELECT id,product_name,sku,quantity,unit_name,unit_factor,unit_price_cents,line_total_cents,0 AS returned_quantity FROM sale_items WHERE sale_id = ?', saleId),
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

export async function cancelSale(db: SQLiteDatabase, saleId: string, reason: string, createdBy = 'Administrador'): Promise<void> {
  const normalized = reason.trim();
  if (normalized.length < 3) throw new Error('Indica el motivo de cancelación.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    const sale = await txn.getFirstAsync<{ id: string; status: string; total_cents: number; session_id: string }>('SELECT id,status,total_cents,session_id FROM sales WHERE id = ?', saleId);
    if (!sale || sale.status !== 'completed') throw new Error('Solo se pueden cancelar ventas completadas.');
    const prior = await txn.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sale_returns WHERE sale_id = ?', saleId);
    if (prior?.count) throw new Error('Esta venta ya tiene devoluciones; registra la devolución completa de las partidas pendientes.');
    const items = await txn.getAllAsync<{ product_id: string; inventory_quantity: number; product_name: string }>('SELECT product_id,inventory_quantity,product_name FROM sale_items WHERE sale_id = ?', saleId);
    for (const item of items) {
      await txn.runAsync('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?', item.inventory_quantity, item.product_id);
      await txn.runAsync("INSERT INTO inventory_movements (id,product_id,kind,quantity_delta,reference_id,reason,created_by) VALUES (?,?,'adjustment',?,?,?,?)", Crypto.randomUUID(), item.product_id, item.inventory_quantity, saleId, `Cancelación: ${normalized}`, createdBy);
    }
    const refundId = Crypto.randomUUID();
    const session = await txn.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre la caja para registrar la cancelación y su reembolso.');
    const allocation = await allocateSaleRefund(txn, saleId, sale.total_cents);
    await txn.runAsync('INSERT INTO sale_returns (id,sale_id,session_id,reason,refund_cents,cash_refund_cents,card_refund_cents,transfer_refund_cents,credit_refund_cents,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)', refundId, saleId, session.id, normalized, sale.total_cents, allocation.cash, allocation.card, allocation.transfer, allocation.credit, createdBy);
    if (allocation.cash > 0) await txn.runAsync('INSERT INTO cash_movements (id,session_id,kind,amount_cents,reason,created_by) VALUES (?, ?, \'out\', ?, ?, ?)', Crypto.randomUUID(), session.id, allocation.cash, `Reembolso cancelación ticket: ${normalized}`, createdBy);
    await txn.runAsync("UPDATE sales SET status='cancelled',cancelled_by=?,cancel_reason=? WHERE id=? AND status='completed'", createdBy, normalized, saleId);
  });
}

export async function returnSaleItems(db: SQLiteDatabase, saleId: string, lines: { saleItemId: string; quantity: number }[], reason: string, createdBy = 'Administrador'): Promise<number> {
  const normalized = reason.trim();
  if (!lines.length || normalized.length < 3) throw new Error('Agrega partidas y el motivo de devolución.');
  let refundTotal = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const sale = await txn.getFirstAsync<{ id: string; status: string; session_id: string; subtotal_cents: number; total_cents: number }>('SELECT id,status,session_id,subtotal_cents,total_cents FROM sales WHERE id = ?', saleId);
    if (!sale || sale.status !== 'completed') throw new Error('La venta no está disponible para devolución.');
    const session = await txn.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
    if (!session) throw new Error('Abre la caja para registrar la devolución.');
    const returnId = Crypto.randomUUID();
    const previous = await txn.getFirstAsync<{ amount: number }>('SELECT COALESCE(SUM(refund_cents),0) AS amount FROM sale_returns WHERE sale_id=?', saleId);
    const maxRefund = Math.max(0, sale.total_cents - (previous?.amount ?? 0));
    for (const line of lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('La cantidad devuelta no es válida.');
      const item = await txn.getFirstAsync<{ product_id: string; quantity: number; unit_price_cents: number; unit_factor: number; id: string }>('SELECT id,product_id,quantity,unit_price_cents,unit_factor FROM sale_items WHERE id = ? AND sale_id = ?', line.saleItemId, saleId);
      if (!item) throw new Error('Una partida ya no pertenece a esta venta.');
      const returned = await txn.getFirstAsync<{ quantity: number }>('SELECT COALESCE(SUM(ri.quantity),0) AS quantity FROM sale_return_items ri JOIN sale_returns r ON r.id = ri.return_id WHERE ri.sale_item_id = ?', line.saleItemId);
      if ((returned?.quantity ?? 0) + line.quantity > item.quantity) throw new Error('La cantidad excede lo pendiente por devolver.');
      const refund = Math.min(maxRefund - refundTotal, sale.subtotal_cents > 0 ? Math.round(item.unit_price_cents * line.quantity * sale.total_cents / sale.subtotal_cents) : 0);
      refundTotal += refund;
      const inventoryQuantity = line.quantity * item.unit_factor;
      await txn.runAsync('INSERT INTO sale_return_items (id,return_id,sale_item_id,product_id,quantity,inventory_quantity,refund_cents) VALUES (?,?,?,?,?,?,?)', Crypto.randomUUID(), returnId, line.saleItemId, item.product_id, line.quantity, inventoryQuantity, refund);
      await txn.runAsync('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?', inventoryQuantity, item.product_id);
      await txn.runAsync("INSERT INTO inventory_movements (id,product_id,kind,quantity_delta,reference_id,reason,created_by) VALUES (?,?,'adjustment',?,?,?,?)", Crypto.randomUUID(), item.product_id, inventoryQuantity, saleId, `Devolución: ${normalized}`, createdBy);
    }
    const allocation = await allocateSaleRefund(txn, saleId, refundTotal);
    await txn.runAsync('INSERT INTO sale_returns (id,sale_id,session_id,reason,refund_cents,cash_refund_cents,card_refund_cents,transfer_refund_cents,credit_refund_cents,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)', returnId, saleId, session.id, normalized, refundTotal, allocation.cash, allocation.card, allocation.transfer, allocation.credit, createdBy);
    if (allocation.cash > 0) await txn.runAsync('INSERT INTO cash_movements (id,session_id,kind,amount_cents,reason,created_by) VALUES (?, ?, \'out\', ?, ?, ?)', Crypto.randomUUID(), session.id, allocation.cash, `Reembolso devolución: ${normalized}`, createdBy);
  });
  return refundTotal;
}

async function allocateSaleRefund(db: SQLiteDatabase, saleId: string, amount: number): Promise<{ cash: number; card: number; transfer: number; credit: number }> {
  const original = await db.getAllAsync<{ method: 'cash'|'card'|'transfer'; amount_cents: number }>('SELECT method,amount_cents FROM payments WHERE sale_id=?', saleId);
  const sale = await db.getFirstAsync<{ credit_cents: number }>('SELECT credit_cents FROM sales WHERE id=?', saleId);
  const prior = await db.getFirstAsync<{ cash: number; card: number; transfer: number; credit: number }>(
    'SELECT COALESCE(SUM(cash_refund_cents),0) cash,COALESCE(SUM(card_refund_cents),0) card,COALESCE(SUM(transfer_refund_cents),0) transfer,COALESCE(SUM(credit_refund_cents),0) credit FROM sale_returns WHERE sale_id=?', saleId,
  );
  const available = {
    cash: Math.max(0, (original.find((p) => p.method === 'cash')?.amount_cents ?? 0) - (prior?.cash ?? 0)),
    card: Math.max(0, (original.find((p) => p.method === 'card')?.amount_cents ?? 0) - (prior?.card ?? 0)),
    transfer: Math.max(0, (original.find((p) => p.method === 'transfer')?.amount_cents ?? 0) - (prior?.transfer ?? 0)),
    credit: Math.max(0, (sale?.credit_cents ?? 0) - (prior?.credit ?? 0)),
  };
  const availableTotal = Object.values(available).reduce((sum, value) => sum + value, 0);
  const target = Math.min(amount, availableTotal);
  let left = target;
  const allocation = { cash: 0, card: 0, transfer: 0, credit: 0 };
  const total = Math.max(1, availableTotal);
  (['cash', 'card', 'transfer', 'credit'] as const).forEach((method, index, methods) => {
    const share = index === methods.length - 1 ? left : Math.min(available[method], Math.round(target * available[method] / total));
    allocation[method] = Math.min(available[method], Math.max(0, share));
    left -= allocation[method];
  });
  if (left > 0) for (const method of ['cash', 'card', 'transfer', 'credit'] as const) {
    const extra = Math.min(left, available[method] - allocation[method]);
    allocation[method] += extra;
    left -= extra;
  }
  return allocation;
}

export async function getOpenSalesDocuments(db: SQLiteDatabase): Promise<SalesDocument[]> {
  await db.runAsync("UPDATE sales_documents SET status = 'expired' WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  return db.getAllAsync<SalesDocument>("SELECT id,document_number,kind,status,customer_name,subtotal_cents,discount_cents,tax_cents,total_cents,created_at,expires_at FROM sales_documents WHERE status='open' ORDER BY created_at DESC LIMIT 50");
}

export async function saveSalesDocument(db: SQLiteDatabase, kind: 'quote'|'layaway', lines: CartLine[], totals: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }, customerName: string, customerId: string | null, createdBy = 'Administrador', note = ''): Promise<void> {
  if (!lines.length || totals.totalCents < 0 || discountInvalid(totals)) throw new Error('Revisa el carrito y sus importes.');
  if (kind === 'layaway' && lines.some((line) => line.quantity > line.stock)) throw new Error('No hay existencia suficiente para apartar esos productos.');
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (kind === 'layaway') {
      for (const line of lines) {
        const live = await txn.getFirstAsync<{ stock_quantity: number }>('SELECT stock_quantity FROM products WHERE id = ? AND is_active = 1', line.productId);
        const reserved = await txn.getFirstAsync<{ quantity: number }>("SELECT COALESCE(SUM(i.inventory_quantity),0) AS quantity FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE i.product_id=? AND d.kind='layaway' AND d.status='open'", line.productId);
        const inventoryQuantity = line.quantity * (line.inventoryFactor ?? 1);
        if (!live || live.stock_quantity - (reserved?.quantity ?? 0) < inventoryQuantity) throw new Error(`Existencia insuficiente para apartar ${line.name}.`);
      }
    }
    const next = await txn.getFirstAsync<{ next: number }>('SELECT COALESCE(MAX(document_number),0)+1 AS next FROM sales_documents');
    const id = Crypto.randomUUID();
    const expires = kind === 'quote' ? new Date(Date.now() + 30 * 86400000).toISOString() : null;
    await txn.runAsync('INSERT INTO sales_documents (id,document_number,kind,customer_id,customer_name,subtotal_cents,discount_cents,tax_cents,total_cents,expires_at,note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', id, next?.next ?? 1, kind, customerId, customerName.trim(), totals.subtotalCents, totals.discountCents, totals.taxCents, totals.totalCents, expires, note.trim(), createdBy);
    for (const line of lines) {
      const factor = line.inventoryFactor ?? 1;
      await txn.runAsync('INSERT INTO sales_document_items (id,document_id,product_id,product_name,sku,quantity,unit_name,unit_factor,inventory_quantity,unit_price_cents,line_total_cents) VALUES (?,?,?,?,?,?,?,?,?,?,?)', Crypto.randomUUID(), id, line.productId, line.name, line.sku, line.quantity, line.unitName ?? 'pieza', factor, line.quantity * factor, line.unitPriceCents, Math.round(line.unitPriceCents * line.quantity));
    }
  });
}

export async function loadSalesDocument(db: SQLiteDatabase, id: string): Promise<{ document: SalesDocument; lines: CartLine[] } | null> {
  const document = await db.getFirstAsync<SalesDocument>('SELECT id,document_number,kind,status,customer_name,subtotal_cents,discount_cents,tax_cents,total_cents,created_at,expires_at FROM sales_documents WHERE id=? AND status=\'open\'', id);
  if (!document) return null;
  const items = await db.getAllAsync<{ product_id: string; product_name: string; sku: string | null; quantity: number; unit_name: string; unit_factor: number; unit_price_cents: number; stock: number; cost: number }>(
    `SELECT i.product_id,i.product_name,i.sku,i.quantity,i.unit_name,i.unit_factor,i.unit_price_cents,
      MAX(0,(p.stock_quantity-COALESCE((SELECT SUM(ri.inventory_quantity) FROM sales_document_items ri JOIN sales_documents rd ON rd.id=ri.document_id WHERE ri.product_id=p.id AND rd.kind='layaway' AND rd.status='open'),0)+CASE WHEN d.kind='layaway' THEN i.inventory_quantity ELSE 0 END)/i.unit_factor) AS stock,
      p.cost_cents AS cost FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id JOIN products p ON p.id=i.product_id WHERE i.document_id=?`, id,
  );
  return { document, lines: items.map((i) => ({ productId: i.product_id, name: i.product_name, sku: i.sku, quantity: i.quantity, unitPriceCents: i.unit_price_cents, unitCostCents: i.cost, stock: i.stock, unitName: i.unit_name, inventoryFactor: i.unit_factor })) };
}

export async function cancelSalesDocument(db: SQLiteDatabase, id: string, cancelledBy = 'Administrador'): Promise<void> {
  await db.runAsync("UPDATE sales_documents SET status='cancelled',cancelled_by=?,cancel_reason='Cancelación manual' WHERE id=? AND status='open'", cancelledBy, id);
}

function discountInvalid(totals: { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number }) {
  return ![totals.subtotalCents, totals.discountCents, totals.taxCents, totals.totalCents].every((n) => Number.isSafeInteger(n) && n >= 0) || totals.discountCents > totals.subtotalCents || totals.subtotalCents - totals.discountCents + totals.taxCents !== totals.totalCents;
}

export async function getSaleReceipt(db: SQLiteDatabase, id: string): Promise<SaleReceipt | null> {
  const sale = await db.getFirstAsync<SaleReceipt>(
    'SELECT s.id, s.ticket_number, s.session_id, s.subtotal_cents, s.discount_cents, s.tax_cents, s.total_cents, s.change_cents, s.created_at, s.status, s.credit_cents, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?', id,
  );
  if (!sale) return null;
  sale.items = await db.getAllAsync<SaleReceipt['items'][number]>(
    `SELECT i.id,i.product_name,i.sku,i.quantity,i.unit_name,i.unit_factor,i.unit_price_cents,i.line_total_cents,
     COALESCE((SELECT SUM(ri.quantity) FROM sale_return_items ri JOIN sale_returns r ON r.id=ri.return_id WHERE ri.sale_item_id=i.id),0) AS returned_quantity
     FROM sale_items i WHERE i.sale_id = ?`, id,
  );
  sale.payments = await db.getAllAsync<SaleReceipt['payments'][number]>(
    'SELECT method, amount_cents FROM payments WHERE sale_id = ?', id,
  );
  return sale;
}

async function getCashTotals(db: SQLiteDatabase, session: CashSession): Promise<{ expectedCashCents: number }> {
  const payments = await db.getFirstAsync<{ amount: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS amount FROM (
       SELECT amount_cents FROM payments WHERE session_id = ? AND method = 'cash'
       UNION ALL SELECT amount_cents FROM credit_payments WHERE session_id = ? AND method = 'cash'
     )`, session.id, session.id,
  );
  const movements = await db.getFirstAsync<{ cash_in: number; cash_out: number }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'in' THEN amount_cents ELSE 0 END), 0) AS cash_in,
            COALESCE(SUM(CASE WHEN kind = 'out' THEN amount_cents ELSE 0 END), 0) AS cash_out
     FROM cash_movements WHERE session_id = ?`, session.id,
  );
  return { expectedCashCents: getExpectedCashCents(session.opening_cash_cents, payments?.amount ?? 0, movements?.cash_in ?? 0, movements?.cash_out ?? 0) };
}
