import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { ProductFormModal } from '@/components/ProductFormModal';
import { theme } from '@/constants/Theme';
import { createProduct, searchProducts, setProductActive, updateProduct, type Product, type ProductInput, type ProductStatusFilter } from '@/src/database/productsRepository';
import { formatCurrencyFromCents } from '@/src/domain/money';

const filters: { id: ProductStatusFilter; label: string }[] = [
  { id: 'active', label: 'Activos' },
  { id: 'all', label: 'Todos' },
  { id: 'inactive', label: 'Inactivos' },
];

export default function ProductsScreen() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProductStatusFilter>('active');
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const page = await searchProducts(db, query, status);
      setItems(page.items);
      setTotal(page.total);
      setError('');
    } catch {
      setError('No se pudo cargar el catálogo local. Intenta actualizar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, query, status]);

  useEffect(() => {
    const timer = setTimeout(() => void loadFirstPage(), query ? 180 : 0);
    return () => clearTimeout(timer);
  }, [loadFirstPage, query]);

  const refresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
  };

  const loadMore = async () => {
    if (loading || loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await searchProducts(db, query, status, items.length);
      setItems((previous) => [...previous, ...page.items]);
    } catch {
      setError('No se pudieron cargar más productos. Intenta actualizar.');
    } finally {
      setLoadingMore(false);
    }
  };

  const openNew = () => {
    setSelectedProduct(null);
    setFormVisible(true);
  };

  const openEdit = (product: Product) => {
    setSelectedProduct(product);
    setFormVisible(true);
  };

  const saveProduct = async (input: ProductInput) => {
    if (selectedProduct) await updateProduct(db, selectedProduct.id, input);
    else await createProduct(db, input);
    await loadFirstPage();
  };

  const changeProductStatus = async (product: Product, isActive: boolean) => {
    await setProductActive(db, product.id, isActive);
    await loadFirstPage();
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CATÁLOGO</Text>
          <Text style={styles.title}>Productos</Text>
          <Text style={styles.subtitle}>Precios y existencias de tu tienda</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={openNew} style={styles.addButton}>
          <Text style={styles.addIcon}>＋</Text>
          <Text style={styles.addText}>Nuevo</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          accessibilityLabel="Buscar productos"
          value={query}
          onChangeText={setQuery}
          placeholder="Nombre, clave o descripción"
          placeholderTextColor={theme.colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          autoCorrect={false}
        />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={() => setQuery('')}><Text style={styles.clearSearch}>×</Text></Pressable> : null}
      </View>

      <View style={styles.filterRow}>
        {filters.map((filter) => (
          <Pressable key={filter.id} accessibilityRole="button" accessibilityState={{ selected: status === filter.id }} onPress={() => setStatus(filter.id)} style={[styles.filterChip, status === filter.id && styles.filterChipSelected]}>
            <Text style={[styles.filterText, status === filter.id && styles.filterTextSelected]}>{filter.label}</Text>
          </Pressable>
        ))}
        <Text style={styles.countText}>{total} {total === 1 ? 'producto' : 'productos'}</Text>
      </View>

      {error ? <Pressable accessibilityRole="button" onPress={() => void loadFirstPage()} style={styles.errorBox}><Text style={styles.errorText}>{error} · Toca para reintentar</Text></Pressable> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ProductRow product={item} onPress={() => openEdit(item)} />}
        contentContainerStyle={[styles.listContent, items.length === 0 && styles.emptyList]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.primary} />}
        ListEmptyComponent={loading ? <ActivityIndicator color={theme.colors.primary} style={styles.spinner} /> : <EmptyState hasQuery={Boolean(query)} onAdd={openNew} />}
        ListFooterComponent={items.length < total ? (
          <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={styles.loadMore}>
            <Text style={styles.loadMoreText}>{loadingMore ? 'Cargando…' : 'Cargar más productos'}</Text>
          </Pressable>
        ) : <View style={styles.listEnd} />}
      />

      {formVisible ? <ProductFormModal
        visible={formVisible}
        product={selectedProduct}
        onClose={() => setFormVisible(false)}
        onSave={saveProduct}
        onSetActive={changeProductStatus}
      /> : null}
    </View>
  );
}

function ProductRow({ product, onPress }: { product: Product; onPress: () => void }) {
  const isLow = product.minimum_stock > 0 && product.stock_quantity <= product.minimum_stock;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${product.name}`} onPress={onPress} style={({ pressed }) => [styles.productCard, pressed && styles.pressed]}>
      <View style={styles.productTop}>
        <View style={styles.productTitleGroup}>
          <Text style={[styles.productName, !product.is_active && styles.inactiveName]} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.productSku}>{product.sku ? `Clave ${product.sku}` : 'Sin clave'}</Text>
        </View>
        <Text style={styles.productPrice}>{formatCurrencyFromCents(product.price_cents)}</Text>
      </View>
      {product.description ? <Text style={styles.description} numberOfLines={2}>{product.description}</Text> : null}
      <View style={styles.productBottom}>
        <Text style={styles.stockText}>Existencia <Text style={styles.stockStrong}>{product.stock_quantity}</Text></Text>
        <View style={styles.badges}>
          {isLow ? <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>Stock bajo</Text></View> : null}
          {!product.is_active ? <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>Inactivo</Text></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState({ hasQuery, onAdd }: { hasQuery: boolean; onAdd: () => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>▦</Text></View>
      <Text style={styles.emptyTitle}>{hasQuery ? 'No encontramos coincidencias' : 'Tu catálogo empieza aquí'}</Text>
      <Text style={styles.emptyDescription}>{hasQuery ? 'Prueba con otro nombre o clave.' : 'Agrega los productos que vendes para mantener precios y existencias en un solo lugar.'}</Text>
      {!hasQuery ? <Pressable accessibilityRole="button" onPress={onAdd} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Agregar primer producto</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingTop: 19, paddingHorizontal: 20, paddingBottom: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  headerCopy: { flex: 1 },
  eyebrow: { color: theme.colors.primary, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: '800', marginTop: 3 },
  subtitle: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  addButton: { minHeight: 46, paddingHorizontal: 14, borderRadius: theme.radius.control, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  addIcon: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  addText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', minHeight: 49, marginHorizontal: 20, paddingHorizontal: 12, borderRadius: theme.radius.control, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  searchIcon: { fontSize: 22, color: theme.colors.muted, marginRight: 9 },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: 14, paddingVertical: 10 },
  clearSearch: { fontSize: 22, color: theme.colors.muted, paddingHorizontal: 5 },
  filterRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  filterChipSelected: { backgroundColor: theme.colors.primarySoft, borderColor: '#BCD5CB' },
  filterText: { color: theme.colors.muted, fontSize: 11, fontWeight: '700' },
  filterTextSelected: { color: theme.colors.primary },
  countText: { color: theme.colors.muted, fontSize: 10, marginLeft: 'auto' },
  errorBox: { marginHorizontal: 20, marginBottom: 8, padding: 11, borderRadius: 10, backgroundColor: '#FFF0EF' },
  errorText: { color: theme.colors.danger, fontSize: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 18, flexGrow: 1 },
  emptyList: { justifyContent: 'center' },
  separator: { height: 10 },
  productCard: { padding: 15, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  pressed: { opacity: 0.75 },
  productTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  productTitleGroup: { flex: 1 },
  productName: { color: theme.colors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  inactiveName: { color: theme.colors.muted },
  productSku: { color: theme.colors.muted, fontSize: 10, marginTop: 4 },
  productPrice: { color: theme.colors.primary, fontSize: 15, fontWeight: '800' },
  description: { color: theme.colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  productBottom: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockText: { color: theme.colors.muted, fontSize: 11 },
  stockStrong: { color: theme.colors.text, fontWeight: '800' },
  badges: { flexDirection: 'row', gap: 5 },
  lowBadge: { backgroundColor: '#FFF2DF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  lowBadgeText: { color: '#98611E', fontSize: 9, fontWeight: '800' },
  inactiveBadge: { backgroundColor: '#EEF1F3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  inactiveBadgeText: { color: theme.colors.muted, fontSize: 9, fontWeight: '800' },
  loadMore: { minHeight: 47, justifyContent: 'center', alignItems: 'center' },
  loadMoreText: { color: theme.colors.primary, fontWeight: '700', fontSize: 12 },
  listEnd: { height: 12 },
  spinner: { marginVertical: 30 },
  emptyState: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 35 },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: theme.colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  emptyIconText: { color: theme.colors.primary, fontSize: 28 },
  emptyTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 17 },
  emptyDescription: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  emptyButton: { marginTop: 18, paddingHorizontal: 17, paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.primary },
  emptyButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
