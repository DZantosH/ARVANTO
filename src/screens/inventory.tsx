import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from '@/src/navigation/navigation';
import { useSQLiteContext } from '@/src/native/database';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { useAuth } from '@/src/ui/AuthProvider';
import { adjustInventory, getActiveProductOptions, getInventoryMovements, getLowStockProducts, type InventoryMovement, type ProductOption } from '@/src/database/businessRepository';

export default function InventoryScreen() {
  const { theme } = useAppTheme();
  const { user } = useAuth();
  const db = useSQLiteContext();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [lowStock, setLowStock] = useState<Awaited<ReturnType<typeof getLowStockProducts>>>([]);
  const [selected, setSelected] = useState<ProductOption | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const styles = StyleSheet.create({
    page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 18, paddingBottom: 34, maxWidth: 850, width: '100%', alignSelf: 'center' },
    eyebrow: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 10, letterSpacing: 1.4 }, title: { color: theme.colors.text, fontSize: 27, fontWeight: '900', marginTop: 4, marginBottom: 18 },
    section: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginTop: 12, marginBottom: 8 }, body: { color: theme.colors.muted, fontSize: 11, lineHeight: 16 },
    card: { padding: 13, marginBottom: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control }, picked: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, name: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: '700' }, qty: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '800' },
    input: { minHeight: 46, paddingHorizontal: 12, marginTop: 8, color: theme.colors.text, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control },
    button: { minHeight: 48, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.control }, buttonText: { color: theme.colors.onPrimary, fontWeight: '800' },
    error: { color: theme.colors.danger, fontSize: 12, marginTop: 8 },
    movement: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderColor: theme.colors.border, paddingVertical: 11 },
    alertCard: { padding: 12, marginBottom: 7, backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.control },
    alertText: { color: theme.colors.warning, fontSize: 12, fontWeight: '700' },
    actionButton: { minHeight: 50, marginBottom: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.control },
    actionText: { color: theme.colors.primaryText, fontWeight: '800' },
  });
  const refresh = useCallback(async () => { const [productOptions, recent, alerts] = await Promise.all([getActiveProductOptions(db), getInventoryMovements(db), getLowStockProducts(db)]); setProducts(productOptions); setMovements(recent); setLowStock(alerts); }, [db]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const submit = async () => {
    if (!selected) { setError('Selecciona un producto.'); return; }
    const delta = Number(quantity.replace(',', '.'));
    setBusy(true); setError('');
    try { await adjustInventory(db, selected.id, delta, reason, user?.name); setQuantity(''); setReason(''); setSelected(null); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo ajustar el inventario.'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>EXISTENCIAS</Text><Text style={styles.title}>Inventario</Text>
    <Text style={styles.body}>Registra entradas o salidas con un motivo. Cada ajuste queda en el historial.</Text>
    <Pressable onPress={() => router.push('/inventory-count' as Href)} style={styles.actionButton}><Text style={styles.actionText}>Iniciar o reanudar conteo físico</Text></Pressable>
    <Text style={styles.section}>Alertas de stock bajo · {lowStock.length}</Text>
    {lowStock.length ? lowStock.slice(0, 8).map((product) => <View key={product.id} style={styles.alertCard}><Text style={styles.alertText}>{product.name} · quedan {product.stock_quantity} {product.unit_name} · mínimo {product.minimum_stock} {product.unit_name}</Text></View>) : <Text style={styles.body}>No hay productos bajo el mínimo configurado.</Text>}
    <Text style={styles.section}>1. Selecciona el producto</Text>
    {products.map((product) => <Pressable key={product.id} onPress={() => setSelected(product)} style={[styles.card, selected?.id === product.id && styles.picked]}><View style={styles.row}><Text style={styles.name}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</Text><Text style={styles.qty}>{product.stock_quantity} {product.unit_name}</Text></View></Pressable>)}
    <Text style={styles.section}>2. Captura el ajuste</Text>
    <TextInput accessibilityLabel="Ajuste de existencia" value={quantity} onChangeText={setQuantity} placeholder={`Cantidad en ${selected?.unit_name ?? 'unidad base'}: positiva entra, negativa sale`} placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" style={styles.input} />
    <TextInput accessibilityLabel="Motivo del ajuste" value={reason} onChangeText={setReason} placeholder="Motivo del ajuste" placeholderTextColor={theme.colors.muted} maxLength={160} style={styles.input} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable disabled={busy} onPress={() => void submit()} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Guardando…' : 'Aplicar ajuste'}</Text></Pressable>
    <Text style={styles.section}>Movimientos recientes</Text>
    {movements.length ? movements.map((movement) => <View key={movement.id} style={styles.movement}><View style={{ flex: 1 }}><Text style={styles.name}>{movement.product_name}</Text><Text style={styles.body}>{movement.reason} · {movement.created_by} · {new Date(movement.created_at).toLocaleString('es-MX')}</Text></View><Text style={styles.qty}>{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta} {movement.unit_name}</Text></View>) : <Text style={styles.body}>Todavía no hay movimientos de inventario.</Text>}
  </ScrollView>;
}
