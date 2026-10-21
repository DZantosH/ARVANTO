import type { ProductFormValues } from './productValidation';

export type ProductImportDraft = {
  sourceRow: number;
  values: ProductFormValues;
};

const aliases: Record<keyof ProductFormValues, string[]> = {
  name: ['nombre', 'nombre producto', 'producto', 'product name', 'descripcion producto', 'articulo', 'descripción del producto'],
  sku: ['sku', 'clave', 'codigo', 'código', 'codigo producto', 'clave producto', 'code'],
  description: ['descripcion', 'descripción', 'detalle', 'observaciones'],
  cost: ['costo', 'coste', 'precio costo', 'costo unitario', 'cost'],
  price: ['precio', 'precio venta', 'precio menudeo', 'venta', 'pvp', 'unit price', 'price', 'precio publico', 'precio público'],
  minimumStock: ['stock minimo', 'stock mínimo', 'stock min', 'minimo', 'mínimo', 'existencia minima'],
  openingStock: ['existencia', 'stock', 'inventario', 'cantidad', 'existencia inicial', 'quantity'],
};

const blank = (): ProductFormValues => ({
  name: '', sku: '', description: '', cost: '0', price: '', minimumStock: '0', openingStock: '0',
});

export function parseProductMatrix(matrix: unknown[][]): ProductImportDraft[] {
  const rows = matrix.map((row) => row.map(toCell));
  const headerIndex = rows.findIndex((row) => row.some((cell) => aliases.name.some((alias) => normalizeHeader(alias) === normalizeHeader(cell))));
  if (headerIndex < 0) throw new Error('No encontramos una columna “Nombre” o “Producto”. Agrega encabezados y vuelve a intentar.');
  const headers = rows[headerIndex].map(normalizeHeader);
  const columns = {} as Record<keyof ProductFormValues, number>;
  for (const key of Object.keys(aliases) as (keyof ProductFormValues)[]) {
    columns[key] = headers.findIndex((header) => aliases[key].some((alias) => normalizeHeader(alias) === header));
  }
  return rows.slice(headerIndex + 1).flatMap((row, index) => {
    if (!row.some((cell) => cell.trim())) return [];
    const values = blank();
    for (const key of Object.keys(columns) as (keyof ProductFormValues)[]) {
      if (columns[key] >= 0) values[key] = row[columns[key]] ?? '';
    }
    if (!values.name.trim()) return [];
    return [{ sourceRow: headerIndex + index + 2, values }];
  });
}

export function parseProductText(text: string): ProductImportDraft[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matrix = lines.map((line) => splitTextRow(line));
  const hasHeader = matrix.some((row) => row.some((cell) => aliases.name.some((alias) => normalizeHeader(alias) === normalizeHeader(cell))));
  if (hasHeader) return parseProductMatrix(matrix);

  // For OCR and PDF text without headings, recognize a product name followed by its price.
  const drafts: ProductImportDraft[] = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(.+?)\s+(?:\$\s*)?(-?\d[\d,]*(?:\.\d{1,2})?)\s*$/);
    if (!match || !/[a-záéíóúñ]/i.test(match[1])) return;
    const values = blank();
    values.name = match[1].trim();
    values.price = match[2].replace(/,/g, '');
    drafts.push({ sourceRow: index + 1, values });
  });
  if (!drafts.length) throw new Error('No pudimos reconocer productos. El archivo debe incluir filas con nombre y precio, además de encabezados cuando sea posible.');
  return drafts;
}

export function splitTextRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((cell) => cell.trim());
  if (line.includes('|')) return line.split('|').map((cell) => cell.trim());
  if (line.includes(';')) return line.split(';').map((cell) => cell.trim());
  return line.split(/\s{2,}/).map((cell) => cell.trim());
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function toCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  return String(value).trim();
}
