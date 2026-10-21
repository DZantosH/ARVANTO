import type { SQLiteDatabase } from 'expo-sqlite';

export type DashboardSummary = {
  salesCents: number;
  ticketCount: number;
  creditSalesCents: number;
  lowStockCount: number;
  cashOpen: boolean;
};

export async function getDashboardSummary(db: SQLiteDatabase): Promise<DashboardSummary> {
  const lowStock = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND minimum_stock > 0 AND stock_quantity <= minimum_stock',
  );
  const sales = await db.getFirstAsync<{ total: number; tickets: number }>(
    `SELECT COALESCE(SUM(total_cents), 0) AS total, COUNT(*) AS tickets FROM sales
     WHERE status = 'completed' AND date(created_at, 'localtime') = date('now', 'localtime')`,
  );
  const cashSession = await db.getFirstAsync<{ id: string }>('SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1');
  return {
    salesCents: sales?.total ?? 0,
    ticketCount: sales?.tickets ?? 0,
    creditSalesCents: 0,
    lowStockCount: lowStock?.count ?? 0,
    cashOpen: Boolean(cashSession),
  };
}
