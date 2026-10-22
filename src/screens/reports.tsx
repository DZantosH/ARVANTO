import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@/src/navigation/navigation';
import { useSQLiteContext } from '@/src/native/database';
import { File, Paths } from '@/src/native/platform';
import * as Print from '@/src/native/platform';
import * as Sharing from '@/src/native/platform';
import * as XLSX from 'xlsx';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { getBusinessReportForPeriod, type PeriodBusinessReport, type ReportDay } from '@/src/database/businessRepository';
import { formatCurrencyFromCents } from '@/src/domain/money';

type Period = 'today' | 'week' | 'month' | 'custom';
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return localDate(date); };
const monthStart = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
const validDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; };
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
const money = (value: number) => formatCurrencyFromCents(value);

export default function ReportsScreen() {
  const { theme } = useAppTheme(); const db = useSQLiteContext();
  const today = localDate(new Date());
  const [period, setPeriod] = useState<Period>('month'); const [rangeFrom, setRangeFrom] = useState(monthStart(new Date())); const [rangeTo, setRangeTo] = useState(today);
  const [draftFrom, setDraftFrom] = useState(monthStart(new Date())); const [draftTo, setDraftTo] = useState(today);
  const [report, setReport] = useState<PeriodBusinessReport | null>(null); const [loading, setLoading] = useState(false); const [exporting, setExporting] = useState(false); const [error, setError] = useState('');
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 18, paddingBottom: 36, maxWidth: 850, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 28, fontWeight: '900', marginTop: 4 }, subtitle: { color: theme.colors.muted, fontSize: 12, marginTop: 5, marginBottom: 12 }, section: { color: theme.colors.text, fontWeight: '800', fontSize: 15, marginBottom: 9, marginTop: 16 }, row: { flexDirection: 'row', gap: 9 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, card: { flex: 1, minHeight: 85, justifyContent: 'center', padding: 12, marginBottom: 9, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, label: { color: theme.colors.muted, fontSize: 10, fontWeight: '700' }, amount: { color: theme.colors.text, fontSize: 17, fontWeight: '900', marginTop: 6 }, foot: { color: theme.colors.muted, fontSize: 10, marginTop: 4 }, note: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 12 }, choice: { minHeight: 40, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, choiceSelected: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary }, choiceText: { color: theme.colors.text, fontSize: 11, fontWeight: '800' }, input: { flex: 1, minHeight: 44, marginTop: 9, paddingHorizontal: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, fontSize: 13 }, apply: { minHeight: 43, marginTop: 9, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.control }, applyText: { color: theme.colors.onPrimary, fontSize: 12, fontWeight: '800' }, exportButton: { flex: 1, minHeight: 48, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border }, exportText: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.55 }, error: { color: theme.colors.danger, fontSize: 12, marginTop: 9 }, dayCard: { padding: 12, marginBottom: 7, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, dayTitle: { color: theme.colors.text, fontSize: 12, fontWeight: '800' }, dayValue: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '800' }, dayFoot: { color: theme.colors.muted, fontSize: 10, marginTop: 5 } });
  useFocusEffect(useCallback(() => {
    let active = true; setLoading(true); setError('');
    void getBusinessReportForPeriod(db, rangeFrom, rangeTo).then((result) => { if (active) setReport(result); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el reporte.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, rangeFrom, rangeTo]));

  const setPreset = (next: Exclude<Period, 'custom'>) => {
    const end = localDate(new Date()); const start = next === 'today' ? end : next === 'week' ? shiftDate(end, -6) : monthStart(new Date());
    setPeriod(next); setRangeFrom(start); setRangeTo(end); setDraftFrom(start); setDraftTo(end); setError('');
  };
  const applyCustom = () => {
    if (!validDate(draftFrom) || !validDate(draftTo) || draftFrom > draftTo) { setError('Escribe un periodo válido usando AAAA-MM-DD.'); return; }
    const span = (Date.parse(`${draftTo}T00:00:00Z`) - Date.parse(`${draftFrom}T00:00:00Z`)) / 86_400_000;
    if (span > 365) { setError('El periodo personalizado no puede superar 366 días.'); return; }
    setRangeFrom(draftFrom); setRangeTo(draftTo); setPeriod('custom'); setError('');
  };
  const rangeLabel = report ? `${report.from} — ${report.to}` : `${rangeFrom} — ${rangeTo}`;
  const exportRows = (data: PeriodBusinessReport) => data.days.map((day) => ({ Fecha: day.date, Tickets: day.tickets, 'Ventas brutas (MXN)': day.salesCents / 100, 'Devoluciones (MXN)': day.refundsCents / 100, 'Ventas netas (MXN)': day.netSalesCents / 100, 'Costo neto (MXN)': day.costCents / 100, 'Ventas a crédito (MXN)': day.creditCents / 100, 'Compras (MXN)': day.purchasesCents / 100, 'Documentos de compra': day.purchaseCount }));
  const shareExport = async (uri: string, title: string, mimeType: string, uti: string) => {
    if (!await Sharing.isAvailableAsync()) throw new Error('Compartir archivos no está disponible en este dispositivo.');
    await Sharing.shareAsync(uri, { dialogTitle: title, mimeType, UTI: uti });
  };
  const exportPdf = async () => {
    if (!report) return;
    setExporting(true); setError('');
    try {
      const dailyRows = report.days.length ? report.days.map((day) => `<tr><td>${htmlEscape(day.date)}</td><td>${day.tickets}</td><td>${money(day.netSalesCents)}</td><td>${money(day.costCents)}</td><td>${money(day.purchasesCents)}</td></tr>`).join('') : '<tr><td colspan="5">Sin movimientos en este periodo</td></tr>';
      const rows = [
        ['Ventas netas', money(report.salesCents)], ['Devoluciones', money(report.refundsCents)], ['Tickets', String(report.tickets)],
        ['Costo neto vendido', money(report.costCents)], ['Margen bruto estimado', money(report.salesCents - report.costCents)],
        ['Ventas a crédito netas', money(report.creditCents)], ['Compras', money(report.purchasesCents)], ['Documentos de compra', String(report.purchaseCount)],
        ['Productos activos (actual)', String(report.products)], ['Stock bajo (actual)', String(report.lowStock)],
        ['Valor de inventario actual', money(report.stockValueCents)], ['Saldo por cobrar actual', money(report.receivablesCents)], ['Cuentas por pagar actuales', money(report.payablesCents)],
      ].map(([label, value]) => `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`).join('');
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        @page{margin:18mm}body{font:12px Arial,sans-serif;color:#18212f}h1{font-size:22px;margin-bottom:4px}.sub{color:#586579;margin:0 0 18px}h2{font-size:15px;margin:22px 0 8px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #dce2e8;padding:8px;text-align:left}th{width:55%;color:#334155}thead th{background:#eef3f8}.foot{margin-top:18px;color:#64748b;font-size:10px}
      </style></head><body><h1>ARVANTO · Reporte del negocio</h1><p class="sub">Periodo: ${htmlEscape(rangeLabel)} · Generado: ${new Date().toLocaleString('es-MX')}</p><h2>Resumen</h2><table>${rows}</table><h2>Desglose diario</h2><table><thead><tr><th>Fecha</th><th>Tickets</th><th>Ventas netas</th><th>Costo neto</th><th>Compras</th></tr></thead><tbody>${dailyRows}</tbody></table><p class="foot">El margen bruto estimado no descuenta gastos operativos ni impuestos. Inventario y saldos corresponden al momento de generar el reporte.</p></body></html>`;
      const file = await Print.printToFileAsync({ html });
      await shareExport(file.uri, 'Compartir reporte PDF', 'application/pdf', 'com.adobe.pdf');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo exportar el PDF.'); }
    finally { setExporting(false); }
  };
  const exportExcel = async () => {
    if (!report) return;
    setExporting(true); setError('');
    try {
      const workbook = XLSX.utils.book_new();
      const summary = [
        ['Reporte ARVANTO', 'Valor', 'Unidad'], ['Periodo', rangeLabel, 'AAAA-MM-DD'],
        ['Ventas netas', report.salesCents / 100, 'MXN'], ['Devoluciones', report.refundsCents / 100, 'MXN'], ['Tickets', report.tickets, ''],
        ['Costo neto vendido', report.costCents / 100, 'MXN'], ['Margen bruto estimado', (report.salesCents - report.costCents) / 100, 'MXN'],
        ['Ventas a crédito netas', report.creditCents / 100, 'MXN'], ['Compras', report.purchasesCents / 100, 'MXN'], ['Documentos de compra', report.purchaseCount, ''],
        ['Productos activos (actual)', report.products, ''], ['Stock bajo (actual)', report.lowStock, ''], ['Valor inventario actual', report.stockValueCents / 100, 'MXN'],
        ['Saldo por cobrar actual', report.receivablesCents / 100, 'MXN'], ['Cuentas por pagar actuales', report.payablesCents / 100, 'MXN'],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summary); summarySheet['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 18 }];
      const dailySheet = XLSX.utils.json_to_sheet(exportRows(report)); dailySheet['!cols'] = Object.keys(exportRows(report)[0] ?? { Fecha: '' }).map((header) => ({ wch: Math.max(16, header.length + 2) }));
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen'); XLSX.utils.book_append_sheet(workbook, dailySheet, 'Desglose diario');
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      const dateToken = `${report.from}_${report.to}`; const file = new File(Paths.cache, `Arvanto-reporte-${dateToken}.xlsx`);
      file.create({ intermediates: true, overwrite: true }); await file.write(new Uint8Array(bytes));
      await shareExport(file.uri, 'Compartir reporte Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'org.openxmlformats.spreadsheetml.sheet');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo exportar el Excel.'); }
    finally { setExporting(false); }
  };
  const metric = (label: string, value: string, foot?: string) => <View key={label} style={styles.card}><Text style={styles.label}>{label}</Text><Text style={styles.amount}>{value}</Text>{foot ? <Text style={styles.foot}>{foot}</Text> : null}</View>;
  const periodButton = (value: Exclude<Period, 'custom'>, label: string) => <Pressable key={value} onPress={() => setPreset(value)} style={[styles.choice, period === value && styles.choiceSelected]}><Text style={styles.choiceText}>{label}</Text></Pressable>;
  const dayLine = (day: ReportDay) => <View key={day.date} style={styles.dayCard}><View style={styles.row}><Text style={styles.dayTitle}>{day.date} · {day.tickets} tickets</Text><Text style={styles.dayValue}>{money(day.netSalesCents)}</Text></View><Text style={styles.dayFoot}>Devoluciones {money(day.refundsCents)} · Costo {money(day.costCents)} · Compras {money(day.purchasesCents)} ({day.purchaseCount})</Text></View>;
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>ANÁLISIS DEL NEGOCIO</Text><Text style={styles.title}>Reportes</Text><Text style={styles.subtitle}>Ventas y compras por periodo · inventario y saldos actuales</Text>
    <View style={styles.wrap}>{periodButton('today', 'Hoy')}{periodButton('week', 'Últimos 7 días')}{periodButton('month', 'Este mes')}<Pressable onPress={() => { setPeriod('custom'); setError(''); }} style={[styles.choice, period === 'custom' && styles.choiceSelected]}><Text style={styles.choiceText}>Personalizado</Text></Pressable></View>
    {period === 'custom' ? <><View style={styles.row}><TextInput accessibilityLabel="Fecha inicial" value={draftFrom} onChangeText={setDraftFrom} placeholder="Desde AAAA-MM-DD" autoCapitalize="none" placeholderTextColor={theme.colors.muted} style={styles.input} /><TextInput accessibilityLabel="Fecha final" value={draftTo} onChangeText={setDraftTo} placeholder="Hasta AAAA-MM-DD" autoCapitalize="none" placeholderTextColor={theme.colors.muted} style={styles.input} /></View><Pressable onPress={applyCustom} style={styles.apply}><Text style={styles.applyText}>Aplicar periodo</Text></Pressable></> : null}
    <Text style={styles.section}>Periodo · {rangeLabel}</Text>
    <View style={styles.wrap}><Pressable disabled={!report || loading || exporting} onPress={() => void exportPdf()} style={[styles.exportButton, (!report || loading || exporting) && styles.disabled]}><Text style={styles.exportText}>{exporting ? 'Preparando…' : 'Exportar PDF'}</Text></Pressable><Pressable disabled={!report || loading || exporting} onPress={() => void exportExcel()} style={[styles.exportButton, (!report || loading || exporting) && styles.disabled]}><Text style={styles.exportText}>{exporting ? 'Preparando…' : 'Exportar Excel'}</Text></Pressable></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{loading ? <Text style={styles.subtitle}>Cargando cifras…</Text> : null}
    {report ? <>
      <Text style={styles.section}>Ventas del periodo</Text><View style={styles.row}>{metric('Ventas netas', money(report.salesCents), `${money(report.refundsCents)} en devoluciones`)}{metric('Tickets', String(report.tickets))}</View><View style={styles.row}>{metric('Costo neto vendido', money(report.costCents))}{metric('Margen bruto estimado', money(report.salesCents - report.costCents))}</View><View style={styles.row}>{metric('Ventas a crédito netas', money(report.creditCents))}{metric('Compras', money(report.purchasesCents), `${report.purchaseCount} documentos`)}</View>
      <Text style={styles.section}>Estado actual</Text><View style={styles.row}>{metric('Productos activos', String(report.products))}{metric('Stock bajo', String(report.lowStock))}</View><View style={styles.row}>{metric('Valor del inventario', money(report.stockValueCents))}{metric('Saldo por cobrar', money(report.receivablesCents))}</View><View style={styles.row}>{metric('Cuentas por pagar', money(report.payablesCents))}</View>
      <Text style={styles.section}>Desglose diario</Text>{report.days.length ? report.days.map(dayLine) : <Text style={styles.subtitle}>Sin ventas ni compras registradas en este periodo.</Text>}
      <Text style={styles.note}>El margen bruto estimado resta el costo neto de las ventas; no descuenta gastos operativos ni impuestos. El inventario y los saldos son una fotografía actual, aunque elijas un periodo anterior.</Text>
    </> : null}
  </ScrollView>;
}
