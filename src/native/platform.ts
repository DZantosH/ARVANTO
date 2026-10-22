import { NativeModules } from 'react-native';
import { fromByteArray, toByteArray } from 'base64-js';
import type { WebSession } from '@/src/auth/api';

type Row = Record<string, string | number | null>;
type Result = { rows: Row[]; changes: number; lastInsertRowId: number };
type NativePlatform = {
  cacheDirectory: string; databaseDirectory: string;
  randomUUID(): string;
  digest(text: string): Promise<string>;
  randomBytes(size: number): Promise<string>;
  aes(data: string, key: string, decrypt: boolean): Promise<string>;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<void>;
  deviceSignIn(username: string, password: string): Promise<WebSession | null>;
  deviceSessionValid(token: string): Promise<boolean>;
  deviceSignOut(token: string): Promise<void>;
  readFile(uri: string): Promise<string>;
  writeFile(uri: string, data: string): Promise<void>;
  pickFile(types: string[]): Promise<{ canceled: boolean; assets: { uri: string; name: string; size: number }[] }>;
  shareFile(uri: string, mime: string, title: string): Promise<void>;
  print(html: string, toFile: boolean): Promise<{ uri: string }>;
  recognizeText(uri: string): Promise<{ text: string }>;
  pdfText(uri: string): Promise<string>;
  pdfPageCount(uri: string): Promise<number>;
  scanBarcode(): Promise<string | null>;
  openDatabase(name: string): Promise<string>;
  sql(name: string, sql: string, parameters: (string | number | null)[], script: boolean): Promise<Result>;
  closeDatabase(name: string): Promise<void>;
  deleteDatabase(name: string): Promise<void>;
  backupDatabase(source: string, destination: string): Promise<void>;
};

export const native = NativeModules.ArvantoPlatform as NativePlatform;
if (!native) throw new Error('Instala la APK de ARVANTO compilada con React Native.');

export const Paths = { cache: native.cacheDirectory };
export class File {
  readonly uri: string;
  constructor(...paths: string[]) { this.uri = paths.join('/').replace(/([^:])\/{2,}/g, '$1/'); }
  // Parent folders and overwrite are handled atomically by the native writer.
  create(_options?: { intermediates?: boolean; overwrite?: boolean }) {}
  async bytes() { return toByteArray(await native.readFile(this.uri)); }
  async write(data: Uint8Array) { await native.writeFile(this.uri, fromByteArray(data)); }
}
export const getItemAsync = (key: string) => native.secureGet(key);
export const setItemAsync = (key: string, value: string) => native.secureSet(key, value);
export const randomUUID = () => native.randomUUID();
export const CryptoDigestAlgorithm = { SHA256: 'SHA256' };
export const digestStringAsync = (_algorithm: string, value: string) => native.digest(value);
export const getRandomBytesAsync = async (size: number) => toByteArray(await native.randomBytes(size));
export const AESEncryptionKey = { import: async (key: string, _encoding: string) => key };
export const AESSealedData = { fromCombined: (data: Uint8Array) => data };
export const aesEncryptAsync = async (data: Uint8Array, key: string) => {
  const encrypted = await native.aes(fromByteArray(data), key, false);
  return { combined: async () => toByteArray(encrypted) };
};
export const aesDecryptAsync = async (data: Uint8Array, key: string) => toByteArray(await native.aes(fromByteArray(data), key, true));
export const getDocumentAsync = (options: { type: string | string[]; copyToCacheDirectory?: boolean; multiple?: boolean }) => native.pickFile(Array.isArray(options.type) ? options.type : [options.type]);
export const isAvailableAsync = async () => true;
export const shareAsync = (uri: string, options: { mimeType: string; dialogTitle: string; UTI?: string }) => native.shareFile(uri, options.mimeType, options.dialogTitle);
export const printAsync = async (options: { html: string; width?: number }) => { await native.print(options.html, false); };
export const printToFileAsync = (options: { html: string }) => native.print(options.html, true);
export const recognizeText = (uri: string) => native.recognizeText(uri);
export const extractText = (uri: string) => native.pdfText(uri);
export const getPageCount = (uri: string) => native.pdfPageCount(uri);
export const isAvailable = () => true;
