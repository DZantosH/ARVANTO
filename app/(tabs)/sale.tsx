import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { theme } from '@/constants/Theme';
import { getRecentSales, getSaleReceipt, getOpenCashSession, searchSaleProducts, completeSale, type SaleReceipt, type SaleSummary } from '@/src/database/posRepository';
import { formatCurrencyFromCents, parseCurrencyToCents } from '@/src/domain/money';
import { getCartTotalCents, type CartLine } from '@/src/domain/sales';

type ProductRow = { id: string; name: string; sku: string | null; price_cents: number; cost_cents: number; stock_quantity: number };

export default function SaleScreen() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState('');
  const [openSession, setOpenSession] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const total = useMemo(() => getCartTotalCents(cart), [cart]);

  const refresh = useCallback(async () => {
    try {
      const [recent, session] = await Promise.all([getRecentSales(db), getOpenCashSession(db)]);
      setSales(recent);
      setOpenSession(Boolean(session));
      setError('');
    } catch {
      setError('No se pudo cargar la información de venta.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const search = async (value: string) => {
    setQuery(value);
    setSearching(true);
    try { setProducts(await searchSaleProducts(db, value)); }
    catch { setError('No se pudo buscar en el catálogo.'); }
    finally { setSearching(false); }
  };

  const addProduct = (product: ProductRow) => {
    if (product.stock_quantity <= 0) { setError(`${product.name} no tiene existencia disponible.`); return; }
    setError('');
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) { setError(`Existencia insuficiente de ${product.name}.`); return current; }
        return current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { productId: product.id, name: product.name, sku: product.sku, unitPriceCents: product.price_cents, unitCostCents: product.cost_cents, stock: product.stock_quantity, quantity: 1 }];
    });
  };

  const changeQuantity = (line: CartLine, delta: number) => setCart((current) => current.flatMap((item) => {
    if (item.productId !== line.productId) return [item];
    const quantity = item.quantity + delta;
    if (quantity <= 0) return [];
    if (quantity > item.stock) { setError(`Existencia insuficiente de ${item.name}.`); return [item]; }
    return [{ ...item, quantity }];
  }));

  const finishSale = async (payments: { cashCents: number; cardCents: number; transferCents: number; cashTenderedCents: number }) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await completeSale(db, cart, payments);
      setCart([]);
      setCheckoutVisible(false);
      setReceipt(result);
      await refresh();
      setProducts(await searchSaleProducts(db, query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo registrar la venta.');
    } finally { saveLock.current = false; setSaving(false); }
  };

  const openReceipt = async (id: string) => {
    const detail = await getSaleReceipt(db, id);
    if (detail) setReceipt(detail);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.eyebrow}>PUNTO DE VENTA</Text><Text style={styles.title}>Nueva venta</Text></View>
        <View style={[styles.shiftBadge, openSession ? styles.shiftOpen : styles.shiftClosed]}><Text style={styles.shiftText}>{openSession ? 'Caja abierta' : 'Caja cerrada'}</Text></View>
      </View>
      {!openSession ? <Pressable onPress={() => Alert.alert('Caja cerrada', 'Abre un turno en la pestaña Caja para comenzar a vender.')} style={styles.notice}><Text style={styles.noticeText}>Abre la caja antes de cobrar una venta.</Text></Pressable> : null}
      <View style={styles.searchBox}><Text style={styles.searchIcon}>⌕</Text><TextInput accessibilityLabel="Buscar producto para vender" value={query} onChangeText={(value) => void search(value)} placeholder="Buscar producto o clave" placeholderTextColor={theme.colors.muted} style={styles.searchInput} autoCorrect={false} /></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={[styles.columns, width < 760 && styles.mobileColumns]}>
        <View style={styles.catalog}>
          <Text style={styles.sectionTitle}>{query ? 'Resultados' : 'Catálogo'}</Text>
          {searching ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : products.length ? products.map((product) => (
            <Pressable key={product.id} disabled={!openSession} onPress={() => addProduct(product)} style={styles.productCard}>
              <View style={styles.rowBetween}><Text style={styles.productName} numberOfLines={1}>{product.name}</Text><Text style={styles.price}>{formatCurrencyFromCents(product.price_cents)}</Text></View>
              <Text style={styles.meta}>{product.sku ? `Clave ${product.sku}` : 'Sin clave'} · Existencia ${product.stock_quantity}</Text>
            </Pressable>
          )) : <Text style={styles.emptyText}>{query ? 'Sin coincidencias.' : 'Escribe para buscar en el catálogo.'}</Text>}
        </View>
        <View style={[styles.cartPanel, width < 760 && styles.mobileCartPanel]}>
          <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Carrito</Text><Pressable disabled={!cart.length} onPress={() => setCart([])}><Text style={styles.clear}>Vaciar</Text></Pressable></View>
          <ScrollView style={styles.cartList} contentContainerStyle={styles.cartContent}>
            {cart.map((line) => <View key={line.productId} style={styles.cartLine}>
              <Text style={styles.productName} numberOfLines={1}>{line.name}</Text>
              <View style={styles.rowBetween}>
                <View style={styles.quantityControls}><Pressable accessibilityLabel={`Quitar una unidad de ${line.name}`} onPress={() => changeQuantity(line, -1)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>−</Text></Pressable><Text style={styles.quantity}>{line.quantity}</Text><Pressable accessibilityLabel={`Agregar una unidad de ${line.name}`} onPress={() => changeQuantity(line, 1)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>＋</Text></Pressable></View>
                <Text style={styles.lineTotal}>{formatCurrencyFromCents(Math.round(line.unitPriceCents * line.quantity))}</Text>
              </View>
            </View>)}
            {!cart.length ? <Text style={styles.emptyText}>Agrega productos para empezar.</Text> : null}
          </ScrollView>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{formatCurrencyFromCents(total)}</Text></View>
          <Pressable disabled={!openSession || !cart.length || saving} onPress={() => setCheckoutVisible(true)} style={[styles.primaryButton, (!openSession || !cart.length) && styles.disabled]}><Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Cobrar'}</Text></Pressable>
        </View>
      </View>
      <View style={styles.history}>
        <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Ventas recientes</Text><Text style={styles.meta}>Últimas 30</Text></View>
        {loading ? <ActivityIndicator color={theme.colors.primary} /> : sales.length ? <FlatList horizontal data={sales} keyExtractor={(sale) => sale.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.salesStrip} renderItem={({ item }) => <Pressable onPress={() => void openReceipt(item.id)} style={styles.saleChip}><Text style={styles.saleChipTitle}>Ticket #{item.ticket_number}</Text><Text style={styles.saleChipAmount}>{formatCurrencyFromCents(item.total_cents)}</Text></Pressable>} /> : <Text style={styles.emptyText}>Aún no hay ventas registradas.</Text>}
      </View>
      {checkoutVisible ? <CheckoutModal visible totalCents={total} saving={saving} onClose={() => setCheckoutVisible(false)} onSubmit={finishSale} /> : null}
      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </View>
  );
}

function CheckoutModal({ visible, totalCents, saving, onClose, onSubmit }: { visible: boolean; totalCents: number; saving: boolean; onClose: () => void; onSubmit: (payments: { cashCents: number; cardCents: number; transferCents: number; cashTenderedCents: number }) => Promise<void> }) {
  const [cash, setCash] = useState(''); const [card, setCard] = useState(''); const [transfer, setTransfer] = useState(''); const [tendered, setTendered] = useState(''); const [error, setError] = useState('');
  const parse = (value: string) => value.trim() ? parseCurrencyToCents(value) : 0;
  const submit = async () => {
    try {
      const cashCents = parse(cash); const cardCents = parse(card); const transferCents = parse(transfer);
      const cashTenderedCents = cash.trim() ? (tendered.trim() ? parse(tendered) : cashCents) : 0;
      if (cashCents + cardCents + transferCents !== totalCents) { setError('La suma de los métodos debe ser igual al total.'); return; }
      if (cashTenderedCents < cashCents) { setError('El efectivo recibido no cubre el importe en efectivo.'); return; }
      setError(''); await onSubmit({ cashCents, cardCents, transferCents, cashTenderedCents });
    } catch { setError('Escribe importes válidos con hasta dos decimales.'); }
  };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={styles.modalPage}><Text style={styles.eyebrow}>CONFIRMAR COBRO</Text><Text style={styles.modalTitle}>Total {formatCurrencyFromCents(totalCents)}</Text>
      <Text style={styles.fieldLabel}>Efectivo aplicado</Text><TextInput value={cash} onChangeText={setCash} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>Tarjeta</Text><TextInput value={card} onChangeText={setCard} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>Transferencia</Text><TextInput value={transfer} onChangeText={setTransfer} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>Efectivo recibido (para calcular cambio)</Text><TextInput value={tendered} onChangeText={setTendered} placeholder="Igual al efectivo aplicado" keyboardType="decimal-pad" style={styles.input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.modalActions}><Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Volver</Text></Pressable><Pressable disabled={saving} onPress={() => void submit()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Confirmar venta'}</Text></Pressable></View>
      <Text style={styles.help}>Captura efectivo, tarjeta o transferencia. Para un pago mixto, distribuye el total entre los campos.</Text>
    </View>
  </Modal>;
}

function ReceiptModal({ receipt, onClose }: { receipt: SaleReceipt | null; onClose: () => void }) {
  return <Modal visible={Boolean(receipt)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {receipt ? <ScrollView contentContainerStyle={styles.receiptPage}><Text style={styles.eyebrow}>VENTA COMPLETADA</Text><Text style={styles.modalTitle}>Ticket #{receipt.ticket_number}</Text><Text style={styles.receiptDate}>{new Date(receipt.created_at).toLocaleString('es-MX')}</Text>
      {receipt.items.map((item, index) => <View key={`${item.product_name}-${index}`} style={styles.receiptLine}><View style={{ flex: 1 }}><Text style={styles.productName}>{item.product_name}</Text><Text style={styles.meta}>{item.quantity} × {formatCurrencyFromCents(item.unit_price_cents)}</Text></View><Text style={styles.lineTotal}>{formatCurrencyFromCents(item.line_total_cents)}</Text></View>)}
      <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{formatCurrencyFromCents(receipt.total_cents)}</Text></View>
      {receipt.payments.map((payment) => <Text key={payment.method} style={styles.meta}>{payment.method === 'cash' ? 'Efectivo' : payment.method === 'card' ? 'Tarjeta' : 'Transferencia'} · {formatCurrencyFromCents(payment.amount_cents)}</Text>)}
      {receipt.change_cents ? <Text style={styles.change}>Cambio · {formatCurrencyFromCents(receipt.change_cents)}</Text> : null}
      <Pressable onPress={onClose} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Listo</Text></Pressable>
    </ScrollView> : null}
  </Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, padding: 16, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, headerCopy: { flex: 1 }, eyebrow: { color: theme.colors.primary, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }, title: { color: theme.colors.text, fontSize: 26, fontWeight: '800', marginTop: 3 }, shiftBadge: { borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8 }, shiftOpen: { backgroundColor: theme.colors.primarySoft }, shiftClosed: { backgroundColor: '#FFF0EF' }, shiftText: { color: theme.colors.primary, fontSize: 11, fontWeight: '800' }, notice: { padding: 10, backgroundColor: '#FFF6E8', borderRadius: 10, marginBottom: 9 }, noticeText: { color: '#8A5B1B', fontSize: 12, fontWeight: '700' }, searchBox: { minHeight: 46, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10 }, searchIcon: { fontSize: 22, color: theme.colors.muted, marginRight: 8 }, searchInput: { flex: 1, color: theme.colors.text, fontSize: 14 }, error: { color: theme.colors.danger, fontSize: 12, marginBottom: 7 }, columns: { flex: 1, flexDirection: 'row', gap: 10, minHeight: 260 }, mobileColumns: { flexDirection: 'column' }, catalog: { flex: 1.15, minWidth: 0 }, cartPanel: { flex: 0.85, minWidth: 0, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 12 }, mobileCartPanel: { flex: 0, minHeight: 220, maxHeight: 280 }, sectionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 9 }, loader: { marginTop: 30 }, productCard: { padding: 12, backgroundColor: theme.colors.surface, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 8 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, productName: { color: theme.colors.text, fontSize: 13, fontWeight: '700', flex: 1 }, price: { color: theme.colors.primary, fontSize: 13, fontWeight: '800' }, meta: { color: theme.colors.muted, fontSize: 10, marginTop: 4 }, emptyText: { color: theme.colors.muted, fontSize: 12, marginVertical: 10 }, clear: { color: theme.colors.danger, fontSize: 11, fontWeight: '700' }, cartList: { flex: 1 }, cartContent: { gap: 9 }, cartLine: { borderBottomWidth: 1, borderColor: theme.colors.border, paddingBottom: 8, gap: 7 }, quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 10 }, quantityButton: { backgroundColor: theme.colors.primarySoft, width: 28, height: 28, borderRadius: 9, justifyContent: 'center', alignItems: 'center' }, quantityButtonText: { color: theme.colors.primary, fontSize: 17, fontWeight: '800' }, quantity: { color: theme.colors.text, fontWeight: '700', minWidth: 18, textAlign: 'center' }, lineTotal: { color: theme.colors.text, fontSize: 12, fontWeight: '800' }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderColor: theme.colors.border, marginTop: 8 }, totalLabel: { color: theme.colors.text, fontWeight: '700', fontSize: 14 }, total: { color: theme.colors.primary, fontWeight: '900', fontSize: 19 }, primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.control, backgroundColor: theme.colors.primary, paddingHorizontal: 15 }, primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 }, disabled: { opacity: 0.45 }, history: { paddingTop: 10, maxHeight: 110 }, salesStrip: { gap: 8 }, saleChip: { backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 13, paddingVertical: 9, minWidth: 118 }, saleChipTitle: { color: theme.colors.muted, fontSize: 10 }, saleChipAmount: { color: theme.colors.text, fontWeight: '800', marginTop: 4 }, modalPage: { flex: 1, padding: 22, backgroundColor: theme.colors.background }, modalTitle: { color: theme.colors.text, fontSize: 25, fontWeight: '900', marginTop: 5, marginBottom: 14 }, fieldLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '700', marginTop: 9, marginBottom: 5 }, input: { backgroundColor: theme.colors.surface, minHeight: 47, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, paddingHorizontal: 12, color: theme.colors.text, fontSize: 15 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 }, secondaryButton: { minHeight: 48, flex: 0.7, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.control, backgroundColor: '#E9EDF0' }, secondaryText: { color: theme.colors.text, fontWeight: '700' }, help: { color: theme.colors.muted, fontSize: 11, marginTop: 14, lineHeight: 17 }, receiptPage: { flexGrow: 1, padding: 22, backgroundColor: theme.colors.background }, receiptDate: { color: theme.colors.muted, fontSize: 12, marginBottom: 15 }, receiptLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border }, change: { color: theme.colors.primary, fontWeight: '700', marginVertical: 12 },
});
