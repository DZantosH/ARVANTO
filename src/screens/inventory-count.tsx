import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from '@/src/navigation/navigation';
import { native } from '@/src/native/platform';
import { useSQLiteContext } from '@/src/native/database';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';
import { cancelInventoryCount, completeInventoryCount, findCountItemByCode, getOpenInventoryCount, setCountedQuantity, startInventoryCount, type InventoryCount, type InventoryCountItem } from '@/src/database/inventoryCountRepository';

type OpenCount = { count: InventoryCount; items: InventoryCountItem[] };

export default function InventoryCountScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const db = useSQLiteContext();
  const [count, setCount] = useState<InventoryCount | null>(null);
  const [items, setItems] = useState<InventoryCountItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.colors.background },
    content: { flex: 1, padding: 17, paddingBottom: 30, maxWidth: 900, width: '100%', alignSelf: 'center' },
    eyebrow: { color: theme.colors.primaryText, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
    title: { color: theme.colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 },
    body: { color: theme.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 9, marginBottom: 10 },
    countBadge: { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, paddingHorizontal: 10, paddingVertical: 8 },
    countBadgeText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: '800' },
    search: { minHeight: 46, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, paddingHorizontal: 11, color: theme.colors.text, marginTop: 12 },
    scanRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    scanInput: { flex: 1, minHeight: 46, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, paddingHorizontal: 11, color: theme.colors.text },
    scanButton: { minHeight: 46, minWidth: 112, paddingHorizontal: 12, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, justifyContent: 'center', alignItems: 'center' },
    scanButtonText: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 12 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 5 },
    primary: { minHeight: 49, flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.control, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
    primaryText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 12 },
    secondary: { minHeight: 48, flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 9 },
    secondaryText: { color: theme.colors.text, fontWeight: '700', fontSize: 12 },
    disabled: { opacity: 0.45 },
    error: { color: theme.colors.danger, fontSize: 12, marginTop: 9 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    item: { paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.colors.border },
    itemSelected: { backgroundColor: theme.colors.primarySoft },
    itemName: { flex: 1, color: theme.colors.text, fontWeight: '800', fontSize: 13 },
    itemMeta: { color: theme.colors.muted, fontSize: 10, marginTop: 3 },
    qtyInput: { width: 92, minHeight: 47, textAlign: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, color: theme.colors.text, fontSize: 15, fontWeight: '800' },
    saved: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 10, marginTop: 4 },
    empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 35, fontSize: 12 },
    modal: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
    camera: { flex: 1 },
    cameraFooter: { position: 'absolute', left: 0, right: 0, bottom: 34, paddingHorizontal: 18 },
    cameraText: { color: '#fff', textAlign: 'center', backgroundColor: '#0009', padding: 12, borderRadius: 10, marginBottom: 12, fontWeight: '700' },
    cameraClose: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 10 },
    cameraCloseText: { color: '#222', fontWeight: '800' },
    permissionCard: { margin: 20, padding: 20, backgroundColor: theme.colors.surface, borderRadius: theme.radius.control },
  });

  const refresh = useCallback(async () => {
    const active: OpenCount | null = await getOpenInventoryCount(db);
    setCount(active?.count ?? null);
    setItems(active?.items ?? []);
    if (!active) setDrafts({});
    else setDrafts((current) => Object.fromEntries(active.items.map((item) => [item.id, current[item.id] ?? (item.counted_quantity === null ? '' : String(item.counted_quantity))])));
  }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const begin = async () => {
    setBusy(true); setError('');
    try { await startInventoryCount(db, user?.name); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el conteo.'); }
    finally { setBusy(false); }
  };

  const scanCode = async (value: string) => {
    const code = value.trim();
    if (!count || !code) return;
    const found = await findCountItemByCode(db, count.id, code);
    if (!found) { setError(`No encontramos el código ${code} en este conteo. Verifica que el producto tenga ese código registrado.`); return; }
    setQuery(found.product_name);
    setSelectedId(found.id);
    setError('');
    setBarcode('');
  };

  const openScanner = async () => {
    try { const code = await native.scanBarcode(); if (code) await scanCode(code); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el escáner. Escribe el código manualmente.'); }
  };

  const saveItem = async (item: InventoryCountItem) => {
    const raw = drafts[item.id] ?? '';
    if (!/^(?:0|[1-9]\d*)(?:[.,]\d{1,3})?$/.test(raw.trim())) { setError(`Escribe una cantidad válida para ${item.product_name}.`); return; }
    setSavingId(item.id); setError('');
    try { const quantity = Number(raw.replace(',', '.')); await setCountedQuantity(db, count!.id, item.id, quantity); setDrafts((current) => ({ ...current, [item.id]: String(quantity) })); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, counted_quantity: quantity, counted_at: new Date().toISOString() } : entry)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la cantidad.'); }
    finally { setSavingId(null); }
  };

  const closeCount = async () => {
    if (!count) return;
    const pendingSaves = items.filter((item) => drafts[item.id] !== undefined && drafts[item.id] !== (item.counted_quantity === null ? '' : String(item.counted_quantity)));
    if (pendingSaves.length) { setError('Guarda las cantidades modificadas antes de cerrar el conteo.'); return; }
    setBusy(true); setError('');
    try {
      const result = await completeInventoryCount(db, count.id, user?.name);
      await refresh();
      Alert.alert('Conteo aplicado', `${result.changedProducts} productos ajustados · ${result.changedUnits.toLocaleString('es-MX')} ${result.changedUnits === 1 ? 'unidad de diferencia' : 'unidades de diferencia'}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cerrar el conteo.'); }
    finally { setBusy(false); }
  };

  const cancelCount = () => {
    if (!count) return;
    Alert.alert('Cancelar conteo', 'Se descartarán las cantidades capturadas y no se cambiarán existencias.', [
      { text: 'Seguir contando', style: 'cancel' },
      { text: 'Cancelar conteo', style: 'destructive', onPress: () => { void cancelInventoryCount(db, count.id, user?.name).then(refresh); } },
    ]);
  };

  const normalized = query.trim().toLocaleLowerCase('es-MX');
  const visibleItems = normalized ? items.filter((item) => `${item.product_name} ${item.barcode ?? ''} ${item.sku ?? ''}`.toLocaleLowerCase('es-MX').includes(normalized)) : items;
  const counted = items.filter((item) => item.counted_quantity !== null && drafts[item.id] === String(item.counted_quantity)).length;
  const allCounted = Boolean(count) && counted === items.length;

  return <View style={styles.page}>
    <View style={styles.content}>
      <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>INVENTARIO</Text><Text style={styles.title}>Conteo físico</Text><Text style={styles.body}>Cuenta existencias y compara con el sistema. Los movimientos posteriores a cada captura se conservan al aplicar el ajuste.</Text></View>{count ? <View style={styles.countBadge}><Text style={styles.countBadgeText}>#{count.count_number}</Text></View> : null}</View>
      {!count ? <View><Text style={styles.body}>Inicia un conteo para guardar una fotografía del catálogo activo. Puedes salir y reanudarlo después.</Text><Pressable disabled={busy} onPress={() => void begin()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Iniciando…' : 'Iniciar conteo físico'}</Text></Pressable><Pressable onPress={() => router.back()} style={styles.secondary}><Text style={styles.secondaryText}>Volver a Inventario</Text></Pressable></View> : <>
        <Text style={styles.body}>{counted} de {items.length} productos contados · {items.length - counted} pendientes · {new Date(count.started_at).toLocaleString('es-MX')}</Text>
        <TextInput accessibilityLabel="Filtrar productos del conteo" value={query} onChangeText={setQuery} placeholder="Buscar producto, clave o código" placeholderTextColor={theme.colors.muted} style={styles.search} />
        <View style={styles.scanRow}><TextInput accessibilityLabel="Código de barras" value={barcode} onChangeText={setBarcode} onSubmitEditing={() => void scanCode(barcode)} returnKeyType="search" placeholder="Escanear o escribir código" placeholderTextColor={theme.colors.muted} style={styles.scanInput} /><Pressable onPress={() => void scanCode(barcode)} style={styles.scanButton}><Text style={styles.scanButtonText}>Buscar código</Text></Pressable><Pressable onPress={() => void openScanner()} style={styles.scanButton}><Text style={styles.scanButtonText}>Cámara</Text></Pressable></View>
        <View style={styles.actions}><Pressable disabled={busy || !allCounted} onPress={() => void closeCount()} style={[styles.primary, (busy || !allCounted) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Aplicando…' : 'Cerrar y aplicar diferencias'}</Text></Pressable><Pressable disabled={busy} onPress={cancelCount} style={styles.secondary}><Text style={styles.secondaryText}>Cancelar conteo</Text></Pressable></View>
        <Text style={styles.body}>Ingresa la cantidad física en la unidad base y guarda cada producto. Para contar cero, captura 0.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <FlatList data={visibleItems} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 28 }} ListEmptyComponent={<Text style={styles.empty}>{items.length ? 'No hay coincidencias.' : 'No hay productos activos para contar.'}</Text>} renderItem={({ item }) => {
          const value = drafts[item.id] ?? '';
          const isSaved = item.counted_quantity !== null && value === String(item.counted_quantity);
          return <View style={[styles.item, selectedId === item.id && styles.itemSelected]}><View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.itemName}>{item.product_name}</Text><Text style={styles.itemMeta}>{item.barcode ? `Barras ${item.barcode} · ` : ''}Sistema al inicio: {item.system_quantity} {item.unit_name}</Text></View><TextInput accessibilityLabel={`Cantidad contada de ${item.product_name}`} value={value} onChangeText={(next) => setDrafts((current) => ({ ...current, [item.id]: next }))} placeholder="Cantidad" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" style={styles.qtyInput} /></View><View style={[styles.row, { justifyContent: 'space-between', marginTop: 7 }]}>{isSaved ? <Text style={styles.saved}>Guardado · diferencia {Number(item.counted_quantity! - item.system_quantity).toLocaleString('es-MX')} {item.unit_name}</Text> : <Text style={styles.itemMeta}>Pendiente de guardar</Text>}<Pressable disabled={savingId === item.id} onPress={() => void saveItem(item)}><Text style={styles.scanButtonText}>{savingId === item.id ? 'Guardando…' : 'Guardar'}</Text></Pressable></View></View>;
        }} />
      </>}
    </View>

  </View>;
}
