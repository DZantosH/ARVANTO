import type { SQLiteDatabase } from 'expo-sqlite';

export type DashboardSummary = {
  salesCents: number;
  ticketCount: number;
  creditSalesCents: number;
  lowStockCount: number;
};

export async function getDashboardSummary(db: SQLiteDatabase): Promise<DashboardSummary> {
  const lowStock = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM products WHERE is_active = 1 AND minimum_stock > 0 AND stock_quantity <= minimum_stock',
  );
  // Sales tables are introduced with the POS phase; the initial migration has no sales yet.
  return { salesCents: 0, ticketCount: 0, creditSalesCents: 0, lowStockCount: lowStock?.count ?? 0 };
}
