import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { native } from './platform';

let pending: Promise<unknown> = Promise.resolve();
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = pending.then(action, action);
  pending = result.catch(() => undefined);
  return result;
}

export class SQLiteDatabase {
  constructor(readonly name: string, private readonly transaction = false) {}
  private schedule<T>(action: () => Promise<T>) { return this.transaction ? action() : serial(action); }
  getAllAsync<T>(sql: string, ...args: (string | number | null)[]): Promise<T[]> {
    return this.schedule(async () => (await native.sql(this.name, sql, args, false)).rows as T[]);
  }
  async getFirstAsync<T>(sql: string, ...args: (string | number | null)[]): Promise<T | null> { return (await this.getAllAsync<T>(sql, ...args))[0] ?? null; }
  runAsync(sql: string, ...args: (string | number | null)[]) { return this.schedule(() => native.sql(this.name, sql, args, false)); }
  async execAsync(sql: string) { await this.schedule(() => native.sql(this.name, sql, [], true)); }
  withExclusiveTransactionAsync(action: (transaction: SQLiteDatabase) => Promise<void>) {
    return this.schedule(async () => {
      const transaction = new SQLiteDatabase(this.name, true);
      await transaction.execAsync('BEGIN IMMEDIATE');
      try { await action(transaction); await transaction.execAsync('COMMIT'); }
      catch (error) { await transaction.execAsync('ROLLBACK'); throw error; }
    });
  }
  closeAsync() { return this.schedule(() => native.closeDatabase(this.name)); }
}
export const defaultDatabaseDirectory = native.databaseDirectory;
export const openDatabaseAsync = async (name: string) => { await serial(() => native.openDatabase(name)); return new SQLiteDatabase(name); };
export const deleteDatabaseAsync = (name: string) => serial(() => native.deleteDatabase(name));
export const backupDatabaseAsync = (options: { sourceDatabase: SQLiteDatabase; destDatabase: SQLiteDatabase }) => serial(() => native.backupDatabase(options.sourceDatabase.name, options.destDatabase.name));
const DatabaseContext = createContext<SQLiteDatabase | null>(null);
export function SQLiteProvider({ databaseName, onInit, children }: { databaseName: string; onInit: (db: SQLiteDatabase) => Promise<void>; children: ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void openDatabaseAsync(databaseName).then(async database => { await onInit(database); if (active) setDb(database); }).catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [databaseName, onInit]);
  if (!db) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>{error ? <Text accessibilityRole="alert">No se pudo abrir la base local: {error}</Text> : <ActivityIndicator />}</View>;
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}
export function useSQLiteContext() { const db = useContext(DatabaseContext); if (!db) throw new Error('Base local no disponible.'); return db; }
