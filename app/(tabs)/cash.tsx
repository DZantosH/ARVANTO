import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { addCashMovement, closeCashSession, getCashOverview, openCashSession, type CashOverview } from '@/src/database/posRepository';
import { formatCurrencyFromCents, parseCurrencyToCents } from '@/src/domain/money';

type ActionKind = 'open' | 'in' | 'out' | 'close';

export default function CashScreen() {
  const { theme, styles } = useThemeStyles();
  const db = useSQLiteContext();
  const [overview, setOverview] = useState<CashOverview | null>(null);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setOverview(await getCashOverview(db)); setError(''); }
    catch { setError('No se pudo cargar la caja local.'); }
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const submit = async (amountText: string, reason: string) => {
    setBusy(true);
    try {
      const amount = parseCurrencyToCents(amountText.trim() || '0');
      if (action === 'open') await openCashSession(db, amount);
      else if (action === 'in' || action === 'out') await addCashMovement(db, action, amount, reason);
      else if (action === 'close') {
        const result = await closeCashSession(db, amount);
        setAction(null);
        await refresh();
        Alert.alert('Turno cerrado', `Efectivo esperado: ${formatCurrencyFromCents(result.expectedCashCents)}\nDiferencia: ${formatCurrencyFromCents(result.differenceCents)}${result.differenceCents < 0 ? ' (faltante)' : result.differenceCents > 0 ? ' (sobrante)' : ''}`);
        return;
      }
      setAction(null); await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo completar la operación.');
    } finally { setBusy(false); }
  };

  if (!overview) return <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /></View>;
  const session = overview.session;
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>OPERACIÓN DIARIA</Text><Text style={styles.title}>Caja</Text></View><View style={[styles.badge, session ? styles.openBadge : styles.closedBadge]}><Text style={styles.badgeText}>{session ? 'Turno abierto' : 'Cerrada'}</Text></View></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {session ? <>
        <View style={styles.hero}><Text style={styles.heroLabel}>EFECTIVO ESPERADO</Text><Text style={styles.heroAmount}>{formatCurrencyFromCents(overview.expectedCashCents)}</Text><Text style={styles.heroFoot}>Abierta {new Date(session.opened_at).toLocaleString('es-MX')}</Text><View style={styles.divider} /><Text style={styles.heroFoot}>Fondo inicial · {formatCurrencyFromCents(session.opening_cash_cents)}</Text></View>
        <Text style={styles.sectionTitle}>Cobros por método</Text>
        <View style={styles.methodGrid}>{(['cash', 'card', 'transfer'] as const).map((method) => <View key={method} style={styles.methodCard}><Text style={styles.methodName}>{method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : 'Transferencia'}</Text><Text style={styles.methodAmount}>{formatCurrencyFromCents(overview.byMethod.find((item) => item.method === method)?.amount_cents ?? 0)}</Text></View>)}</View>
        <Text style={styles.sectionTitle}>Movimientos de efectivo</Text>
        <View style={styles.actionRow}><ActionButton title="Entrada" subtitle="Agregar efectivo" onPress={() => setAction('in')} /><ActionButton title="Retiro" subtitle="Registrar salida" danger onPress={() => setAction('out')} /></View>
        {overview.movements.length ? overview.movements.map((movement) => <View key={movement.id} style={styles.movement}><View style={styles.movementCopy}><Text style={styles.movementReason}>{movement.reason}</Text><Text style={styles.movementDate}>{new Date(movement.created_at).toLocaleString('es-MX')}</Text></View><Text style={[styles.movementAmount, movement.kind === 'out' && styles.outAmount]}>{movement.kind === 'in' ? '+' : '−'}{formatCurrencyFromCents(movement.amount_cents)}</Text></View>) : <Text style={styles.empty}>Aún no hay entradas ni retiros en este turno.</Text>}
        <Pressable onPress={() => setAction('close')} style={styles.closeButton}><Text style={styles.closeText}>Hacer corte y cerrar caja</Text></Pressable>
      </> : <View style={styles.emptyCard}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>◷</Text></View><Text style={styles.emptyTitle}>No hay un turno abierto</Text><Text style={styles.emptyDescription}>Registra el fondo inicial para empezar a vender. Al cerrar, capturarás el efectivo contado y la diferencia quedará guardada.</Text><Pressable onPress={() => setAction('open')} style={styles.primaryButton}><Text style={styles.primaryText}>Abrir caja</Text></Pressable></View>}
      {action ? <CashActionModal kind={action} busy={busy} onClose={() => setAction(null)} onSubmit={submit} expectedCash={overview.expectedCashCents} /> : null}
    </ScrollView>
  );
}

function ActionButton({ title, subtitle, danger, onPress }: { title: string; subtitle: string; danger?: boolean; onPress: () => void }) {
  const { styles } = useThemeStyles();
  return <Pressable onPress={onPress} style={[styles.actionButton, danger && styles.actionDanger]}><Text style={[styles.actionTitle, danger && styles.outAmount]}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></Pressable>;
}

function CashActionModal({ kind, busy, expectedCash, onClose, onSubmit }: { kind: ActionKind | null; busy: boolean; expectedCash: number; onClose: () => void; onSubmit: (amount: string, reason: string) => Promise<void> }) {
  const { styles } = useThemeStyles();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const labels: Record<ActionKind, string> = { open: 'Abrir caja', in: 'Entrada de efectivo', out: 'Retiro de efectivo', close: 'Cerrar turno' };
  const submit = async () => {
    try {
      const cents = parseCurrencyToCents(amount.trim() || '0');
      if (kind === 'in' || kind === 'out') {
        if (cents <= 0) { setError('El importe debe ser mayor a cero.'); return; }
        if (reason.trim().length < 3) { setError('Escribe un motivo de al menos 3 caracteres.'); return; }
      }
      if (kind === 'out' && cents > expectedCash) { setError('El retiro supera el efectivo esperado en caja.'); return; }
      setError(''); await onSubmit(amount, reason);
      setAmount(''); setReason('');
    } catch { setError('Escribe un importe válido con hasta dos decimales.'); }
  };
  return <Modal visible={Boolean(kind)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {kind ? <View style={styles.modalPage}><Text style={styles.eyebrow}>CONTROL DE CAJA</Text><Text style={styles.modalTitle}>{labels[kind]}</Text>
      {kind === 'close' ? <Text style={styles.expected}>Efectivo esperado: {formatCurrencyFromCents(expectedCash)}</Text> : null}
      <Text style={styles.fieldLabel}>{kind === 'close' ? 'Efectivo contado' : kind === 'open' ? 'Fondo inicial' : 'Importe'}</Text><TextInput autoFocus value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" style={styles.input} />
      {kind === 'in' || kind === 'out' ? <><Text style={styles.fieldLabel}>Motivo</Text><TextInput value={reason} onChangeText={setReason} maxLength={160} placeholder={kind === 'in' ? 'Ej. Cambio inicial adicional' : 'Ej. Pago a proveedor'} style={styles.input} /></> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.modalActions}><Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable><Pressable disabled={busy} onPress={() => void submit()} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? 'Guardando…' : labels[kind]}</Text></Pressable></View>
    </View> : null}
  </Modal>;
}

function useThemeStyles() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }, page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 35, maxWidth: 850, width: '100%', alignSelf: 'center' }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 29, fontWeight: '900', marginTop: 4 }, badge: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radius.control }, openBadge: { backgroundColor: theme.colors.primarySoft }, closedBadge: { backgroundColor: theme.colors.background }, badgeText: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 11 }, error: { color: theme.colors.danger, fontSize: 12, marginBottom: 10 }, hero: { backgroundColor: theme.colors.dark, borderRadius: theme.radius.control, padding: 21, marginBottom: 22 }, heroLabel: { color: theme.colors.darkMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 }, heroAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', marginTop: 8 }, heroFoot: { color: theme.colors.darkMuted, fontSize: 12, marginTop: 7 }, divider: { height: 1, backgroundColor: '#FFFFFF24', marginTop: 15 }, sectionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }, methodGrid: { flexDirection: 'row', gap: 9, marginBottom: 21 }, methodCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, padding: 13, borderWidth: 1, borderColor: theme.colors.border }, methodName: { color: theme.colors.muted, fontSize: 10, fontWeight: '700' }, methodAmount: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginTop: 7 }, actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 }, actionButton: { minHeight: 48, flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, padding: 13, justifyContent: 'center' }, actionDanger: { backgroundColor: theme.colors.dangerSoft, borderColor: theme.colors.dangerSoft }, actionTitle: { color: theme.colors.primaryText, fontSize: 14, fontWeight: '800' }, actionSubtitle: { color: theme.colors.muted, fontSize: 10, marginTop: 4 }, outAmount: { color: theme.colors.danger }, movement: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border }, movementCopy: { flex: 1 }, movementReason: { color: theme.colors.text, fontSize: 13, fontWeight: '700' }, movementDate: { color: theme.colors.muted, fontSize: 10, marginTop: 4 }, movementAmount: { color: theme.colors.primaryText, fontWeight: '800' }, empty: { color: theme.colors.muted, fontSize: 12, paddingVertical: 12 }, closeButton: { minHeight: 52, borderRadius: theme.radius.control, backgroundColor: theme.colors.dark, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, closeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }, emptyCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, borderColor: theme.colors.border, borderWidth: 1, padding: 22, alignItems: 'center', marginTop: 45 }, emptyIcon: { minHeight: 32, alignItems: 'center', justifyContent: 'center' }, emptyIconText: { color: theme.colors.primaryText, fontSize: 28 }, emptyTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 15 }, emptyDescription: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginVertical: 9 }, primaryButton: { minHeight: 48, paddingHorizontal: 18, borderRadius: theme.radius.control, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: theme.colors.onPrimary, fontSize: 14, fontWeight: '800' }, modalPage: { flex: 1, padding: 22, backgroundColor: theme.colors.background }, modalTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '900', marginTop: 5, marginBottom: 14 }, expected: { color: theme.colors.primaryText, fontSize: 13, fontWeight: '700', marginBottom: 5 }, fieldLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 5 }, input: { backgroundColor: theme.colors.surface, minHeight: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, paddingHorizontal: 12, color: theme.colors.text, fontSize: 15 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 }, cancelButton: { flex: 0.7, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background, borderRadius: theme.radius.control }, cancelText: { color: theme.colors.text, fontWeight: '700' },
}), [theme]);
  return { theme, styles };
}
