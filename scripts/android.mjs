import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Android', 'Sdk');
if (!existsSync(sdk)) throw new Error('Configura ANDROID_HOME con la ubicación de tu Android SDK.');
const keystore = join('android', 'app', 'debug.keystore');
if (!existsSync(keystore)) {
  const generated = spawnSync('keytool', ['-genkeypair', '-storetype', 'JKS', '-keystore', keystore, '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US'], { stdio: 'inherit' });
  if (generated.status !== 0) process.exit(generated.status ?? 1);
}
const mode = process.argv[2] === 'release' ? 'release' : 'debug';
const result = spawnSync('npx', ['react-native', 'run-android', '--mode', mode, ...process.argv.slice(3)], { stdio: 'inherit', env: { ...process.env, ANDROID_HOME: sdk } });
process.exit(result.status ?? 1);
