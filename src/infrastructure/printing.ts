import * as Print from 'expo-print';
import type { SaleReceipt, SalesDocument } from '@/src/database/posRepository';
import type { CartLine } from '@/src/domain/sales';
import { formatCurrencyFromCents } from '@/src/domain/money';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

export async function printSaleReceipt(receipt: SaleReceipt) {
  const lines = receipt.items.map((item) => `<tr><td>${escapeHtml(item.product_name)}<br><small>${item.quantity} ${escapeHtml(item.unit_name)} × ${formatCurrencyFromCents(item.unit_price_cents)}</small></td><td class="amount">${formatCurrencyFromCents(item.line_total_cents)}</td></tr>`).join('');
  const payments = receipt.payments.map((payment) => `<div class="row"><span>${payment.method === 'cash' ? 'Efectivo' : payment.method === 'card' ? 'Tarjeta' : 'Transferencia'}</span><span>${formatCurrencyFromCents(payment.amount_cents)}</span></div>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page { size: 80mm auto; margin: 4mm; } * { box-sizing: border-box; } body { width: 72mm; margin: 0 auto; color: #111; font: 12px monospace; }
    h1 { font: bold 18px sans-serif; text-align: center; margin: 0 0 5px; } .center { text-align: center; } .muted { color: #555; font-size: 10px; }
    .rule { border-top: 1px dashed #333; margin: 8px 0; } table { width: 100%; border-collapse: collapse; } td { padding: 4px 0; vertical-align: top; } .amount { text-align: right; white-space: nowrap; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; } .total { font-size: 16px; font-weight: bold; }
  </style></head><body><h1>FERREPOS</h1><div class="center">Ticket #${receipt.ticket_number}</div><div class="center muted">${new Date(receipt.created_at).toLocaleString('es-MX')}</div>
    ${receipt.customer_name ? `<div class="center">Cliente: ${escapeHtml(receipt.customer_name)}</div>` : ''}<div class="rule"></div><table>${lines}</table><div class="rule"></div>
    <div class="row"><span>Subtotal</span><span>${formatCurrencyFromCents(receipt.subtotal_cents)}</span></div>${receipt.discount_cents ? `<div class="row"><span>Descuento</span><span>-${formatCurrencyFromCents(receipt.discount_cents)}</span></div>` : ''}${receipt.tax_cents ? `<div class="row"><span>Impuestos</span><span>${formatCurrencyFromCents(receipt.tax_cents)}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${formatCurrencyFromCents(receipt.total_cents)}</span></div>${payments}
    ${receipt.credit_cents ? `<div class="row"><span>A crédito</span><span>${formatCurrencyFromCents(receipt.credit_cents)}</span></div>` : ''}
    ${receipt.change_cents ? `<div class="row"><span>Cambio</span><span>${formatCurrencyFromCents(receipt.change_cents)}</span></div>` : ''}
    <div class="rule"></div><div class="center">Gracias por su compra</div></body></html>`;
  await Print.printAsync({ html, width: 226 });
}

export async function printSalesDocument(document: SalesDocument, lines: CartLine[]) {
  const rows = lines.map((line) => `<tr><td>${escapeHtml(line.name)}<br><small>${line.quantity} × ${formatCurrencyFromCents(line.unitPriceCents)}</small></td><td class="amount">${formatCurrencyFromCents(Math.round(line.quantity * line.unitPriceCents))}</td></tr>`).join('');
  const label = document.kind === 'quote' ? 'COTIZACIÓN' : 'APARTADO';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    @page { size: 80mm auto; margin: 4mm; } * { box-sizing: border-box; } body { width: 72mm; margin: 0 auto; color: #111; font: 12px monospace; }
    h1 { font: bold 18px sans-serif; text-align: center; margin: 0 0 5px; } .center { text-align: center; } .muted { color: #555; font-size: 10px; }
    .rule { border-top: 1px dashed #333; margin: 8px 0; } table { width: 100%; border-collapse: collapse; } td { padding: 4px 0; vertical-align: top; } .amount { text-align: right; white-space: nowrap; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; } .total { font-size: 16px; font-weight: bold; }
  </style></head><body><h1>FERREPOS</h1><div class="center">${label} #${document.document_number}</div><div class="center muted">${new Date(document.created_at).toLocaleString('es-MX')}</div>
    ${document.customer_name ? `<div class="center">Cliente: ${escapeHtml(document.customer_name)}</div>` : ''}${document.expires_at ? `<div class="center">Válida hasta: ${new Date(document.expires_at).toLocaleDateString('es-MX')}</div>` : ''}<div class="rule"></div><table>${rows}</table><div class="rule"></div>
    <div class="row"><span>Subtotal</span><span>${formatCurrencyFromCents(document.subtotal_cents)}</span></div>${document.discount_cents ? `<div class="row"><span>Descuento</span><span>-${formatCurrencyFromCents(document.discount_cents)}</span></div>` : ''}${document.tax_cents ? `<div class="row"><span>Impuestos</span><span>${formatCurrencyFromCents(document.tax_cents)}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${formatCurrencyFromCents(document.total_cents)}</span></div><div class="rule"></div><div class="center">Documento informativo · No es comprobante fiscal</div></body></html>`;
  await Print.printAsync({ html, width: 226 });
}
