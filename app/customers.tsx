import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';
import { addCreditPayment, createCustomer, getCustomerAccountHistory, getCustomers, updateCustomer, type Customer } from '@/src/database/businessRepository';
import { formatCurrencyFromCents, parseCurrencyToCents } from '@/src/domain/money';

type AccountHistory = Awaited<ReturnType<typeof getCustomerAccountHistory>>;
export default function CustomersScreen() {
  const { theme } = useAppTheme(); const { user } = useAuth(); const db = useSQLiteContext();
  const [customers, setCustomers] = useState<Customer[]>([]); const [selected, setSelected] = useState<Customer | null>(null); const [history, setHistory] = useState<{ customerId: string; data: AccountHistory } | null>(null);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [address, setAddress] = useState(''); const [limit, setLimit] = useState(''); const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash'); const [query, setQuery] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 18, paddingBottom: 36, maxWidth: 850, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4, marginBottom: 12 }, section: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 15, marginBottom: 8 }, card: { padding: 13, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, marginBottom: 8 }, picked: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 9 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, name: { color: theme.colors.text, flex: 1, fontSize: 13, fontWeight: '800' }, balance: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '800' }, body: { color: theme.colors.muted, fontSize: 11, marginTop: 4, lineHeight: 16 }, input: { minHeight: 45, marginTop: 7, paddingHorizontal: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, button: { minHeight: 46, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.control, marginTop: 9 }, buttonText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 12 }, secondary: { minHeight: 40, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.primary }, secondaryText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: '800' }, mutedButton: { backgroundColor: theme.colors.background, borderColor: theme.colors.border }, error: { color: theme.colors.danger, marginTop: 8, fontSize: 12 }, amountIn: { color: theme.colors.danger, fontWeight: '800' }, amountOut: { color: theme.colors.primaryText, fontWeight: '800' }, divider: { borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 10, paddingTop: 9 } });
  const refresh = useCallback(async () => {
    const list = await getCustomers(db, query); setCustomers(list);
    setSelected((current) => current ? list.find((customer) => customer.id === current.id) ?? current : null);
  }, [db, query]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const selectedId = selected?.id; const selectedBalance = selected?.balance_cents;
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void getCustomerAccountHistory(db, selectedId).then((result) => { if (active) setHistory({ customerId: selectedId, data: result }); }).catch(() => { if (active) setHistory(null); });
    return () => { active = false; };
  }, [db, selectedId, selectedBalance]);
  const clearForm = () => { setName(''); setPhone(''); setEmail(''); setAddress(''); setLimit(''); setEditing(false); };
  const startEditing = () => { if (!selected) return; setName(selected.name); setPhone(selected.phone); setEmail(selected.email); setAddress(selected.address); setLimit(selected.credit_limit_cents ? String(selected.credit_limit_cents / 100) : ''); setEditing(true); setError(''); };
  const saveCustomer = async () => {
    setBusy(true); setError('');
    try {
      const creditLimitCents = user?.role === 'cashier' ? (editing ? selected?.credit_limit_cents ?? 0 : 0) : (!limit.trim() ? 0 : parseCurrencyToCents(limit));
      const values = { name, phone, email, address, creditLimitCents };
      if (editing && selected) await updateCustomer(db, selected.id, values); else await createCustomer(db, values);
      clearForm(); await refresh();
      if (editing && selected) { const updated = await getCustomers(db, query); setCustomers(updated); setSelected(updated.find((customer) => customer.id === selected.id) ?? null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente.'); }
    finally { setBusy(false); }
  };
  const addPayment = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { await addCreditPayment(db, selected.id, method, parseCurrencyToCents(amount), 'Abono a cuenta', user?.name); setAmount(''); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar el abono.'); }
    finally { setBusy(false); }
  };
  const accountHistory = history && history.customerId === selected?.id ? history.data : null;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>RELACIÓN COMERCIAL</Text><Text style={styles.title}>Clientes y crédito</Text>
    <Text style={styles.section}>{editing ? `Editar · ${selected?.name ?? ''}` : 'Nuevo cliente'}</Text>
    <TextInput accessibilityLabel="Nombre del cliente" value={name} onChangeText={setName} placeholder="Nombre o razón social" placeholderTextColor={theme.colors.muted} style={styles.input} />
    <TextInput accessibilityLabel="Teléfono del cliente" value={phone} onChangeText={setPhone} placeholder="Teléfono (opcional)" placeholderTextColor={theme.colors.muted} keyboardType="phone-pad" style={styles.input} />
    <TextInput accessibilityLabel="Correo del cliente" value={email} onChangeText={setEmail} placeholder="Correo electrónico (opcional)" placeholderTextColor={theme.colors.muted} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
    <TextInput accessibilityLabel="Dirección del cliente" value={address} onChangeText={setAddress} placeholder="Dirección (opcional)" placeholderTextColor={theme.colors.muted} style={styles.input} />
    {user?.role !== 'cashier' ? <TextInput accessibilityLabel="Límite de crédito" value={limit} onChangeText={setLimit} placeholder="Límite de crédito (0 = sin límite)" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" style={styles.input} /> : null}
    <Pressable disabled={busy} onPress={() => void saveCustomer()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar cliente'}</Text></Pressable>
    {editing ? <Pressable onPress={clearForm} style={[styles.button, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}><Text style={[styles.buttonText, { color: theme.colors.text }]}>Cancelar edición</Text></Pressable> : null}
    <Text style={styles.section}>Clientes y cuentas por cobrar</Text>
    <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nombre o teléfono" placeholderTextColor={theme.colors.muted} style={styles.input} />
    {customers.map((customer) => <Pressable key={customer.id} onPress={() => { clearForm(); setSelected(customer); setError(''); }} style={[styles.card, selected?.id === customer.id && styles.picked]}><View style={styles.row}><Text style={styles.name}>{customer.name}</Text><Text style={styles.balance}>{formatCurrencyFromCents(customer.balance_cents)}</Text></View><Text style={styles.body}>{customer.phone || 'Sin teléfono'} · Límite {customer.credit_limit_cents ? formatCurrencyFromCents(customer.credit_limit_cents) : 'sin límite'}</Text></Pressable>)}
    {selected ? <View style={styles.card}>
      <View style={styles.row}><Text style={styles.name}>{selected.name}</Text><Pressable onPress={startEditing} style={styles.secondary}><Text style={styles.secondaryText}>Editar datos</Text></Pressable></View>
      <Text style={styles.body}>{selected.phone || 'Sin teléfono'}{selected.email ? ` · ${selected.email}` : ''}</Text>{selected.address ? <Text style={styles.body}>{selected.address}</Text> : null}
      <Text style={styles.section}>Estado de cuenta</Text><View style={styles.row}><Text style={styles.body}>Saldo pendiente</Text><Text style={styles.balance}>{formatCurrencyFromCents(selected.balance_cents)}</Text></View><Text style={styles.body}>Límite: {selected.credit_limit_cents ? formatCurrencyFromCents(selected.credit_limit_cents) : 'sin límite de crédito'}</Text>
      {selected.balance_cents > 0 ? <><Text style={styles.section}>Registrar abono</Text><TextInput value={amount} onChangeText={setAmount} placeholder="Importe del abono" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" style={styles.input} /><View style={[styles.wrap, { marginTop: 8 }]}>{(['cash', 'card', 'transfer'] as const).map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={[styles.secondary, method !== item && styles.mutedButton]}><Text style={styles.secondaryText}>{item === 'cash' ? 'Efectivo' : item === 'card' ? 'Tarjeta' : 'Transferencia'}</Text></Pressable>)}</View><Pressable disabled={busy} onPress={() => void addPayment()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Guardar abono'}</Text></Pressable></> : null}
      <Text style={styles.section}>Historial de compras</Text>{accountHistory?.sales.length ? accountHistory.sales.map((sale) => <View key={sale.id} style={styles.divider}><View style={styles.row}><Text style={styles.name}>Ticket #{sale.ticket_number} · {sale.status === 'completed' ? 'Completada' : 'Cancelada'}</Text><Text style={styles.balance}>{formatCurrencyFromCents(sale.total_cents)}</Text></View>{sale.items ? <Text style={styles.body}>{sale.items}</Text> : null}<Text style={styles.body}>{new Date(sale.created_at).toLocaleString('es-MX')} · Crédito {formatCurrencyFromCents(sale.credit_cents)}{sale.returned_cents ? ` · Devoluciones ${formatCurrencyFromCents(sale.returned_cents)}` : ''}</Text></View>) : <Text style={styles.body}>No hay compras registradas.</Text>}
      <Text style={styles.section}>Movimientos de crédito</Text>{accountHistory?.movements.length ? accountHistory.movements.map((movement) => <View key={`${movement.kind}-${movement.id}`} style={styles.divider}><View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.name}>{movement.description}</Text><Text style={styles.body}>{new Date(movement.created_at).toLocaleString('es-MX')} · {movement.method} · {movement.created_by}</Text></View><Text style={movement.kind === 'charge' ? styles.amountIn : styles.amountOut}>{movement.kind === 'charge' ? '+' : '−'}{formatCurrencyFromCents(movement.amount_cents)}</Text></View></View>) : <Text style={styles.body}>No hay movimientos de crédito.</Text>}
    </View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}
