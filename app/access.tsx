import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';

export default function AccessScreen() {
  const { theme } = useAppTheme(); const { ready, userCount, login, createAccount } = useAuth();
  const [name, setName] = useState(''); const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [failures, setFailures] = useState(0);
  const setup = userCount === 0;
  const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: theme.colors.background }, panel: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, title: { color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 5 }, body: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 10 }, input: { minHeight: 48, marginTop: 9, paddingHorizontal: 12, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.text }, button: { minHeight: 49, marginTop: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary }, buttonText: { color: theme.colors.onPrimary, fontWeight: '900' }, error: { color: theme.colors.danger, fontSize: 12, marginTop: 10 }, loading: { color: theme.colors.muted, textAlign: 'center', padding: 25 } });
  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (setup) await createAccount(name, pin, 'admin');
      else if (!await login(pin)) { const next = failures + 1; setFailures(next); setError(next >= 5 ? 'Demasiados intentos. Espera un minuto y vuelve a intentar.' : 'PIN incorrecto o usuario inactivo.'); if (next >= 5) { setBusy(true); setTimeout(() => { setFailures(0); setBusy(false); }, 60_000); } return; }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.'); }
    finally { if (failures < 4 || setup) setBusy(false); }
  };
  if (!ready) return <Text style={styles.loading}>Cargando usuarios…</Text>;
  return <View style={styles.page}><View style={styles.panel}>
    <Text style={styles.eyebrow}>FERREPOS · ACCESO LOCAL</Text><Text style={styles.title}>{setup ? 'Configura tu negocio' : 'Iniciar sesión'}</Text>
    <Text style={styles.body}>{setup ? 'Crea el primer usuario administrador para proteger ventas y configuración.' : 'Ingresa tu PIN para abrir el punto de venta.'}</Text>
    {setup ? <TextInput accessibilityLabel="Nombre del administrador" value={name} onChangeText={setName} placeholder="Nombre del administrador" placeholderTextColor={theme.colors.muted} style={styles.input} /> : null}
    <TextInput accessibilityLabel="PIN" value={pin} onChangeText={setPin} placeholder="PIN de 6 a 8 dígitos" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Validando…' : setup ? 'Crear administrador' : 'Entrar'}</Text></Pressable>
  </View></View>;
}
