import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { defaultDatabaseDirectory, openDatabaseAsync, backupDatabaseAsync, deleteDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { migrateDatabase } from '@/src/database/migrations';

const KEY_ITEM = 'ferrepos.backup.key.v1';
const BACKUP_INFO_ITEM = 'ferrepos.backup.last.v1';
const LAST_RESTORE_ITEM = 'ferrepos.backup.restore.v1';
const PREFIX = new TextEncoder().encode('ARVANTO_BACKUP_V1\n');

export type BackupInfo = { createdAt: string; sizeBytes: number; fileName: string };

export async function getBackupKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_ITEM);
}

export async function createEncryptedBackup(db: SQLiteDatabase): Promise<{ uri: string; info: BackupInfo; key: string }> {
  const storedKey = await getBackupKey();
  const key = storedKey ?? bytesToHex(await Crypto.getRandomBytesAsync(32));
  if (!storedKey) await SecureStore.setItemAsync(KEY_ITEM, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  const keyObject = await Crypto.AESEncryptionKey.import(key, 'hex');
  const dbName = `ferrepos-export-${Date.now()}.db`;
  const copy = await openDatabaseAsync(dbName);
  try {
    await backupDatabaseAsync({ sourceDatabase: db, destDatabase: copy });
    const rawDatabase = await databaseFile(dbName).bytes();
    const encrypted = await Crypto.aesEncryptAsync(rawDatabase, keyObject);
    const combined = await encrypted.combined();
    const output = new Uint8Array(PREFIX.length + combined.length);
    output.set(PREFIX); output.set(combined, PREFIX.length);
    const createdAt = new Date().toISOString();
    const fileName = `FerrePOS-respaldo-${createdAt.slice(0, 10)}.fpbackup`;
    const outputFile = new File(Paths.cache, fileName);
    outputFile.create({ intermediates: true, overwrite: true });
    await outputFile.write(output);
    const info = { createdAt, sizeBytes: output.length, fileName };
    await SecureStore.setItemAsync(BACKUP_INFO_ITEM, JSON.stringify(info));
    return { uri: outputFile.uri, info, key };
  } finally {
    await copy.closeAsync();
    await deleteDatabaseAsync(dbName);
  }
}

export async function getLastBackupInfo(): Promise<BackupInfo | null> {
  const value = await SecureStore.getItemAsync(BACKUP_INFO_ITEM);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as BackupInfo;
    return parsed.createdAt && Number.isSafeInteger(parsed.sizeBytes) && parsed.fileName ? parsed : null;
  } catch { return null; }
}

export async function getLastRestoreAt(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_RESTORE_ITEM);
}

export async function restoreEncryptedBackup(db: SQLiteDatabase, file: File, suppliedKey: string): Promise<void> {
  const key = suppliedKey.replace(/\s/g, '') || await getBackupKey();
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) throw new Error('La clave del respaldo debe tener 64 caracteres hexadecimales.');
  const fileBytes = await file.bytes();
  if (fileBytes.length <= PREFIX.length || !startsWith(fileBytes, PREFIX)) throw new Error('El archivo no tiene el formato de respaldo de FerrePOS.');
  let decrypted: Uint8Array;
  try {
    const keyObject = await Crypto.AESEncryptionKey.import(key, 'hex');
    decrypted = await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(fileBytes.subarray(PREFIX.length)), keyObject);
  } catch { throw new Error('No se pudo descifrar el respaldo. Revisa la clave o el archivo.'); }

  const restoreName = `ferrepos-import-${Date.now()}.db`;
  const restoreFile = databaseFile(restoreName);
  restoreFile.create({ overwrite: true });
  await restoreFile.write(decrypted);
  const source = await openDatabaseAsync(restoreName);
  try {
    const integrity = await source.getFirstAsync<{ integrity_check: string }>('PRAGMA integrity_check');
    if (integrity?.integrity_check !== 'ok') throw new Error('La base de datos del respaldo está dañada.');
    const version = await source.getFirstAsync<{ version: number }>('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations');
    if (!version || version.version < 1 || version.version > 3) throw new Error('El respaldo pertenece a una versión incompatible de FerrePOS.');
    await migrateDatabase(source);

    const safetyCopyName = 'ferrepos-pre-restore.db';
    const safetyCopy = await openDatabaseAsync(safetyCopyName);
    try {
      await backupDatabaseAsync({ sourceDatabase: db, destDatabase: safetyCopy });
      try {
        await backupDatabaseAsync({ sourceDatabase: source, destDatabase: db });
      } catch (error) {
        await backupDatabaseAsync({ sourceDatabase: safetyCopy, destDatabase: db });
        throw error;
      }
    } finally { await safetyCopy.closeAsync(); }
    await SecureStore.setItemAsync(LAST_RESTORE_ITEM, new Date().toISOString());
  } finally {
    await source.closeAsync();
    await deleteDatabaseAsync(restoreName);
  }
}

function startsWith(source: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => source[index] === byte);
}

function databaseFile(name: string): File {
  const directory = String(defaultDatabaseDirectory).replace(/\/$/, '');
  const uri = directory.startsWith('file://') ? directory : `file://${directory.startsWith('/') ? '' : '/'}${directory}`;
  return new File(`${uri}/${name}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
