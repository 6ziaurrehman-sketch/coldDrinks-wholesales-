import type { BulkParsedLine } from '@/types/advancedModules.types';

// Converts Urdu digits ۰۱۲۳۴۵۶۷۸۹ to English 0123456789
function normalizeUrduDigits(text: string): string {
  const urduDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return text.replace(/[۰-۹]/g, (match) => String(urduDigits.indexOf(match)));
}

export interface CatalogVariantRef {
  variantId: string;
  variantName: string;
  productName: string;
  brand?: string;
  unitPrice: number;
  packSize: number;
  saleUnit: string;
  inStock: boolean;
}

export const bulkOrderService = {
  /**
   * Parse an array of text lines and match against catalog variants
   */
  parseLines(
    lines: string[],
    catalog: CatalogVariantRef[],
  ): { parsedLines: BulkParsedLine[]; mergedDuplicatesCount: number } {
    const parsed: BulkParsedLine[] = [];
    const seenVariants = new Map<string, number>();
    let mergedDuplicatesCount = 0;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const normalized = normalizeUrduDigits(trimmed);

      // Match separators: =, x, X, :, tab, comma
      // E.g. "Pepsi 1.5L = 100" or "Coke 1L x 50" or "Sprite 500ml : 20" or "Gourmet 1.5L, 30"
      const match = normalized.match(/^(.*?)(?:[=xX:\t,]+)\s*(-?\d+(?:\.\d+)?)\s*$/);

      let queryText = '';
      let qty = 0;

      if (match) {
        queryText = match[1].trim();
        qty = parseFloat(match[2]);
      } else {
        // Fallback: search for last number in string
        const lastNumMatch = normalized.match(/^(.*?)\s+(\d+)\s*$/);
        if (lastNumMatch) {
          queryText = lastNumMatch[1].trim();
          qty = parseInt(lastNumMatch[2], 10);
        } else {
          queryText = normalized;
          qty = 0;
        }
      }

      if (isNaN(qty) || qty <= 0) {
        parsed.push({
          rawLine,
          status: 'invalid_qty',
          parsedQty: qty,
          confidence: 0,
        });
        continue;
      }

      if (!queryText) {
        parsed.push({
          rawLine,
          status: 'unrecognised',
          parsedQty: qty,
          confidence: 0,
        });
        continue;
      }

      // Fuzzy score against catalog
      const queryLower = queryText.toLowerCase().replace(/[^a-z0-9]/g, '');
      const scored = catalog.map((item) => {
        const fullTitle = `${item.productName} ${item.variantName}`.toLowerCase();
        const fullClean = fullTitle.replace(/[^a-z0-9]/g, '');

        let score = 0;
        if (fullClean === queryLower) {
          score = 1.0;
        } else if (fullClean.includes(queryLower) || queryLower.includes(fullClean)) {
          score = 0.85;
        } else {
          // Token matching
          const tokens = queryText.toLowerCase().split(/\s+/).filter(Boolean);
          const matchedTokens = tokens.filter((t) => fullTitle.includes(t));
          score = tokens.length > 0 ? (matchedTokens.length / tokens.length) * 0.75 : 0;
        }

        return { item, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const top = scored[0];
      if (!top || top.score < 0.3) {
        parsed.push({
          rawLine,
          status: 'unrecognised',
          parsedQty: qty,
          confidence: 0,
        });
        continue;
      }

      // Check if ambiguous (runner up has close score)
      const runnerUp = scored[1];
      const isAmbiguous = runnerUp && runnerUp.score >= 0.5 && Math.abs(top.score - runnerUp.score) < 0.15;

      if (isAmbiguous) {
        const candidateItems = scored.slice(0, 3).filter((s) => s.score >= 0.4).map((s) => ({
          variantId: s.item.variantId,
          variantName: s.item.variantName,
          productName: s.item.productName,
          unitPrice: s.item.unitPrice,
          packSize: s.item.packSize,
        }));

        parsed.push({
          rawLine,
          status: 'ambiguous',
          parsedQty: qty,
          confidence: top.score,
          candidates: candidateItems,
        });
        continue;
      }

      // Check stock
      if (!top.item.inStock) {
        parsed.push({
          rawLine,
          status: 'unavailable',
          variantId: top.item.variantId,
          variantName: top.item.variantName,
          productName: top.item.productName,
          unitPrice: top.item.unitPrice,
          packSize: top.item.packSize,
          saleUnit: top.item.saleUnit,
          parsedQty: qty,
          confidence: top.score,
        });
        continue;
      }

      // Check for duplicate variant in same bulk list
      const existingIdx = seenVariants.get(top.item.variantId);
      if (existingIdx !== undefined) {
        // Merge quantities
        parsed[existingIdx].parsedQty += qty;
        mergedDuplicatesCount++;
      } else {
        seenVariants.set(top.item.variantId, parsed.length);
        parsed.push({
          rawLine,
          status: 'ok',
          variantId: top.item.variantId,
          variantName: top.item.variantName,
          productName: top.item.productName,
          unitPrice: top.item.unitPrice,
          packSize: top.item.packSize,
          saleUnit: top.item.saleUnit,
          parsedQty: qty,
          confidence: top.score,
        });
      }
    }

    return { parsedLines: parsed, mergedDuplicatesCount };
  },
};
