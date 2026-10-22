import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { getBusinessReport } from '@/src/database/businessRepository';
import { formatCurrencyFromCents } from '@/src/domain/money';

export default function ReportsScreen() {
  const { theme } = useAppTheme(); const db = useSQLiteContext();
  const [report, setReport] = useState<Awaited<ReturnType<typeof getBusinessReport>> | null>(null);
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 36, maxWidth: 780, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 }, subtitle: { color: theme.colors.muted, fontSize: 12, marginTop: 5, marginBottom: 20 }, section: { color: theme.colors.text, fontWeight: '800', fontSize: 15, marginBottom: 9, marginTop: 12 }, row: { flexDirection: 'row', gap: 10 }, card: { flex: 1, minHeight: 92, justifyContent: 'center', padding: 14, marginBottom: 10, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, label: { color: theme.colors.muted, fontSize: 11, fontWeight: '700' }, amount: { color: theme.colors.text, fontSize: 19, fontWeight: '900', marginTop: 6 }, foot: { color: theme.colors.muted, fontSize: 10, marginTop: 4 }, note: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 12 } });
  useFocusEffect(useCallback(() => { void getBusinessReport(db).then(setReport); }, [db]));
  const money = (value: number | undefined) => formatCurrencyFromCents(value ?? 0);
  const metric = (label: string, value: string) => <View key={label} style={styles.card}><Text style={styles.label}>{label}</Text><Text style={styles.amount}>{value}</Text></View>;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>ANÁLISIS DEL NEGOCIO</Text><Text style={styles.title}>Reportes</Text><Text style={styles.subtitle}>Cifras del día y saldos actuales · datos locales</Text>
    <Text style={styles.section}>Ventas de hoy</Text><View style={styles.row}>{metric('Ventas', money(report?.salesCents))}{metric('Tickets', String(report?.tickets ?? 0))}</View><View style={styles.row}>{metric('Costo vendido', money(report?.costCents))}{metric('Margen bruto estimado', money((report?.salesCents ?? 0) - (report?.costCents ?? 0)))}</View>
    <Text style={styles.section}>Inventario y crédito</Text><View style={styles.row}>{metric('Productos activos', String(report?.products ?? 0))}{metric('Stock bajo', String(report?.lowStock ?? 0))}</View><View style={styles.row}>{metric('Valor del inventario a costo', money(report?.stockValueCents))}{metric('Saldo por cobrar', money(report?.receivablesCents))}</View>
    <Text style={styles.section}>Compras de hoy</Text><View style={styles.row}>{metric('Compras', money(report?.purchasesCents))}{metric('Documentos', String(report?.purchaseCount ?? 0))}</View>
    <Text style={styles.note}>El margen es una estimación basada en el costo guardado en cada partida. No descuenta gastos, impuestos, devoluciones ni cancelaciones.</Text>
  </ScrollView>;
}
