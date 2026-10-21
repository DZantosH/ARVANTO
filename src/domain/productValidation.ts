import { parseCurrencyToCents } from './money';
import type { ProductInput } from '@/src/database/productsRepository';

export type ProductFormValues = {
  name: string;
  sku: string;
  description: string;
  cost: string;
  price: string;
  minimumStock: string;
  openingStock: string;
};

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;

export type ProductValidationResult =
  | { ok: true; value: ProductInput }
  | { ok: false; errors: ProductFormErrors };

export function validateProductForm(values: ProductFormValues, isNew: boolean): ProductValidationResult {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();
  const sku = values.sku.trim().toUpperCase();
  const description = values.description.trim();

  if (!name) errors.name = 'Escribe el nombre del producto.';
  if (name.length > 120) errors.name = 'El nombre no puede superar 120 caracteres.';
  if (sku.length > 60) errors.sku = 'La clave no puede superar 60 caracteres.';
  if (description.length > 500) errors.description = 'La descripción no puede superar 500 caracteres.';

  const priceCents = readCents(values.price, 'El precio', errors, 'price', true);
  const costCents = readCents(values.cost, 'El costo', errors, 'cost', false);
  const minimumStock = readQuantity(values.minimumStock, 'El stock mínimo', errors, 'minimumStock');
  const openingStock = isNew
    ? readQuantity(values.openingStock, 'La existencia inicial', errors, 'openingStock')
    : 0;

  if (Object.keys(errors).length || priceCents === null || costCents === null || minimumStock === null || openingStock === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      sku: sku || null,
      name,
      description,
      costCents,
      priceCents,
      minimumStock,
      ...(isNew ? { openingStock } : {}),
    },
  };
}

function readCents(
  input: string,
  label: string,
  errors: ProductFormErrors,
  key: 'cost' | 'price',
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
