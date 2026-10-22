import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { getRecentSales, getSaleReceipt, getOpenCashSession, searchSaleProducts, completeSale, cancelSale, returnSaleItems, getOpenSalesDocuments, saveSalesDocument, loadSalesDocument, cancelSalesDocument, type SalesDocument, type SaleReceipt, type SaleSummary } from '@/src/database/posRepository';
import { formatCurrencyFromCents, parseCurrencyToCents } from '@/src/domain/money';
import { getCartTotalCents, type CartLine } from '@/src/domain/sales';
import { printSaleReceipt, printSalesDocument } from '@/src/infrastructure/printing';
import { getCustomers, type Customer } from '@/src/database/businessRepository';
import { useAuth } from '@/src/ui/AuthProvider';

type ProductRow = { id: string; name: string; sku: string | null; barcode: string | null; price_cents: number; cost_cents: number; stock_quantity: number; unit_name: string; sale_unit_name: string; sale_unit_factor: number; sale_unit_price_cents: number | null };

export default function SaleScreen() {
  const { theme, styles } = useThemeStyles();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [discountInput, setDiscountInput] = useState('0.00');
  const [taxRateInput, setTaxRateInput] = useState('0');
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [error, setError] = useState('');
  const [openSession, setOpenSession] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const subtotal = useMemo(() => getCartTotalCents(cart), [cart]);
  const discountIsValid = useMemo(() => { try { if (discountInput.trim()) parseCurrencyToCents(discountInput); return true; } catch { return false; } }, [discountInput]);
  const discount = useMemo(() => { try { return discountInput.trim() ? parseCurrencyToCents(discountInput) : 0; } catch { return 0; } }, [discountInput]);
  const taxRate = Number(taxRateInput.replace(',', '.'));
  const tax = Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100 ? Math.round(Math.max(0, subtotal - discount) * taxRate / 100) : 0;
  const total = Math.max(0, subtotal - discount + tax);

  const refresh = useCallback(async () => {
    try {
      const [recent, session, activeCustomers, openDocs] = await Promise.all([getRecentSales(db), getOpenCashSession(db), getCustomers(db), getOpenSalesDocuments(db)]);
      setSales(recent);
      setCustomers(activeCustomers.filter((customer) => customer.is_active));
      setDocuments(openDocs);
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

  const addProduct = (product: ProductRow, alternate = false) => {
    const factor = alternate ? product.sale_unit_factor : 1;
    const unitName = alternate ? product.sale_unit_name : product.unit_name;
    const unitPrice = alternate ? product.sale_unit_price_cents ?? Math.round(product.price_cents * factor) : product.price_cents;
    const unitStock = product.stock_quantity / factor;
    if (unitStock <= 0) { setError(`${product.name} no tiene existencia disponible.`); return; }
    setError('');
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id && line.unitName === unitName);
      if (existing) {
        if (existing.quantity + 1 > unitStock) { setError(`Existencia insuficiente de ${product.name}.`); return current; }
        return current.map((line) => line.productId === product.id && line.unitName === unitName ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { productId: product.id, name: product.name, sku: product.sku, unitPriceCents: unitPrice, unitCostCents: product.cost_cents, stock: unitStock, quantity: 1, unitName, inventoryFactor: factor }];
    });
  };

  const changeQuantity = (line: CartLine, delta: number) => setCart((current) => current.flatMap((item) => {
    if (item.productId !== line.productId || item.unitName !== line.unitName) return [item];
    const quantity = item.quantity + delta;
    if (quantity <= 0) return [];
    if (quantity > item.stock) { setError(`Existencia insuficiente de ${item.name}.`); return [item]; }
    return [{ ...item, quantity }];
  }));

  const finishSale = async (payment: { cashCents: number; cardCents: number; transferCents: number; cashTenderedCents: number; customerId: string | null; creditCents: number }) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const result = await completeSale(db, cart, payment, payment.customerId, payment.creditCents, user?.name, { discountCents: discount, taxCents: tax, documentId: activeDocumentId });
      setCart([]);
      setActiveDocumentId(null); setDiscountInput('0.00'); setTaxRateInput('0');
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

  const saveDocument = async (kind: 'quote'|'layaway') => {
    try {
      if (!cart.length) { setError('Agrega productos antes de guardar.'); return; }
      if (!discountIsValid || discount > subtotal || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) { setError('Revisa el descuento y la tasa de impuesto.'); return; }
      await saveSalesDocument(db, kind, cart, { subtotalCents: subtotal, discountCents: discount, taxCents: tax, totalCents: total }, documentName, null, user?.name);
      setDocumentVisible(false); setDocumentName(''); setCart([]); setActiveDocumentId(null); setDiscountInput('0.00'); setTaxRateInput('0');
      await refresh();
      Alert.alert(kind === 'quote' ? 'Cotización guardada' : 'Apartado guardado', kind === 'quote' ? 'La cotización vence en 30 días.' : 'El inventario queda reservado hasta completar o cancelar el apartado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar el documento.'); }
  };

  const resumeDocument = async (document: SalesDocument) => {
    try {
      const loaded = await loadSalesDocument(db, document.id);
      if (!loaded) { setError('El documento ya no está abierto.'); await refresh(); return; }
      setCart(loaded.lines); setDiscountInput((loaded.document.discount_cents / 100).toFixed(2));
      setTaxRateInput(loaded.document.subtotal_cents > loaded.document.discount_cents ? (loaded.document.tax_cents * 100 / (loaded.document.subtotal_cents - loaded.document.discount_cents)).toFixed(6) : '0');
      setActiveDocumentId(document.id); setError('');
    } catch { setError('No se pudo cargar el documento.'); }
  };

  const manageSale = async (action: 'cancel'|'return', selectedLines?: { saleItemId: string; quantity: number }[]) => {
    if (!receipt) return;
    try {
      if (action === 'cancel') await cancelSale(db, receipt.id, 'Cancelación autorizada', user?.name);
      else {
        const remaining = selectedLines?.length ? selectedLines : receipt.items.filter((item) => item.quantity > item.returned_quantity).map((item) => ({ saleItemId: item.id, quantity: item.quantity - item.returned_quantity }));
        if (!remaining.length) { Alert.alert('Sin partidas pendientes', 'Todas las partidas ya fueron devueltas.'); return; }
        await returnSaleItems(db, receipt.id, remaining, 'Devolución de mostrador', user?.name);
      }
      setReceipt(null); await refresh();
      Alert.alert(action === 'cancel' ? 'Venta cancelada' : 'Devolución registrada', 'Se actualizó el inventario, caja y saldo de crédito. Los reembolsos con tarjeta o transferencia deben procesarse en la terminal o banco.');
    } catch (caught) { Alert.alert('No se pudo completar', caught instanceof Error ? caught.message : 'Revisa la venta y la caja abierta.'); }
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
            <View key={product.id} style={styles.productCard}>
              <Pressable disabled={!openSession} onPress={() => addProduct(product)}>
                <View style={styles.rowBetween}><Text style={styles.productName} numberOfLines={1}>{product.name}</Text><Text style={styles.price}>{formatCurrencyFromCents(product.price_cents)} / {product.unit_name}</Text></View>
                <Text style={styles.meta}>{product.sku ? `Clave ${product.sku}` : 'Sin clave'}{product.barcode ? ` · ${product.barcode}` : ''} · Existencia {product.stock_quantity} {product.unit_name}</Text>
              </Pressable>
              {product.sale_unit_name ? <Pressable disabled={!openSession || product.stock_quantity < product.sale_unit_factor} onPress={() => addProduct(product, true)} style={styles.alternateUnit}><Text style={styles.price}>＋ {product.sale_unit_name} × {product.sale_unit_factor} · {formatCurrencyFromCents(product.sale_unit_price_cents ?? Math.round(product.price_cents * product.sale_unit_factor))}</Text></Pressable> : null}
            </View>
          )) : <Text style={styles.emptyText}>{query ? 'Sin coincidencias.' : 'Escribe para buscar en el catálogo.'}</Text>}
        </View>
        <View style={[styles.cartPanel, width < 760 && styles.mobileCartPanel]}>
          <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Carrito</Text><Pressable disabled={!cart.length} onPress={() => setCart([])}><Text style={styles.clear}>Vaciar</Text></Pressable></View>
          <ScrollView style={styles.cartList} contentContainerStyle={styles.cartContent}>
            {cart.map((line) => <View key={`${line.productId}:${line.unitName ?? 'base'}`} style={styles.cartLine}>
              <Text style={styles.productName} numberOfLines={1}>{line.name} · {line.unitName ?? 'pieza'}</Text>
              <View style={styles.rowBetween}>
                <View style={styles.quantityControls}><Pressable accessibilityLabel={`Quitar una unidad de ${line.name}`} onPress={() => changeQuantity(line, -1)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>−</Text></Pressable><Text style={styles.quantity}>{line.quantity}</Text><Pressable accessibilityLabel={`Agregar una unidad de ${line.name}`} onPress={() => changeQuantity(line, 1)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>＋</Text></Pressable></View>
                <Text style={styles.lineTotal}>{formatCurrencyFromCents(Math.round(line.unitPriceCents * line.quantity))}</Text>
              </View>
            </View>)}
            {!cart.length ? <Text style={styles.emptyText}>Agrega productos para empezar.</Text> : null}
          </ScrollView>
          <View style={styles.adjustmentRow}><Text style={styles.fieldLabel}>Descuento ($)</Text><TextInput value={discountInput} onChangeText={setDiscountInput} keyboardType="decimal-pad" style={styles.adjustmentInput} /></View>
          <View style={styles.adjustmentRow}><Text style={styles.fieldLabel}>Impuesto (%)</Text><TextInput value={taxRateInput} onChangeText={setTaxRateInput} keyboardType="decimal-pad" style={styles.adjustmentInput} /></View>
          <Text style={styles.meta}>Subtotal {formatCurrencyFromCents(subtotal)} · Desc. {formatCurrencyFromCents(discount)} · Imp. {formatCurrencyFromCents(tax)}</Text>
          <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{formatCurrencyFromCents(total)}</Text></View>
          <View style={styles.documentActions}><Pressable disabled={!cart.length} onPress={() => { setDocumentName(''); setDocumentVisible(true); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cotizar</Text></Pressable><Pressable disabled={!cart.length} onPress={() => { setDocumentName(''); setDocumentVisible(true); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Apartar</Text></Pressable></View>
          <Pressable disabled={!openSession || !cart.length || saving || !discountIsValid || discount > subtotal || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100} onPress={() => setCheckoutVisible(true)} style={[styles.primaryButton, (!openSession || !cart.length || !discountIsValid || discount > subtotal || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) && styles.disabled]}><Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Cobrar'}</Text></Pressable>
        </View>
      </View>
      {documents.length ? <View style={styles.history}><Text style={styles.sectionTitle}>Cotizaciones y apartados abiertos</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.salesStrip}>{documents.map((doc) => <View key={doc.id} style={styles.documentChip}><Text style={styles.saleChipTitle}>{doc.kind === 'quote' ? 'Cotización' : 'Apartado'} #{doc.document_number}</Text><Text style={styles.meta}>{doc.customer_name || 'Sin cliente'} · {formatCurrencyFromCents(doc.total_cents)}</Text><View style={styles.documentActions}><Pressable onPress={() => void resumeDocument(doc)}><Text style={styles.price}>Cargar</Text></Pressable><Pressable onPress={() => { void loadSalesDocument(db, doc.id).then((loaded) => loaded && printSalesDocument(loaded.document, loaded.lines)).catch(() => Alert.alert('Impresión no disponible', 'No se pudo preparar el documento.')); }}><Text style={styles.price}>Imprimir</Text></Pressable><Pressable onPress={() => Alert.alert('Cancelar documento', '¿Liberar este documento?', [{ text: 'Volver' }, { text: 'Cancelar documento', style: 'destructive', onPress: () => { void cancelSalesDocument(db, doc.id).then(refresh); } }])}><Text style={styles.clear}>Cancelar</Text></Pressable></View></View>)}</ScrollView></View> : null}
      <View style={styles.history}>
        <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Ventas recientes</Text><Text style={styles.meta}>Últimas 30</Text></View>
        {loading ? <ActivityIndicator color={theme.colors.primary} /> : sales.length ? <FlatList horizontal data={sales} keyExtractor={(sale) => sale.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.salesStrip} renderItem={({ item }) => <Pressable onPress={() => void openReceipt(item.id)} style={styles.saleChip}><Text style={styles.saleChipTitle}>Ticket #{item.ticket_number}</Text><Text style={styles.saleChipAmount}>{formatCurrencyFromCents(item.total_cents)}</Text></Pressable>} /> : <Text style={styles.emptyText}>Aún no hay ventas registradas.</Text>}
      </View>
      {checkoutVisible ? <CheckoutModal visible totalCents={total} saving={saving} customers={customers} onClose={() => setCheckoutVisible(false)} onSubmit={finishSale} /> : null}
      {documentVisible ? <DocumentModal onClose={() => setDocumentVisible(false)} onSave={saveDocument} customerName={documentName} setCustomerName={setDocumentName} /> : null}
      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} onCancel={() => void manageSale('cancel')} onReturn={(lines) => void manageSale('return', lines)} canManage={user?.role !== 'cashier'} /> : null}
    </View>
  );
}

function CheckoutModal({ visible, totalCents, saving, customers, onClose, onSubmit }: { visible: boolean; totalCents: number; saving: boolean; customers: Customer[]; onClose: () => void; onSubmit: (payment: { cashCents: number; cardCents: number; transferCents: number; cashTenderedCents: number; customerId: string | null; creditCents: number }) => Promise<void> }) {
  const { styles } = useThemeStyles();
  const [cash, setCash] = useState(''); const [card, setCard] = useState(''); const [transfer, setTransfer] = useState(''); const [tendered, setTendered] = useState(''); const [credit, setCredit] = useState(''); const [customerId, setCustomerId] = useState<string | null>(null); const [error, setError] = useState('');
  const parse = (value: string) => value.trim() ? parseCurrencyToCents(value) : 0;
  const submit = async () => {
    try {
      const cashCents = parse(cash); const cardCents = parse(card); const transferCents = parse(transfer);
      const creditCents = parse(credit);
      const cashTenderedCents = cash.trim() ? (tendered.trim() ? parse(tendered) : cashCents) : 0;
      if (cashCents + cardCents + transferCents + creditCents !== totalCents) { setError('La suma de los pagos y crédito debe ser igual al total.'); return; }
      if (creditCents > 0 && !customerId) { setError('Selecciona un cliente para la parte a crédito.'); return; }
      if (cashTenderedCents < cashCents) { setError('El efectivo recibido no cubre el importe en efectivo.'); return; }
      setError(''); await onSubmit({ cashCents, cardCents, transferCents, cashTenderedCents, customerId, creditCents });
    } catch { setError('Escribe importes válidos con hasta dos decimales.'); }
  };
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={styles.modalPage}><Text style={styles.eyebrow}>CONFIRMAR COBRO</Text><Text style={styles.modalTitle}>Total {formatCurrencyFromCents(totalCents)}</Text>
      <Text style={styles.fieldLabel}>Efectivo aplicado</Text><TextInput value={cash} onChangeText={setCash} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>Tarjeta</Text><TextInput value={card} onChangeText={setCard} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>Transferencia</Text><TextInput value={transfer} onChangeText={setTransfer} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      <Text style={styles.fieldLabel}>A crédito</Text><TextInput value={credit} onChangeText={setCredit} placeholder="0.00" keyboardType="decimal-pad" style={styles.input} />
      {Number(credit.replace(',', '.')) > 0 ? <><Text style={styles.fieldLabel}>Cliente responsable</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.salesStrip}>{customers.map((customer) => <Pressable key={customer.id} onPress={() => setCustomerId(customer.id)} style={[styles.saleChip, customerId === customer.id && { borderColor: '#FF6720' }]}><Text style={styles.saleChipTitle}>{customer.name}</Text><Text style={styles.saleChipAmount}>Saldo {formatCurrencyFromCents(customer.balance_cents)}</Text></Pressable>)}</ScrollView></> : null}
      <Text style={styles.fieldLabel}>Efectivo recibido (para calcular cambio)</Text><TextInput value={tendered} onChangeText={setTendered} placeholder="Igual al efectivo aplicado" keyboardType="decimal-pad" style={styles.input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.modalActions}><Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Volver</Text></Pressable><Pressable disabled={saving} onPress={() => void submit()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{saving ? 'Guardando…' : 'Confirmar venta'}</Text></Pressable></View>
      <Text style={styles.help}>Captura efectivo, tarjeta o transferencia. Para un pago mixto, distribuye el total entre los campos.</Text>
    </View>
  </Modal>;
}

function ReceiptModal({ receipt, onClose, onCancel, onReturn, canManage }: { receipt: SaleReceipt | null; onClose: () => void; onCancel: () => void; onReturn: (lines: { saleItemId: string; quantity: number }[]) => void; canManage: boolean }) {
  const { styles } = useThemeStyles();
  const [printing, setPrinting] = useState(false);
  const [returnSelection, setReturnSelection] = useState<Record<string, string>>({});
  const print = async () => {
    if (!receipt || printing) return;
    setPrinting(true);
    try { await printSaleReceipt(receipt); }
    catch { Alert.alert('Impresión no disponible', 'Revisa que el dispositivo tenga configurado un servicio de impresión.'); }
    finally { setPrinting(false); }
  };
  return <Modal visible={Boolean(receipt)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    {receipt ? <ScrollView contentContainerStyle={styles.receiptPage}><Text style={styles.eyebrow}>{receipt.status === 'cancelled' ? 'VENTA CANCELADA' : 'DETALLE DE VENTA'}</Text><Text style={styles.modalTitle}>Ticket #{receipt.ticket_number}</Text><Text style={styles.receiptDate}>{new Date(receipt.created_at).toLocaleString('es-MX')}</Text>
      {receipt.items.map((item) => <View key={item.id} style={styles.receiptLine}><View style={{ flex: 1 }}><Text style={styles.productName}>{item.product_name}</Text><Text style={styles.meta}>{item.quantity} {item.unit_name} × {formatCurrencyFromCents(item.unit_price_cents)} · Devuelto {item.returned_quantity}</Text></View><Text style={styles.lineTotal}>{formatCurrencyFromCents(item.line_total_cents)}</Text>{canManage && receipt.status === 'completed' && item.quantity > item.returned_quantity ? <TextInput accessibilityLabel={`Cantidad a devolver de ${item.product_name}`} value={returnSelection[item.id] ?? ''} onChangeText={(value) => setReturnSelection((v) => ({ ...v, [item.id]: value }))} placeholder="0" keyboardType="decimal-pad" style={styles.returnInput} /> : null}</View>)}
      {receipt.discount_cents ? <Text style={styles.meta}>Descuento · {formatCurrencyFromCents(receipt.discount_cents)}</Text> : null}
      {receipt.tax_cents ? <Text style={styles.meta}>Impuestos · {formatCurrencyFromCents(receipt.tax_cents)}</Text> : null}
      <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{formatCurrencyFromCents(receipt.total_cents)}</Text></View>
      {receipt.payments.map((payment) => <Text key={payment.method} style={styles.meta}>{payment.method === 'cash' ? 'Efectivo' : payment.method === 'card' ? 'Tarjeta' : 'Transferencia'} · {formatCurrencyFromCents(payment.amount_cents)}</Text>)}
      {receipt.change_cents ? <Text style={styles.change}>Cambio · {formatCurrencyFromCents(receipt.change_cents)}</Text> : null}
      {receipt.credit_cents ? <Text style={styles.change}>Saldo a crédito · {formatCurrencyFromCents(receipt.credit_cents)}</Text> : null}
      {canManage && receipt.status === 'completed' ? <View style={styles.documentActions}><Pressable onPress={() => { const lines = Object.entries(returnSelection).map(([saleItemId, raw]) => ({ saleItemId, quantity: Number(raw.replace(',', '.')) })).filter((line) => Number.isFinite(line.quantity) && line.quantity > 0); if (!lines.length) { Alert.alert('Selecciona partidas', 'Escribe las cantidades que devolverás.'); return; } Alert.alert('Devolución', '¿Registrar las cantidades seleccionadas?', [{ text: 'Volver' }, { text: 'Confirmar devolución', onPress: () => onReturn(lines) }]); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Devolver seleccionadas</Text></Pressable><Pressable onPress={() => Alert.alert('Cancelar venta', 'Se restaurará el inventario y se registrará el reembolso en efectivo.', [{ text: 'Volver' }, { text: 'Cancelar venta', style: 'destructive', onPress: onCancel }])} style={styles.secondaryButton}><Text style={styles.clear}>Cancelar venta</Text></Pressable></View> : null}
      <Pressable disabled={printing} onPress={() => void print()} style={[styles.primaryButton, { marginBottom: 9 }]}><Text style={styles.primaryButtonText}>{printing ? 'Abriendo impresión…' : 'Imprimir ticket'}</Text></Pressable>
      <Pressable onPress={onClose} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Listo</Text></Pressable>
    </ScrollView> : null}
  </Modal>;
}

function DocumentModal({ onClose, onSave, customerName, setCustomerName }: { onClose: () => void; onSave: (kind: 'quote'|'layaway') => Promise<void>; customerName: string; setCustomerName: (value: string) => void }) {
  const { styles } = useThemeStyles();
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><View style={styles.modalPage}>
    <Text style={styles.eyebrow}>DOCUMENTO DE VENTA</Text><Text style={styles.modalTitle}>Guardar carrito</Text>
    <Text style={styles.fieldLabel}>Nombre del cliente (opcional)</Text><TextInput value={customerName} onChangeText={setCustomerName} placeholder="Cliente" style={styles.input} />
    <Text style={styles.help}>Las cotizaciones vencen en 30 días. Los apartados reservan inventario hasta que los canceles o completes la venta.</Text>
    <View style={styles.modalActions}><Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Volver</Text></Pressable></View>
    <View style={styles.documentActions}><Pressable onPress={() => void onSave('quote')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Guardar cotización</Text></Pressable><Pressable onPress={() => void onSave('layaway')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Guardar apartado</Text></Pressable></View>
  </View></Modal>;
}

function useThemeStyles() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
  adjustmentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, adjustmentInput: { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.control, minWidth: 90, minHeight: 40, textAlign: 'right', paddingHorizontal: 9 }, documentActions: { flexDirection: 'row', gap: 8, marginVertical: 5 }, documentChip: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, padding: 10, minWidth: 180 }, returnInput: { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.control, minWidth: 55, minHeight: 44, textAlign: 'center', paddingHorizontal: 5 }, alternateUnit: { paddingTop: 9, marginTop: 7, borderTopWidth: 1, borderColor: theme.colors.border },
  page: { flex: 1, backgroundColor: theme.colors.background, padding: 16, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, headerCopy: { flex: 1 }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }, title: { color: theme.colors.text, fontSize: 26, fontWeight: '800', marginTop: 3 }, shiftBadge: { borderRadius: theme.radius.control, paddingHorizontal: 11, paddingVertical: 8 }, shiftOpen: { backgroundColor: theme.colors.primarySoft }, shiftClosed: { backgroundColor: theme.colors.dangerSoft }, shiftText: { color: theme.colors.primaryText, fontSize: 11, fontWeight: '800' }, notice: { padding: 10, backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.control, marginBottom: 9 }, noticeText: { color: theme.colors.warning, fontSize: 12, fontWeight: '700' }, searchBox: { minHeight: 46, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 10 }, searchIcon: { fontSize: 22, color: theme.colors.muted, marginRight: 8 }, searchInput: { flex: 1, color: theme.colors.text, fontSize: 14 }, error: { color: theme.colors.danger, fontSize: 12, marginBottom: 7 }, columns: { flex: 1, flexDirection: 'row', gap: 10, minHeight: 260 }, mobileColumns: { flexDirection: 'column' }, catalog: { flex: 1.15, minWidth: 0 }, cartPanel: { flex: 0.85, minWidth: 0, backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, padding: 12 }, mobileCartPanel: { flex: 0, minHeight: 220, maxHeight: 280 }, sectionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', marginBottom: 9 }, loader: { marginTop: 30 }, productCard: { minHeight: 58, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: theme.colors.border, marginBottom: 2 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, productName: { color: theme.colors.text, fontSize: 13, fontWeight: '700', flex: 1 }, price: { color: theme.colors.primaryText, fontSize: 13, fontWeight: '800' }, meta: { color: theme.colors.muted, fontSize: 10, marginTop: 4 }, emptyText: { color: theme.colors.muted, fontSize: 12, marginVertical: 10 }, clear: { color: theme.colors.danger, fontSize: 11, fontWeight: '700' }, cartList: { flex: 1 }, cartContent: { gap: 9 }, cartLine: { borderBottomWidth: 1, borderColor: theme.colors.border, paddingBottom: 8, gap: 7 }, quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 10 }, quantityButton: { backgroundColor: theme.colors.primarySoft, width: 44, height: 44, borderRadius: theme.radius.control, justifyContent: 'center', alignItems: 'center' }, quantityButtonText: { color: theme.colors.primaryText, fontSize: 17, fontWeight: '800' }, quantity: { color: theme.colors.text, fontWeight: '700', minWidth: 18, textAlign: 'center' }, lineTotal: { color: theme.colors.text, fontSize: 12, fontWeight: '800' }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderColor: theme.colors.border, marginTop: 8 }, totalLabel: { color: theme.colors.text, fontWeight: '700', fontSize: 14 }, total: { color: theme.colors.primaryText, fontWeight: '900', fontSize: 19 }, primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.control, backgroundColor: theme.colors.primary, paddingHorizontal: 15 }, primaryButtonText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 14 }, disabled: { opacity: 0.45 }, history: { paddingTop: 10, maxHeight: 110 }, salesStrip: { gap: 8 }, saleChip: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 13, paddingVertical: 9, minWidth: 118 }, saleChipTitle: { color: theme.colors.muted, fontSize: 10 }, saleChipAmount: { color: theme.colors.text, fontWeight: '800', marginTop: 4 }, modalPage: { flex: 1, padding: 22, backgroundColor: theme.colors.background }, modalTitle: { color: theme.colors.text, fontSize: 25, fontWeight: '900', marginTop: 5, marginBottom: 14 }, fieldLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '700', marginTop: 9, marginBottom: 5 }, input: { backgroundColor: theme.colors.surface, minHeight: 47, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, paddingHorizontal: 12, color: theme.colors.text, fontSize: 15 }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 }, secondaryButton: { minHeight: 48, flex: 0.7, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.control, backgroundColor: theme.colors.background }, secondaryText: { color: theme.colors.text, fontWeight: '700' }, help: { color: theme.colors.muted, fontSize: 11, marginTop: 14, lineHeight: 17 }, receiptPage: { flexGrow: 1, padding: 22, backgroundColor: theme.colors.background }, receiptDate: { color: theme.colors.muted, fontSize: 12, marginBottom: 15 }, receiptLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border }, change: { color: theme.colors.primaryText, fontWeight: '700', marginVertical: 12 },
}), [theme]);
  return { theme, styles };
}
