const currencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function formatCurrencyFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('El importe debe ser un entero seguro de centavos.');
  }
  return currencyFormatter.format(cents / 100);
}

export function parseCurrencyToCents(value: string): number {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) {
    throw new TypeError('Escribe un importe válido con hasta dos decimales.');
  }

  const [whole, fraction = ''] = normalized.replaceAll(',', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('El importe excede el límite permitido.');
  }
  return cents;
}
