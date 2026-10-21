import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { theme } from '@/constants/Theme';
import { validateProductForm, type ProductFormErrors, type ProductFormValues } from '@/src/domain/productValidation';
import type { Product, ProductInput } from '@/src/database/productsRepository';

type Props = {
  visible: boolean;
  product: Product | null;
  onClose: () => void;
  onSave: (input: ProductInput) => Promise<void>;
  onSetActive: (product: Product, isActive: boolean) => Promise<void>;
};

const emptyValues: ProductFormValues = {
  name: '', sku: '', description: '', cost: '', price: '', minimumStock: '0', openingStock: '0',
};

export function ProductFormModal({ visible, product, onClose, onSave, onSetActive }: Props) {
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const isNew = product === null;

  const [values, setValues] = useState<ProductFormValues>(() => product ? {
    name: product.name,
    sku: product.sku ?? '',
    description: product.description,
    cost: (product.cost_cents / 100).toFixed(2),
    price: (product.price_cents / 100).toFixed(2),
    minimumStock: String(product.minimum_stock),
    openingStock: '0',
  } : { ...emptyValues });

  const updateValue = (key: keyof ProductFormValues, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setFormError('');
  };

  const save = async () => {
    const result = validateProductForm(values, isNew);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError('Revisa los campos marcados para continuar.');
      return;
    }
    setSaving(true);
    try {
      await onSave(result.value);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setFormError(message.includes('products.sku') || message.includes('products_sku_nocase_idx')
        ? 'Ya existe un producto con esa clave.'
        : 'No se pudo guardar el producto. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = () => {
    if (!product) return;
    const activate = product.is_active === 0;
    Alert.alert(
      activate ? 'Reactivar producto' : 'Desactivar producto',
      activate
        ? 'El producto volverá a aparecer en el catálogo activo.'
        : 'El producto dejará de aparecer en el catálogo activo. Su historial se conservará.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: activate ? 'Reactivar' : 'Desactivar', style: activate ? 'default' : 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await onSetActive(product, activate);
            onClose();
          } catch {
            setFormError('No se pudo cambiar el estado del producto.');
          } finally {
            setSaving(false);
          }
        } },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{isNew ? 'CATÁLOGO' : product?.is_active ? 'PRODUCTO ACTIVO' : 'PRODUCTO INACTIVO'}</Text>
            <Text style={styles.title}>{isNew ? 'Nuevo producto' : 'Editar producto'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar formulario" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Field label="Nombre del producto *" value={values.name} onChangeText={(value) => updateValue('name', value)} error={errors.name} placeholder="Ej. Cemento gris 50 kg" maxLength={140} returnKeyType="next" />
          <Field label="Clave / SKU" value={values.sku} onChangeText={(value) => updateValue('sku', value)} error={errors.sku} placeholder="Opcional, debe ser única" autoCapitalize="characters" maxLength={60} returnKeyType="next" />
          <Field label="Descripción" value={values.description} onChangeText={(value) => updateValue('description', value)} error={errors.description} placeholder="Marca, presentación u otros detalles" multiline maxLength={500} />

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <Field label="Precio de venta *" value={values.price} onChangeText={(value) => updateValue('price', value)} error={errors.price} placeholder="0.00" keyboardType="decimal-pad" prefix="$" />
            </View>
            <View style={styles.column}>
              <Field label="Costo" value={values.cost} onChangeText={(value) => updateValue('cost', value)} error={errors.cost} placeholder="0.00" keyboardType="decimal-pad" prefix="$" />
            </View>
          </View>

          <View style={styles.twoColumns}>
            <View style={styles.column}>
              <Field label="Stock mínimo" value={values.minimumStock} onChangeText={(value) => updateValue('minimumStock', value)} error={errors.minimumStock} placeholder="0" keyboardType="decimal-pad" />
            </View>
            {isNew ? (
              <View style={styles.column}>
                <Field label="Existencia inicial" value={values.openingStock} onChangeText={(value) => updateValue('openingStock', value)} error={errors.openingStock} placeholder="0" keyboardType="decimal-pad" />
              </View>
            ) : (
              <View style={[styles.column, styles.stockReadOnly]}>
                <Text style={styles.label}>Existencia actual</Text>
                <Text style={styles.stockValue}>{product?.stock_quantity ?? 0}</Text>
                <Text style={styles.helper}>Se ajustará desde Inventario.</Text>
              </View>
            )}
          </View>

          {formError ? <Text accessibilityRole="alert" style={styles.formError}>{formError}</Text> : null}

          {product ? (
            <Pressable accessibilityRole="button" disabled={saving} onPress={toggleActive} style={styles.deactivateButton}>
              <Text style={styles.deactivateText}>{product.is_active ? 'Desactivar producto' : 'Reactivar producto'}</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabled]}>
            <Text style={styles.saveText}>{saving ? 'Guardando…' : isNew ? 'Guardar producto' : 'Guardar cambios'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  prefix?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText'>;

function Field({ label, value, onChangeText, error, prefix, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, error ? styles.inputError : null, inputProps.multiline ? styles.multilineWrap : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, inputProps.multiline ? styles.multilineInput : null]}
          {...inputProps}
        />
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 15, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { color: theme.colors.primary, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: theme.colors.text, fontSize: 23, fontWeight: '800', marginTop: 4 },
  closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 27, color: theme.colors.muted, lineHeight: 30 },
  form: { padding: 20, paddingBottom: 30, gap: 16 },
  field: { gap: 7, flex: 1 },
  label: { color: theme.colors.text, fontWeight: '700', fontSize: 13 },
  inputWrap: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: theme.radius.control, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 13 },
  inputError: { borderColor: theme.colors.danger },
  multilineWrap: { alignItems: 'flex-start', minHeight: 92, paddingTop: 10 },
  input: { flex: 1, color: theme.colors.text, fontSize: 15, paddingVertical: 12 },
  multilineInput: { minHeight: 70, textAlignVertical: 'top' },
  prefix: { color: theme.colors.muted, marginRight: 7, fontSize: 15, fontWeight: '700' },
  fieldError: { color: theme.colors.danger, fontSize: 11 },
  twoColumns: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  column: { flex: 1 },
  stockReadOnly: { paddingHorizontal: 12, paddingTop: 9 },
  stockValue: { color: theme.colors.text, fontSize: 18, fontWeight: '800', marginTop: 7 },
  helper: { color: theme.colors.muted, fontSize: 10, marginTop: 3 },
  formError: { color: theme.colors.danger, fontSize: 12, fontWeight: '600' },
  deactivateButton: { paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#EBCBC9', borderRadius: theme.radius.control, backgroundColor: '#FFF8F7' },
  deactivateText: { color: theme.colors.danger, fontWeight: '700', fontSize: 13 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  cancelButton: { flex: 1, minHeight: 50, borderRadius: theme.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  cancelText: { color: theme.colors.text, fontWeight: '700' },
  saveButton: { flex: 1.5, minHeight: 50, borderRadius: theme.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary },
  saveText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.55 },
});
