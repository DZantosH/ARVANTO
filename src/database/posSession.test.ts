jest.mock('@/src/native/platform', () => ({ randomUUID: () => 'test-id' }));
import { closeCashSession } from './posRepository';
import type { SQLiteDatabase } from '@/src/native/database';
const first = jest.fn(); const run = jest.fn();
const db = { getFirstAsync: first, runAsync: run, withExclusiveTransactionAsync: async (action: (db: unknown) => Promise<void>) => action(db) } as unknown as SQLiteDatabase;
beforeEach(() => {
  jest.resetAllMocks();
  first.mockResolvedValueOnce({ id: 'cash-1', opening_cash_cents: 1000 }).mockResolvedValueOnce({ amount: 500 }).mockResolvedValueOnce({ cash_in: 0, cash_out: 0 });
  run.mockResolvedValue({ changes: 1 });
});
test('ending the business day invalidates saved sessions in the cash transaction', async () => {
  await expect(closeCashSession(db, 1500, 'Operador', true)).resolves.toEqual({ expectedCashCents: 1500, differenceCents: 0 });
  expect(run.mock.calls[0][0]).toContain('UPDATE cash_sessions');
  expect(run.mock.calls[1][0]).toContain("last_end_reason='business_closed'");
});
test('changing shifts preserves the login when the business remains open', async () => {
  await closeCashSession(db, 1500, 'Operador', false);
  expect(run).toHaveBeenCalledTimes(1);
});
test('a failed cash closure does not invalidate the session', async () => {
  run.mockRejectedValueOnce(new Error('database error'));
  await expect(closeCashSession(db, 1500, 'Operador', true)).rejects.toThrow('database error');
  expect(run).toHaveBeenCalledTimes(1);
});
