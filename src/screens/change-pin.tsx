import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useSQLiteContext } from '@/src/native/database';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';
import { changeUserPin } from '@/src/database/businessRepository';

export default function ChangePinScreen() {
  const { theme } = useAppTheme(); const { user } = useAuth(); const db = useSQLiteContext();
  const [currentPin, setCurrentPin] = useState(''); const [nextPin, setNextPin] = useState(''); const [confirmation, setConfirmation] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 36, maxWidth: 620, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4 }, body: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 9, marginBottom: 13 }, input: { minHeight: 48, marginTop: 9, paddingHorizontal: 12, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, button: { minHeight: 48, marginTop: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.control }, buttonText: { color: theme.colors.onPrimary, fontWeight: '800' }, success: { color: theme.colors.success, fontSize: 12, marginTop: 11 }, error: { color: theme.colors.danger, fontSize: 12, marginTop: 11 } });
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      if (!user) throw new Error('Inicia sesión para cambiar el PIN.');
      if (nextPin !== confirmation) throw new Error('Los PIN nuevos no coinciden.');
      await changeUserPin(db, user.id, currentPin, nextPin);
      setCurrentPin(''); setNextPin(''); setConfirmation(''); setMessage('Tu PIN se actualizó.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el PIN.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>SEGURIDAD DE CUENTA</Text><Text style={styles.title}>Cambiar PIN</Text>
    <Text style={styles.body}>Confirma tu PIN actual y asigna uno nuevo de 6 a 8 dígitos. Si lo olvidaste, un administrador puede restablecerlo desde Usuarios.</Text>
    <TextInput accessibilityLabel="PIN actual" value={currentPin} onChangeText={setCurrentPin} placeholder="PIN actual" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} />
    <TextInput accessibilityLabel="PIN nuevo" value={nextPin} onChangeText={setNextPin} placeholder="PIN nuevo (6 a 8 dígitos)" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} />
    <TextInput accessibilityLabel="Confirmar PIN nuevo" value={confirmation} onChangeText={setConfirmation} placeholder="Confirmar PIN nuevo" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.success}>{message}</Text> : null}
    <Pressable disabled={busy} onPress={() => void save()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Actualizando…' : 'Cambiar PIN'}</Text></Pressable>
  </ScrollView>;
}
