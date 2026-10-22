export type CartLine = {
  productId: string;
  name: string;
  sku: string | null;
  unitPriceCents: number;
  unitCostCents: number;
  stock: number;
  quantity: number;
  unitName?: string;
  inventoryFactor?: number;
};

export type PaymentAmounts = { cashCents: number; cardCents: number; transferCents: number; cashTenderedCents: number };

export function getCartTotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.unitPriceCents * line.quantity), 0);
}

export function validatePayments(totalCents: number, amounts: PaymentAmounts, creditCents = 0): { valid: boolean; changeCents: number } {
  const { cashCents, cardCents, transferCents, cashTenderedCents } = amounts;
  const values = [totalCents, cashCents, cardCents, transferCents, cashTenderedCents, creditCents];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) return { valid: false, changeCents: 0 };
  const applied = cashCents + cardCents + transferCents;
  if (!Number.isSafeInteger(applied) || applied + creditCents !== totalCents || cashTenderedCents < cashCents) return { valid: false, changeCents: 0 };
  return { valid: true, changeCents: cashTenderedCents - cashCents };
}

export function getExpectedCashCents(
  openingCashCents: number,
  cashSalesCents: number,
  cashInCents: number,
  cashOutCents: number,
): number {
  return openingCashCents + cashSalesCents + cashInCents - cashOutCents;
}
