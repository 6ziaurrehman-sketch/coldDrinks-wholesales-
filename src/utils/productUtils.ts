/**
 * Formats a clean product display name without duplicate size labels (e.g. "7Up 1.5L (1.5L)" -> "7Up 1.5L").
 */
export function getDisplayName(productName?: string | null, sizeLabel?: string | null): string {
  if (!productName) return '';
  if (!sizeLabel) return productName;
  const pLower = productName.toLowerCase();
  const sLower = sizeLabel.toLowerCase().trim();
  if (pLower.includes(sLower)) {
    return productName;
  }
  return `${productName} (${sizeLabel})`;
}

/**
 * Formats inventory stock cleanly without "+ 0 Loose".
 * Shows "Bottles" instead of "Loose" and only when greater than 0 (e.g. "50 Cartons" or "50 Cartons + 4 Bottles").
 */
export function formatStockDisplay(cartons: number, looseUnits: number): string {
  const c = Math.max(0, cartons || 0);
  const l = Math.max(0, looseUnits || 0);
  if (l > 0) {
    return `${c} Cartons + ${l} Bottles`;
  }
  return `${c} Cartons`;
}
