jest.mock('react-native', () => ({ ActivityIndicator: 'ActivityIndicator', Text: 'Text', View: 'View' }));
jest.mock('./platform', () => ({ native: { sql: jest.fn(), openDatabase: jest.fn(), databaseDirectory: '/test' } }));

import { SQLiteDatabase } from './database';
import { native } from './platform';

const sql = jest.mocked(native.sql);
beforeEach(() => { sql.mockReset(); sql.mockResolvedValue({ rows: [], changes: 1, lastInsertRowId: 1 }); });

test('keeps concurrent writes outside the current transaction', async () => {
  const db = new SQLiteDatabase('test.db');
  let entered!: () => void; let release!: () => void;
  const transactionStarted = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const transaction = db.withExclusiveTransactionAsync(async txn => {
    await txn.runAsync('INSERT FIRST'); entered(); await held; await txn.runAsync('INSERT SECOND');
  });
  await transactionStarted;
  const outsider = db.runAsync('INSERT OUTSIDE');
  release(); await Promise.all([transaction, outsider]);
  expect(sql.mock.calls.map(call => call[1])).toEqual(['BEGIN IMMEDIATE', 'INSERT FIRST', 'INSERT SECOND', 'COMMIT', 'INSERT OUTSIDE']);
});

test('rolls back a failed transaction and allows subsequent operations', async () => {
  const db = new SQLiteDatabase('test.db');
  await expect(db.withExclusiveTransactionAsync(async txn => { await txn.runAsync('INSERT PARTIAL'); throw new Error('insufficient stock'); })).rejects.toThrow('insufficient stock');
  await db.runAsync('INSERT NEXT');
  expect(sql.mock.calls.map(call => call[1])).toEqual(['BEGIN IMMEDIATE', 'INSERT PARTIAL', 'ROLLBACK', 'INSERT NEXT']);
});

test('passes malicious input as a parameter and preserves numeric types', async () => {
  const db = new SQLiteDatabase('test.db'); const input = "' OR 1=1; DROP TABLE products;--";
  sql.mockResolvedValueOnce({ rows: [{ count: 0 }], changes: 0, lastInsertRowId: 0 });
  expect(await db.getFirstAsync('SELECT count(*) AS count FROM products WHERE name=? AND is_active=?', input, 1)).toEqual({ count: 0 });
  expect(sql).toHaveBeenCalledWith('test.db', 'SELECT count(*) AS count FROM products WHERE name=? AND is_active=?', [input, 1], false);
});
