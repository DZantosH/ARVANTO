import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, RefreshControl } from 'react-native';
import { Link, type Href, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getDashboardSummary, type DashboardSummary } from '@/src/database/dashboardRepository';
import { formatCurrencyFromCents } from '@/src/domain/money';
import { theme } from '@/constants/Theme';
import { SectionHeading, StatusPill } from '@/components/SectionHeading';

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getDashboardSummary(db));
      setError('');
    } catch {
      setError('No se pudo leer la información local. Intenta actualizar.');
    }
  }, [db]);

  useFocusEffect(useCallback(() => { void loadSummary(); }, [loadSummary]));

  const refresh = async () => {
    setRefreshing(true);
    await loadSummary();
    setRefreshing(false);
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}>
      <View style={styles.topline}>
        <View>
          <Text style={styles.eyebrow}>FERREPOS · LOCAL</Text>
          <Text style={styles.title}>Buen día</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>F</Text></View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><Text style={styles.heroIconText}>⌂</Text></View>
        <Text style={styles.heroEyebrow}>RESUMEN DE HOY</Text>
        <Text style={styles.heroAmount}>{summary ? formatCurrencyFromCents(summary.salesCents) : '—'}</Text>
        <Text style={styles.heroFoot}>{summary ? `${summary.ticketCount} tickets registrados` : 'Cargando información local…'}</Text>
        <View style={styles.heroDivider} />
        <View style={styles.heroBottom}><Text style={styles.heroFoot}>Ventas a crédito</Text><Text style={styles.heroFootStrong}>{summary ? formatCurrencyFromCents(summary.creditSalesCents) : '—'}</Text></View>
      </View>

      <View style={styles.sectionTitleRow}><SectionHeading title="Tu operación" /><StatusPill label="Datos locales" /></View>
      <View style={styles.metricRow}>
        <View style={styles.metricCard}><Text style={styles.metricLabel}>Caja</Text><Text style={styles.metricValue}>{summary?.cashOpen ? 'Abierta' : 'Cerrada'}</Text><Text style={styles.metricHint}>{summary?.cashOpen ? 'Turno en curso' : 'Sin turno activo'}</Text></View>
        <View style={styles.metricCard}><Text style={styles.metricLabel}>Stock bajo</Text><Text style={styles.metricValue}>{summary?.lowStockCount ?? '—'}</Text><Text style={styles.metricHint}>Productos por revisar</Text></View>
      </View>

      <View style={styles.quickTitle}><SectionHeading title="Accesos rápidos" /></View>
      <View style={styles.quickGrid}>
        <QuickAction icon="＋" title="Nueva venta" color={theme.colors.primary} href={'/sale' as Href} />
        <QuickAction icon="▦" title="Productos" color="#34668E" href={'/products' as Href} />
        <QuickAction icon="↕" title="Inventario" color="#A36B28" />
        <QuickAction icon="◷" title="Corte de caja" color="#7B5D96" href={'/cash' as Href} />
        <QuickAction icon="↥" title="Respaldos" color="#64748B" href={'/backup' as Href} />
      </View>

      {error ? <Pressable onPress={() => void loadSummary()}><Text style={styles.error}>{error} · Toca para reintentar</Text></Pressable> : null}
      <Text style={styles.footnote}>Tus datos se guardan en este dispositivo.</Text>
    </ScrollView>
  );
}

function QuickAction({ icon, title, color, href }: { icon: string; title: string; color: string; href?: Href }) {
  const content = <View style={styles.quickCard}><View style={[styles.quickIcon, { backgroundColor: `${color}14` }]}><Text style={[styles.quickIconText, { color }]}>{icon}</Text></View><Text style={styles.quickText}>{title}</Text><Text style={styles.chevron}>›</Text></View>;
  return href ? <Link href={href} asChild><Pressable accessibilityRole="button">{content}</Pressable></Link> : content;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30, maxWidth: 900, width: '100%', alignSelf: 'center' },
  topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  eyebrow: { color: theme.colors.primary, fontSize: 11, letterSpacing: 1.6, fontWeight: '800' },
  title: { color: theme.colors.text, fontSize: 29, fontWeight: '800', marginTop: 5 },
  avatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.colors.primary, fontWeight: '800', fontSize: 18 },
  hero: { padding: 22, backgroundColor: theme.colors.dark, borderRadius: 22, overflow: 'hidden' },
  heroIcon: { position: 'absolute', right: 19, top: 14, width: 46, height: 46, borderRadius: 16, backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  heroIconText: { color: '#E89B3C', fontSize: 27 },
  heroEyebrow: { color: '#A8C2B8', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '800', marginTop: 9 },
  heroFoot: { color: '#A8C2B8', fontSize: 13, marginTop: 5 },
  heroDivider: { height: 1, backgroundColor: '#FFFFFF24', marginTop: 19 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11 },
  heroFootStrong: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 12 },
  metricRow: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.card, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  metricLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '600' },
  metricValue: { color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 9 },
  metricHint: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
  quickTitle: { marginTop: 25, marginBottom: 12 },
  quickGrid: { gap: 9 },
  quickCard: { minHeight: 64, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 15, padding: 11, borderWidth: 1, borderColor: theme.colors.border },
  quickIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  quickIconText: { fontSize: 21, fontWeight: '700' },
  quickText: { color: theme.colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
  chevron: { color: '#9AA6AF', fontSize: 26, paddingHorizontal: 5 },
  error: { color: theme.colors.danger, fontSize: 12, marginTop: 15 },
  footnote: { textAlign: 'center', color: theme.colors.muted, fontSize: 11, marginTop: 20 },
});
