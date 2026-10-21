import { describe, expect, it } from '@jest/globals';
import { validateProductForm, type ProductFormValues } from './productValidation';

const validValues: ProductFormValues = {
  name: 'Tornillo galvanizado',
  sku: ' tor-01 ',
  description: 'Caja con 100 piezas',
  cost: '25.50',
  price: '39.90',
  minimumStock: '2.5',
  openingStock: '12',
};

describe('product form validation', () => {
  it('normalizes SKU and converts prices to integer cents', () => {
    const result = validateProductForm(validValues, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ sku: 'TOR-01', costCents: 2550, priceCents: 3990, minimumStock: 2.5, openingStock: 12 });
    }
  });

  it('requires a name and a positive sale price', () => {
    const result = validateProductForm({ ...validValues, name: '  ', price: '0' }, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.price).toContain('mayor a cero');
    }
  });

  it('rejects negative, malformed and over-precision values', () => {
    for (const price of ['-5', '25.555', 'abc']) {
      const result = validateProductForm({ ...validValues, price }, true);
      expect(result.ok).toBe(false);
    }
    const quantity = validateProductForm({ ...validValues, openingStock: '-1' }, true);
    expect(quantity.ok).toBe(false);
  });

  it('does not accept opening stock as an edit field', () => {
    const result = validateProductForm({ ...validValues, openingStock: '999' }, false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty('openingStock');
  });
});
