import type { InventoryItem, WholesalerCustomer, WholesalerSaleSummary } from '../types/wholesaler.types';

/**
 * Normalizes text for search by:
 * - Converting to lowercase
 * - Replacing common beverage synonyms (cartoon/cartoons -> carton, coke -> coca-cola, etc.)
 * - Trimming extra spaces
 */
export function normalizeSearchQuery(text: string): string {
  if (!text) return '';
  let s = text.toLowerCase().trim();

  // Synonym mappings for beverage wholesale
  s = s.replace(/\bcartoons?\b/g, 'carton');
  s = s.replace(/\bctns?\b/g, 'carton');
  s = s.replace(/\bdabba\b/g, 'carton');
  s = s.replace(/\bpeti\b/g, 'carton');
  s = s.replace(/\bcoke\b/g, 'coca-cola');
  s = s.replace(/\blitres?\b|\bliters?\b|\bltrs?\b/g, 'l');
  s = s.replace(/\bmilli\b|\bmls?\b/g, 'ml');
  s = s.replace(/\btins?\b/g, 'can');
  s = s.replace(/\bbttls?\b/g, 'bottle');

  return s;
}

/**
 * Removes all whitespace, hyphens, dots, parentheses, and punctuation
 * to allow seamless matching of strings like:
 * "7Up 1.5L" <-> "7Up1.5L" <-> "7up1.5l" <-> "7up 1.5 l"
 */
export function toCompactString(text: string): string {
  if (!text) return '';
  return normalizeSearchQuery(text).replace(/[\s\.\-_/\\(),]+/g, '');
}

/**
 * Splits query into search tokens, also splitting letter-digit boundaries
 * (e.g. "7up1.5l" -> ["7up", "1.5l", "1.5", "l"]).
 */
export function extractSearchTokens(query: string): string[] {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];

  const rawTokens = normalized.split(/[\s,/\-]+/).filter(Boolean);
  const resultTokens = new Set<string>();

  for (const token of rawTokens) {
    resultTokens.add(token);

    // If token has letters and digits merged (like "7up1.5l" or "pepsi500ml")
    const letterDigitSplit = token
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .split(' ')
      .filter(Boolean);

    if (letterDigitSplit.length > 1) {
      for (const sub of letterDigitSplit) {
        resultTokens.add(sub);
      }
    }
  }

  return Array.from(resultTokens);
}

/**
 * High-performance, flexible smart search matcher for Inventory Items.
 * Matches:
 * - "7Up 1.5L", "7Up1.5L", "7up1.5L", "7up 1.5L", "7up 1.5", "7up"
 * - "carton", "cartoons", "cartoon", "ctn" (packaging & carton stock)
 * - Size, Brand, Category, Barcode, Product Name
 * - Multi-token queries (e.g. "pepsi 1.5", "coke 500", "7up cartons")
 */
export function matchInventoryItem(item: InventoryItem, query: string): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim();
  const normQuery = normalizeSearchQuery(rawQuery);
  const compactQuery = toCompactString(rawQuery);

  // Build searchable properties
  const pName = item.product_name || '';
  const bName = item.brand_name || '';
  const cName = item.category_name || '';
  const sLabel = item.size_label || '';
  const pkgType = item.packaging_type || 'carton';
  const pieces = item.pieces_per_carton || 1;
  const cartons = item.available_cartons || 0;
  const loose = item.available_loose_units || 0;
  const totalUnits = item.total_units || 0;

  // 1. Direct Compact String Match
  // (Handles "7up1.5l" matching "7Up 1.5L" effortlessly)
  const fullCombined = `${pName} ${sLabel} ${bName} ${cName} ${pkgType} ${pieces} per carton ${cartons} cartons`;
  const compactTarget = toCompactString(fullCombined);

  if (compactTarget.includes(compactQuery)) {
    return true;
  }

  // Also check compact with dots preserved (e.g. "7up1.5l")
  const compactWithDotTarget = normQuery.includes('.')
    ? fullCombined.toLowerCase().replace(/[\s\-_/\\(),]+/g, '')
    : '';
  const compactWithDotQuery = normQuery.includes('.')
    ? normQuery.replace(/[\s\-_/\\(),]+/g, '')
    : '';
  if (compactWithDotTarget && compactWithDotQuery && compactWithDotTarget.includes(compactWithDotQuery)) {
    return true;
  }

  // 2. Token-by-Token Match (All tokens must match something in the item)
  const tokens = extractSearchTokens(rawQuery);
  if (tokens.length === 0) return true;

  const matchesAllTokens = tokens.every((token) => {
    const compactToken = toCompactString(token);
    if (!compactToken) return true;

    // Check carton / cartoon keyword
    if (token === 'carton') {
      return (
        pkgType.toLowerCase() === 'carton' ||
        cartons > 0 ||
        pieces > 1
      );
    }

    // Check bottle / loose keyword
    if (token === 'bottle' || token === 'loose') {
      return loose > 0 || totalUnits > 0;
    }

    // Check exact numeric values (cartons count, pack size, units)
    const num = Number(token);
    if (!isNaN(num) && num > 0) {
      if (cartons === num || pieces === num || totalUnits === num) {
        return true;
      }
    }

    // Check string fields (product name, brand, category, size)
    const pCompact = toCompactString(pName);
    const bCompact = toCompactString(bName);
    const cCompact = toCompactString(cName);
    const sCompact = toCompactString(sLabel);

    return (
      pCompact.includes(compactToken) ||
      bCompact.includes(compactToken) ||
      cCompact.includes(compactToken) ||
      sCompact.includes(compactToken) ||
      compactTarget.includes(compactToken)
    );
  });

  return matchesAllTokens;
}

/**
 * Smart customer search matcher.
 * Matches:
 * - Shop name (spacing, casing tolerant)
 * - Owner/Contact person name
 * - Phone number (matches with or without dashes/spaces, e.g. "03001234567" matches "0300-1234567")
 * - Address, Area, City
 */
export function matchCustomer(customer: WholesalerCustomer, query: string): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim();
  const compactQuery = toCompactString(rawQuery);
  const digitsQuery = rawQuery.replace(/\D/g, '');

  const nameCompact = toCompactString(customer.name || '');
  const ownerCompact = toCompactString(customer.owner_name || '');
  const addressCompact = toCompactString(customer.address || '');
  const areaCompact = toCompactString(customer.area || '');
  const cityCompact = toCompactString((customer as any).city || '');

  // Phone match (digits only)
  const customerPhoneDigits = (customer.phone || '').replace(/\D/g, '');
  if (digitsQuery.length >= 3 && customerPhoneDigits.includes(digitsQuery)) {
    return true;
  }

  // Compact name & address match
  if (
    nameCompact.includes(compactQuery) ||
    ownerCompact.includes(compactQuery) ||
    addressCompact.includes(compactQuery) ||
    cityCompact.includes(compactQuery) ||
    areaCompact.includes(compactQuery)
  ) {
    return true;
  }

  // Token-by-token match
  const tokens = extractSearchTokens(rawQuery);
  const fullTargetCompact = `${nameCompact}${ownerCompact}${addressCompact}${cityCompact}${areaCompact}`;

  return tokens.every((t) => {
    const ct = toCompactString(t);
    return ct ? fullTargetCompact.includes(ct) : true;
  });
}

/**
 * Smart Sales Slip search matcher.
 * Matches:
 * - Receipt / Slip Number (e.g. "42", "00042", "2026-00042", "slip-42", "SLIP-2026-00042")
 * - Customer / Shop Name
 * - Phone Number
 * - Payment Method ("cash", "credit", "bank")
 */
export function matchSalesSlip(sale: WholesalerSaleSummary, query: string): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim();
  const compactQuery = toCompactString(rawQuery);
  const digitsQuery = rawQuery.replace(/\D/g, '');

  // 1. Slip Number matching
  const slipNo = sale.receipt_no || '';
  const slipCompact = toCompactString(slipNo);
  const slipDigits = slipNo.replace(/\D/g, '');

  if (slipCompact.includes(compactQuery)) return true;
  if (digitsQuery.length >= 2 && slipDigits.includes(digitsQuery)) return true;

  // 2. Customer Name matching
  const custName = sale.customer_name_snapshot || '';
  if (toCompactString(custName).includes(compactQuery)) return true;

  // 3. Customer Phone matching
  const phoneDigits = (sale.customer_phone_snapshot || '').replace(/\D/g, '');
  if (digitsQuery.length >= 3 && phoneDigits.includes(digitsQuery)) return true;

  // 4. Payment Method
  const paymentMethod = sale.payment_method || '';
  if (toCompactString(paymentMethod).includes(compactQuery)) return true;

  // 5. Token match
  const tokens = extractSearchTokens(rawQuery);
  const fullTarget = `${slipCompact}${toCompactString(custName)}${paymentMethod}`;
  return tokens.every((t) => {
    const ct = toCompactString(t);
    return ct ? fullTarget.includes(ct) : true;
  });
}

/**
 * Universal flexible search helper for general text lists.
 */
export function smartSearchMatch(
  fields: (string | number | null | undefined)[],
  query: string
): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim();
  const compactQuery = toCompactString(rawQuery);

  const combinedCompact = fields
    .map((f) => (f !== null && f !== undefined ? toCompactString(String(f)) : ''))
    .join('');

  if (combinedCompact.includes(compactQuery)) return true;

  const tokens = extractSearchTokens(rawQuery);
  return tokens.every((t) => {
    const ct = toCompactString(t);
    return ct ? combinedCompact.includes(ct) : true;
  });
}
