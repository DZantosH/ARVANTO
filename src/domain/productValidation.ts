import { parseCurrencyToCents } from './money';
import type { ProductInput } from '@/src/database/productsRepository';

export type ProductFormValues = {
  name: string;
  sku: string;
  barcode?: string;
  description: string;
  cost: string;
  price: string;
  minimumStock: string;
  openingStock: string;
  unitName?: string;
  saleUnitName?: string;
  saleUnitFactor?: string;
  saleUnitPrice?: string;
};

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;

export type ProductValidationResult =
  | { ok: true; value: ProductInput }
  | { ok: false; errors: ProductFormErrors };

export function validateProductForm(values: ProductFormValues, isNew: boolean): ProductValidationResult {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();
  const sku = values.sku.trim().toUpperCase();
  const barcode = values.barcode?.trim() ?? '';
  const description = values.description.trim();
  const unitName = values.unitName?.trim() || 'pieza';
  const saleUnitName = values.saleUnitName?.trim() ?? '';

  if (!name) errors.name = 'Escribe el nombre del producto.';
  if (name.length > 120) errors.name = 'El nombre no puede superar 120 caracteres.';
  if (sku.length > 60) errors.sku = 'La clave no puede superar 60 caracteres.';
  if (barcode.length > 100) errors.barcode = 'El código de barras no puede superar 100 caracteres.';
  if (description.length > 500) errors.description = 'La descripción no puede superar 500 caracteres.';
  if (!unitName || unitName.length > 24) errors.unitName = 'Escribe una unidad base de 1 a 24 caracteres.';
  if (saleUnitName.length > 24) errors.saleUnitName = 'La unidad de conversión no puede superar 24 caracteres.';
  if (saleUnitName && saleUnitName.toLocaleLowerCase('es-MX') === unitName.toLocaleLowerCase('es-MX')) errors.saleUnitName = 'La unidad alterna debe tener un nombre distinto a la unidad base.';

  const priceCents = readCents(values.price, 'El precio', errors, 'price', true);
  const costCents = readCents(values.cost, 'El costo', errors, 'cost', false);
  const minimumStock = readQuantity(values.minimumStock, 'El stock mínimo', errors, 'minimumStock');
  const openingStock = isNew
    ? readQuantity(values.openingStock, 'La existencia inicial', errors, 'openingStock')
    : 0;
  const saleUnitFactor = saleUnitName ? readFactor(values.saleUnitFactor ?? '1', errors) : 1;
  let saleUnitPriceCents: number | null = null;
  if (saleUnitName && values.saleUnitPrice?.trim()) {
    const parsedUnitPrice = readCents(values.saleUnitPrice, 'El precio por unidad de conversión', errors, 'saleUnitPrice', true);
    saleUnitPriceCents = parsedUnitPrice;
  }

  if (Object.keys(errors).length || priceCents === null || costCents === null || minimumStock === null || openingStock === null || saleUnitFactor === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sku: sku || null,
      barcode: barcode || null,
      name,
      description,
      costCents,
      priceCents,
      minimumStock,
      unitName,
      saleUnitName,
      saleUnitFactor,
      saleUnitPriceCents,
      ...(isNew ? { openingStock } : {}),
    },
  };
}

function readFactor(input: string, errors: ProductFormErrors): number | null {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*)(?:[.,]\d{1,6})?$/.test(value)) {
    errors.saleUnitFactor = 'Escribe una conversión válida mayor que cero.';
    return null;
  }
  const factor = Number(value.replace(',', '.'));
  if (!Number.isFinite(factor) || factor <= 0 || factor > 1_000_000) {
    errors.saleUnitFactor = 'La conversión debe ser mayor que cero y menor a un millón.';
    return null;
  }
  return factor;
}

function readCents(
  input: string,
  label: string,
  errors: ProductFormErrors,
  key: 'cost' | 'price' | 'saleUnitPrice',
  required: boolean,
): number | null {
  const value = input.trim();
  if (!value && !required) return 0;
  if (!value) {
    errors[key] = `${label}: escribe un importe.`;
    return null;
  }
  try {
    const cents = parseCurrencyToCents(value);
    if (required && cents <= 0) {
      errors[key] = `${label}: debe ser mayor a cero.`;
      return null;
    }
    return cents;
  } catch {
    errors[key] = `${label}: usa un importe válido con hasta dos decimales.`;
    return null;
  }
}

function readQuantity(
  input: string,
  label: string,
  errors: ProductFormErrors,
  key: 'minimumStock' | 'openingStock',
): number | null {
  const value = input.trim();
  if (!value) return 0;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(value)) {
    errors[key] = `${label}: escribe una cantidad positiva con hasta tres decimales.`;
    return null;
  }
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity > 1_000_000_000) {
    errors[key] = `${label}: la cantidad excede el límite permitido.`;
    return null;
  }
  return quantity;
}
