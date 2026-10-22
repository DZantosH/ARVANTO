import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { getAuditLog, type AuditEvent } from '@/src/database/auditRepository';

const filters = [{ days: 1, label: 'Hoy' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }, { days: 3650, label: 'Todo' }];
export default function AuditScreen() {
  const { theme } = useAppTheme(); const db = useSQLiteContext();
  const [days, setDays] = useState(30); const [query, setQuery] = useState(''); const [events, setEvents] = useState<AuditEvent[]>([]); const [error, setError] = useState('');
  const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 18, paddingBottom: 36, maxWidth: 850, width: '100%', alignSelf: 'center' }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4 }, intro: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }, filter: { minHeight: 39, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, backgroundColor: theme.colors.surface }, selected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, filterText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: '800' }, input: { minHeight: 45, marginTop: 10, paddingHorizontal: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, card: { padding: 12, marginTop: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, eventTitle: { flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: '800' }, meta: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '700' }, body: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 }, error: { color: theme.colors.danger, fontSize: 12, marginTop: 8 } });
  const refresh = useCallback(async () => { try { setEvents(await getAuditLog(db, days, query)); setError(''); } catch { setError('No se pudo cargar la bitácora.'); } }, [db, days, query]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>CONTROL LOCAL</Text><Text style={styles.title}>Bitácora de actividad</Text>
    <Text style={styles.intro}>Registra accesos y operaciones locales, con usuario, acción y fecha. El historial reside en esta base de datos y no es inmutable; no reemplaza registros de servidor.</Text>
    <View style={styles.row}>{filters.map((filter) => <Pressable key={filter.days} onPress={() => setDays(filter.days)} style={[styles.filter, days === filter.days && styles.selected]}><Text style={styles.filterText}>{filter.label}</Text></Pressable>)}</View>
    <TextInput value={query} onChangeText={setQuery} placeholder="Buscar usuario, acción o detalle" placeholderTextColor={theme.colors.muted} style={styles.input} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {events.length ? events.map((event) => <View key={event.id} style={styles.card}><View style={styles.titleRow}><Text style={styles.eventTitle}>{event.action} · {event.entity_type}</Text><Text style={styles.meta}>{new Date(event.created_at).toLocaleString('es-MX')}</Text></View><Text style={styles.body}>{event.actor_name}{event.summary ? ` · ${event.summary}` : ''}</Text></View>) : <Text style={styles.intro}>No hay eventos en este periodo.</Text>}
    {events.length >= 300 ? <Text style={styles.intro}>Se muestran los 300 eventos más recientes. Reduce el periodo o usa la búsqueda.</Text> : null}
  </ScrollView>;
}
