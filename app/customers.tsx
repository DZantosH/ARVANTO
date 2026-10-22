import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';
import { addCreditPayment, createCustomer, getCustomers, type Customer } from '@/src/database/businessRepository';
import { formatCurrencyFromCents, parseCurrencyToCents } from '@/src/domain/money';

export default function CustomersScreen() {
  const { theme } = useAppTheme(); const { user } = useAuth(); const db = useSQLiteContext();
  const [customers, setCustomers] = useState<Customer[]>([]); const [selected, setSelected] = useState<Customer | null>(null);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [limit, setLimit] = useState('');
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash'); const [query, setQuery] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 18, paddingBottom: 36, maxWidth: 800, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4, marginBottom: 16 }, section: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 15, marginBottom: 8 }, card: { padding: 13, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, marginBottom: 8 }, picked: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, name: { color: theme.colors.text, flex: 1, fontSize: 13, fontWeight: '800' }, balance: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '800' }, body: { color: theme.colors.muted, fontSize: 11, marginTop: 4 }, input: { minHeight: 45, marginTop: 7, paddingHorizontal: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.control, marginTop: 9 }, buttonText: { color: theme.colors.onPrimary, fontWeight: '800' }, secondary: { minHeight: 42, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control }, secondaryText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: '800' }, error: { color: theme.colors.danger, marginTop: 8, fontSize: 12 }, mutedButton: { backgroundColor: theme.colors.background, borderColor: theme.colors.border, borderWidth: 1 } });
  const refresh = useCallback(async () => setCustomers(await getCustomers(db, query)), [db, query]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const saveCustomer = async () => {
    setBusy(true); setError('');
    try { const creditLimitCents = user?.role === 'cashier' || !limit.trim() ? 0 : parseCurrencyToCents(limit); await createCustomer(db, { name, phone, email: '', address: '', creditLimitCents }); setName(''); setPhone(''); setLimit(''); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.'); }
    finally { setBusy(false); }
  };
  const addPayment = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { await addCreditPayment(db, selected.id, method, parseCurrencyToCents(amount), 'Abono a cuenta', user?.name); setAmount(''); await refresh(); setSelected(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar el abono.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>RELACIÓN COMERCIAL</Text><Text style={styles.title}>Clientes y crédito</Text>
    <Text style={styles.section}>Nuevo cliente</Text>
    <TextInput accessibilityLabel="Nombre del cliente" value={name} onChangeText={setName} placeholder="Nombre o razón social" placeholderTextColor={theme.colors.muted} style={styles.input} />
    <TextInput accessibilityLabel="Teléfono del cliente" value={phone} onChangeText={setPhone} placeholder="Teléfono (opcional)" placeholderTextColor={theme.colors.muted} keyboardType="phone-pad" style={styles.input} />
    {user?.role !== 'cashier' ? <TextInput accessibilityLabel="Límite de crédito" value={limit} onChangeText={setLimit} placeholder="Límite de crédito (0 = sin límite)" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" style={styles.input} /> : null}
    <Pressable disabled={busy} onPress={() => void saveCustomer()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Guardar cliente'}</Text></Pressable>
    <Text style={styles.section}>Cuentas por cobrar</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="Buscar cliente" placeholderTextColor={theme.colors.muted} style={styles.input} />
    {customers.map((customer) => <Pressable key={customer.id} onPress={() => setSelected(customer)} style={[styles.card, selected?.id === customer.id && styles.picked]}><View style={styles.row}><Text style={styles.name}>{customer.name}</Text><Text style={styles.balance}>{formatCurrencyFromCents(customer.balance_cents)}</Text></View><Text style={styles.body}>{customer.phone || 'Sin teléfono'} · Límite {customer.credit_limit_cents ? formatCurrencyFromCents(customer.credit_limit_cents) : 'sin límite'}</Text></Pressable>)}
    {selected && selected.balance_cents > 0 ? <View style={styles.card}>
      <Text style={styles.section}>Registrar abono · {selected.name}</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="Importe del abono" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" style={styles.input} />
      <View style={[styles.row, { marginTop: 8 }]}>{(['cash', 'card', 'transfer'] as const).map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={[styles.secondary, method !== item && styles.mutedButton]}><Text style={styles.secondaryText}>{item === 'cash' ? 'Efectivo' : item === 'card' ? 'Tarjeta' : 'Transferencia'}</Text></Pressable>)}</View>
      <Pressable disabled={busy} onPress={() => void addPayment()} style={styles.button}><Text style={styles.buttonText}>Guardar abono</Text></Pressable>
    </View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}
