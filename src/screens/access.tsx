import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';

export default function AccessScreen() {
  const { theme } = useAppTheme(); const { ready, login } = useAuth();
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: theme.colors.background }, panel: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, title: { color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 5 }, body: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 10 }, input: { minHeight: 48, marginTop: 9, paddingHorizontal: 12, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text }, button: { minHeight: 49, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary }, buttonText: { color: theme.colors.onPrimary, fontWeight: '900' }, error: { color: theme.colors.danger, fontSize: 12, marginTop: 10 }, loading: { color: theme.colors.muted, textAlign: 'center', padding: 25 } });
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await login(username, password);
      setPassword('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  };
  if (!ready) return <Text style={styles.loading}>Cargando usuarios…</Text>;
  return <View style={styles.page}><View style={styles.panel}>
    <Text style={styles.eyebrow}>ARVANTO</Text><Text style={styles.title}>Iniciar sesión</Text>
    <Text style={styles.body}>Ingresa con tu usuario y contraseña.</Text>
    <TextInput accessibilityLabel="Usuario" value={username} onChangeText={setUsername} placeholder="Usuario" placeholderTextColor={theme.colors.muted} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={120} editable={!busy} style={styles.input} />
    <TextInput accessibilityLabel="Contraseña" value={password} onChangeText={setPassword} placeholder="Contraseña" placeholderTextColor={theme.colors.muted} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" maxLength={256} editable={!busy} onSubmitEditing={() => { if (!busy) void submit(); }} style={styles.input} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy || !username.trim() || !password} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</Text></Pressable>
  </View></View>;
}
