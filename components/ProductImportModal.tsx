import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';
import { extractText, getPageCount, isAvailable as isPdfExtractorAvailable } from 'expo-pdf-text-extract';
import { useSQLiteContext } from 'expo-sqlite';
import { useAppTheme } from '@/src/ui/ThemeProvider';
import { importProducts, type ProductInput } from '@/src/database/productsRepository';
import { parseProductMatrix, parseProductText, type ProductImportDraft } from '@/src/domain/productImport';
import { validateProductForm, type ProductFormValues } from '@/src/domain/productValidation';

type Props = { visible: boolean; onClose: () => void; onImported: (count: number) => Promise<void> };
type Row = ProductImportDraft & { enabled: boolean };
const allowedExtensions = ['xlsx', 'xls', 'pdf', 'png', 'jpg', 'jpeg'];
const maxImportRows = 500;

export function ProductImportModal({ visible, onClose, onImported }: Props) {
  const { theme, styles } = useThemeStyles();
  const db = useSQLiteContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existingSkus, setExistingSkus] = useState<Set<string>>(new Set());

  const inspected = useMemo(() => {
    const seen = new Set<string>();
    return rows.map((row) => {
      const result = validateProductForm(row.values, true);
      const sku = row.values.sku.trim().toLocaleUpperCase('en-US');
      const repeated = Boolean(sku && ((row.enabled && seen.has(sku)) || existingSkus.has(sku)));
      if (sku && row.enabled) seen.add(sku);
      return { row, result, repeated };
    });
  }, [rows, existingSkus]);
  const eligibleCount = inspected.filter(({ row, result, repeated }) => row.enabled && result.ok && !repeated).length;

  const pickFile = async () => {
    setError('');
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel', 'application/pdf', 'image/png', 'image/jpeg',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
      if (!allowedExtensions.includes(extension)) throw new Error('Elige un archivo Excel, PDF, PNG o JPG.');
      if ((asset.size ?? 0) > 20 * 1024 * 1024) throw new Error('El archivo supera 20 MB. Divide o reduce el catálogo para importarlo.');
      setRows([]);
      setFileName('');
      setBusy(true);
      let parsed: ProductImportDraft[];
      if (extension === 'xlsx' || extension === 'xls') {
        const file = new File(asset.uri);
        const workbook = XLSX.read(await file.bytes(), { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('El libro no contiene hojas.');
        parsed = parseProductMatrix(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false }) as unknown[][]);
      } else if (extension === 'pdf') {
        if (!isPdfExtractorAvailable()) throw new Error('Para leer PDF instala y abre la app en una development build (no Expo Go).');
        const pdfPageCount = await getPageCount(asset.uri);
        if (pdfPageCount > 20) throw new Error('Este PDF tiene más de 20 páginas. Divide el catálogo para importarlo.');
        const pdfText = await extractText(asset.uri);
        try {
          parsed = parseProductText(pdfText);
        } catch {
          const { PdfPageImage } = await import('@dariyd/react-native-pdf-page-image');
          await PdfPageImage.open(asset.uri);
          try {
            const recognizedPages: string[] = [];
            for (let page = 0; page < pdfPageCount; page += 1) {
              const image = await PdfPageImage.generate(asset.uri, page, 1, { maxDimension: 1800 });
              const { recognizeText } = await import('expo-ocr-kit');
              recognizedPages.push((await recognizeText(image.uri)).text);
            }
            parsed = parseProductText(recognizedPages.join('\n'));
          } finally {
            await PdfPageImage.close(asset.uri);
          }
        }
      } else {
        const { recognizeText } = await import('expo-ocr-kit');
        const result = await recognizeText(asset.uri);
        parsed = parseProductText(result.text);
      }
      if (!parsed.length) throw new Error('No encontramos filas de productos en el archivo.');
      if (parsed.length > maxImportRows) throw new Error(`El archivo tiene más de ${maxImportRows} productos. Divide el catálogo en archivos más pequeños.`);
      const storedSkus = await db.getAllAsync<{ sku: string }>('SELECT sku FROM products WHERE sku IS NOT NULL');
      setExistingSkus(new Set(storedSkus.map(({ sku }) => sku.toLocaleUpperCase('en-US'))));
      setRows(parsed.map((row) => ({ ...row, enabled: true })));
      setFileName(asset.name);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(message.includes('Native module') || message.includes('development build')
        ? 'El reconocimiento de este archivo requiere una development build de la app.'
        : message || 'No se pudo leer el archivo. Revisa el formato e intenta de nuevo.');
      setRows([]);
      setExistingSkus(new Set());
      setFileName('');
    } finally {
      setBusy(false);
    }
  };

  const update = (index: number, field: keyof ProductFormValues, value: string) => {
    setRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, values: { ...row.values, [field]: value } } : row));
  };

  const commitImport = () => {
    if (!eligibleCount || busy) return;
    Alert.alert('Importar productos', `Se agregarán ${eligibleCount} productos nuevos al catálogo. Esta acción no modificará productos existentes.`, [
      { text: 'Revisar', style: 'cancel' },
      { text: 'Importar', onPress: () => void saveImport() },
    ]);
  };

  const saveImport = async () => {
    const selected = inspected.filter(({ row, result, repeated }) => row.enabled && result.ok && !repeated);
    if (!selected.length) return;
    setBusy(true);
    setError('');
    try {
      const inputs: ProductInput[] = selected.map(({ result }) => result.ok ? result.value : (() => { throw new Error('invalid_product'); })());
      await importProducts(db, inputs);
      await onImported(inputs.length);
      setRows([]);
      setExistingSkus(new Set());
      setFileName('');
      onClose();
      Alert.alert('Catálogo actualizado', `Se importaron ${inputs.length} productos.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(message.includes('duplicate') || message.includes('products.sku')
        ? 'Hay claves repetidas o ya existentes. Corrige esas filas y vuelve a importar.'
        : 'No se pudo guardar el catálogo. No se importó ningún producto; revisa el archivo e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setRows([]);
    setExistingSkus(new Set());
    setFileName('');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CATÁLOGO</Text>
            <Text style={styles.title}>Importar productos</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.description}>Carga Excel, PDF o una foto del catálogo (PNG/JPG). Revisa y corrige cada fila; el archivo se procesa en este dispositivo. PDF e imágenes requieren una development build para reconocer el texto.</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void pickFile()} style={styles.pickButton}>
            <Text style={styles.pickTitle}>{busy ? 'Leyendo archivo…' : fileName ? 'Elegir otro archivo' : 'Seleccionar archivo'}</Text>
            <Text style={styles.pickSubtitle}>{fileName || 'XLSX, XLS, PDF, PNG o JPG'}</Text>
          </Pressable>
          {busy ? <ActivityIndicator color={theme.colors.primary} style={styles.spinner} /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {rows.length > 0 ? <>
            <Text style={styles.summary}>{eligibleCount} listos · {rows.length - eligibleCount} excluidos o por revisar</Text>
            {inspected.map(({ row, result, repeated }, index) => {
              const fields: { key: keyof ProductFormValues; label: string; keyboardType?: 'default' | 'decimal-pad' }[] = [
                { key: 'name', label: 'Nombre' }, { key: 'sku', label: 'Clave (opcional)' },
                { key: 'price', label: 'Precio', keyboardType: 'decimal-pad' }, { key: 'cost', label: 'Costo', keyboardType: 'decimal-pad' },
                { key: 'openingStock', label: 'Existencia inicial', keyboardType: 'decimal-pad' }, { key: 'minimumStock', label: 'Stock mínimo', keyboardType: 'decimal-pad' },
              ];
              const valid = result.ok && !repeated;
              return <View key={`${row.sourceRow}-${index}`} style={[styles.rowCard, !valid && styles.rowInvalid]}>
                <View style={styles.rowHeading}>
                  <Text style={styles.rowNumber}>Fila {row.sourceRow}</Text>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: row.enabled }} onPress={() => setRows((previous) => previous.map((item, rowIndex) => rowIndex === index ? { ...item, enabled: !item.enabled } : item))} style={styles.skipButton}>
                    <Text style={styles.skipText}>{row.enabled ? 'Excluir' : 'Incluir'}</Text>
                  </Pressable>
                </View>
                {fields.map(({ key, label, keyboardType }) => <View key={key} style={styles.field}>
                  <Text style={styles.label}>{label}</Text>
                  <TextInput accessibilityLabel={`${label}, fila ${row.sourceRow}`} value={row.values[key]} onChangeText={(value) => update(index, key, value)} keyboardType={keyboardType ?? 'default'} style={styles.input} />
                </View>)}
                {!valid ? <Text style={styles.rowError}>{repeated ? 'La clave está repetida en este archivo.' : result.ok ? 'Revisa los campos para importar.' : Object.values(result.errors).filter(Boolean).join(' ')}</Text> : null}
              </View>;
            })}
          </> : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy || eligibleCount === 0} onPress={commitImport} style={[styles.saveButton, (busy || eligibleCount === 0) && styles.disabled]}><Text style={styles.saveText}>{busy ? 'Guardando…' : `Importar ${eligibleCount}`}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function useThemeStyles() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 15, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' },
  headerCopy: { flex: 1 }, eyebrow: { color: theme.colors.primaryText, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' }, title: { color: theme.colors.text, fontSize: 23, fontWeight: '800', marginTop: 4 },
  closeButton: { width: 42, height: 42, borderRadius: theme.radius.control, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }, closeText: { fontSize: 27, color: theme.colors.muted, lineHeight: 30 },
  content: { padding: 20, paddingBottom: 28, gap: 12, width: '100%', maxWidth: 900, alignSelf: 'center' }, description: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 },
  pickButton: { minHeight: 72, padding: 14, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft, justifyContent: 'center' }, pickTitle: { color: theme.colors.primaryText, fontWeight: '800', fontSize: 14 }, pickSubtitle: { color: theme.colors.muted, fontSize: 11, marginTop: 4 },
  spinner: { marginVertical: 10 }, error: { color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, padding: 12, borderRadius: theme.radius.control, fontSize: 12, lineHeight: 18 }, summary: { color: theme.colors.text, fontWeight: '800', marginTop: 8 },
  rowCard: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, padding: 14, gap: 10 }, rowInvalid: { borderColor: theme.colors.danger }, rowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, rowNumber: { color: theme.colors.text, fontSize: 13, fontWeight: '800' }, skipButton: { minHeight: 44, minWidth: 68, paddingHorizontal: 12, paddingVertical: 7, justifyContent: 'center', alignItems: 'center' }, skipText: { color: theme.colors.primaryText, fontSize: 12, fontWeight: '700' },
  field: { gap: 5 }, label: { color: theme.colors.muted, fontSize: 11, fontWeight: '700' }, input: { minHeight: 43, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, color: theme.colors.text, fontSize: 14, paddingHorizontal: 11, paddingVertical: 8 }, rowError: { color: theme.colors.danger, fontSize: 11, lineHeight: 16 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }, cancelButton: { flex: 1, minHeight: 50, borderRadius: theme.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }, cancelText: { color: theme.colors.text, fontWeight: '700' }, saveButton: { flex: 1.5, minHeight: 50, borderRadius: theme.radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary }, saveText: { color: theme.colors.onPrimary, fontWeight: '800' }, disabled: { opacity: 0.5 },
}), [theme]);
  return { theme, styles };
}
