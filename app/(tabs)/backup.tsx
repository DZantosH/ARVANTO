import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { theme } from '@/constants/Theme';
import { createEncryptedBackup, getBackupKey, getLastBackupInfo, getLastRestoreAt, restoreEncryptedBackup, type BackupInfo } from '@/src/infrastructure/backup';

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [lastBackup, setLastBackup] = useState<BackupInfo | null>(null);
  const [lastRestore, setLastRestore] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const [backup, restoreAt, savedKey] = await Promise.all([getLastBackupInfo(), getLastRestoreAt(), getBackupKey()]);
    setLastBackup(backup); setLastRestore(restoreAt); if (savedKey) setKey(savedKey);
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const exportBackup = async () => {
    setBusy(true); setMessage('');
    try {
      const result = await createEncryptedBackup(db);
      setKey(result.key); setKeyVisible(true); setLastBackup(result.info);
      if (!await Sharing.isAvailableAsync()) throw new Error('Compartir archivos no está disponible en este dispositivo.');
      await Sharing.shareAsync(result.uri, { dialogTitle: 'Guardar o compartir respaldo FerrePOS', mimeType: 'application/octet-stream', UTI: 'public.data' });
      setMessage(`Respaldo cifrado creado · ${(result.info.sizeBytes / 1024).toFixed(1)} KB`);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'No se pudo crear el respaldo.'); }
    finally { setBusy(false); }
  };

  const chooseRestore = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      Alert.alert('Reemplazar datos locales', 'Se comprobará el respaldo, se guardará una copia local del estado actual y luego se reemplazarán los datos de esta app. Esta acción no se puede deshacer desde la pantalla.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Validar y restaurar', style: 'destructive', onPress: () => void restore(new File(asset.uri)) },
      ]);
    } catch { setMessage('No se pudo abrir el selector de archivos.'); }
  };

  const restore = async (file: File) => {
    setBusy(true); setMessage('');
    try {
      await restoreEncryptedBackup(db, file, keyInput);
      setKeyInput(''); setMessage('El respaldo se validó y los datos locales se restauraron. Se guardó una copia previa dentro de la app.');
      await refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'No se pudo restaurar el respaldo.'); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>TUS DATOS LOCALES</Text><Text style={styles.title}>Respaldos</Text>
      <View style={styles.infoCard}><View style={styles.infoIcon}><Text style={styles.infoIconText}>↥</Text></View><Text style={styles.infoTitle}>Copia cifrada</Text><Text style={styles.infoBody}>El respaldo incluye productos, ventas y caja en un archivo cifrado AES-GCM. Guárdalo en un lugar seguro. La clave de 64 caracteres es necesaria para restaurar y debe conservarse aparte del archivo.</Text>
        <Pressable disabled={busy} onPress={() => void exportBackup()} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Preparando…' : 'Crear respaldo y compartir'}</Text></Pressable>
      </View>

      <View style={styles.statusCard}><Text style={styles.cardTitle}>Último respaldo creado</Text>{lastBackup ? <><Text style={styles.statusValue}>{new Date(lastBackup.createdAt).toLocaleString('es-MX')}</Text><Text style={styles.body}>{lastBackup.fileName} · {(lastBackup.sizeBytes / 1024).toFixed(1)} KB</Text></> : <Text style={styles.body}>Todavía no se ha creado una copia.</Text>}{lastRestore ? <Text style={styles.body}>Última restauración · {new Date(lastRestore).toLocaleString('es-MX')}</Text> : null}</View>

      <View style={styles.keyCard}><View style={styles.row}><Text style={styles.cardTitle}>Clave de respaldo</Text><Pressable onPress={() => setKeyVisible((value) => !value)}><Text style={styles.showKey}>{keyVisible ? 'Ocultar' : 'Mostrar'}</Text></Pressable></View>
        {key ? <Text selectable style={styles.keyText}>{keyVisible ? key : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}</Text> : <Text style={styles.body}>Se generará una clave al crear el primer respaldo.</Text>}
        <Text style={styles.helper}>Si pierdes la clave, no se podrán descifrar las copias. Para usar el archivo en otro dispositivo, transfiere esta clave por separado.</Text>
      </View>

      <View style={styles.restoreCard}><Text style={styles.cardTitle}>Restaurar copia</Text><Text style={styles.body}>Selecciona un archivo `.fpbackup`. En este dispositivo se usa la clave guardada; para importar en otro dispositivo, pega la clave de ese respaldo.</Text><TextInput value={keyInput} onChangeText={setKeyInput} autoCapitalize="none" autoCorrect={false} maxLength={64} placeholder="Clave opcional de 64 caracteres" placeholderTextColor={theme.colors.muted} style={styles.input} />
        <Pressable disabled={busy} onPress={() => void chooseRestore()} style={[styles.secondaryButton, busy && styles.disabled]}><Text style={styles.secondaryText}>{busy ? 'Procesando…' : 'Elegir archivo para restaurar'}</Text></Pressable>
      </View>
      {busy ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 14 }} /> : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      <Text style={styles.footnote}>Los respaldos se guardan donde elijas desde el menú del sistema al compartir. FerrePOS no los sube automáticamente a la nube.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 29, fontWeight: '900', marginTop: 4, marginBottom: 17 }, infoCard: { backgroundColor: theme.colors.dark, borderRadius: theme.radius.control, padding: 20, marginBottom: 13 }, infoIcon: { alignSelf: 'flex-start', marginBottom: 13 }, infoIconText: { color: theme.colors.accent, fontSize: 25, fontWeight: '800' }, cardTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 7 }, infoTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginBottom: 7 }, infoBody: { color: theme.colors.darkMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, body: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }, primaryButton: { minHeight: 49, borderRadius: theme.radius.control, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6 }, primaryText: { color: theme.colors.dark, fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.55 }, statusCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, padding: 16, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 }, statusValue: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginBottom: 5 }, keyCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, padding: 16, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, showKey: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '800' }, keyText: { color: theme.colors.text, backgroundColor: theme.colors.background, borderRadius: theme.radius.control, padding: 10, fontSize: 13, fontWeight: '700', letterSpacing: 0.7, marginVertical: 7 }, helper: { color: theme.colors.muted, fontSize: 10, lineHeight: 15 }, restoreCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, padding: 16, borderWidth: 1, borderColor: theme.colors.border }, input: { minHeight: 46, backgroundColor: theme.colors.background, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 12, color: theme.colors.text, fontSize: 13, marginBottom: 10 }, secondaryButton: { minHeight: 48, borderRadius: theme.radius.control, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 13 }, message: { color: theme.colors.primaryText, fontSize: 12, lineHeight: 17, marginTop: 12, fontWeight: '700' }, footnote: { color: theme.colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 17 },
});
