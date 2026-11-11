export type SlipsPerPageOption = 2 | 4 | 6;

export interface PdfSaleItem {
  product_name_snapshot?: string | null;
  size_label_snapshot?: string | null;
  cartons_qty?: number | null;
  loose_units_qty?: number | null;
  line_total?: number | null;
}

export interface PdfSalesSlipData {
  id: string;
  receipt_no: string;
  customer_name_snapshot: string;
  customer_phone_snapshot?: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_method: string;
  items?: PdfSaleItem[];
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const KARACHI_TIMEZONE = 'Asia/Karachi';

/**
 * Returns YYYY-MM-DD in Asia/Karachi timezone (with safe local fallback).
 */
export function getKarachiDateKey(input: Date | string): string | null {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: KARACHI_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback below if Intl timeZone data is unavailable
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns Today and Yesterday YYYY-MM-DD keys in Asia/Karachi timezone.
 */
export function getTodayAndYesterdayKeys(now: Date = new Date()): {
  todayKey: string;
  yesterdayKey: string;
} {
  const todayKey = getKarachiDateKey(now) || '';
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = getKarachiDateKey(yesterdayDate) || '';
  return { todayKey, yesterdayKey };
}

/**
 * Normalizes any text into safe single-byte printable ASCII characters.
 */
export function sanitizePdfText(value: unknown): string {
  const raw = String(value ?? '');
  return raw
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Approximate string width in PDF points for Helvetica / Helvetica-Bold.
 */
function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') units += 0.28;
    else if ('ilI1|.,:;\'!'.includes(ch)) units += 0.28;
    else if ('mwMW@%'.includes(ch)) units += 0.84;
    else if (ch >= 'A' && ch <= 'Z') units += 0.68;
    else if (ch >= '0' && ch <= '9') units += 0.56;
    else units += 0.52;
  }
  return units * fontSize * (bold ? 1.05 : 1.0);
}

function truncateToWidth(text: string, maxWidthPt: number, fontSize: number, bold = false): string {
  const clean = sanitizePdfText(text);
  if (!clean) return '';
  if (estimateTextWidth(clean, fontSize, bold) <= maxWidthPt) return clean;

  const ellipsis = '...';
  const ellipsisW = estimateTextWidth(ellipsis, fontSize, bold);
  if (maxWidthPt <= ellipsisW) return '';

  let result = '';
  for (let i = 0; i < clean.length; i++) {
    const candidate = result + clean[i];
    if (estimateTextWidth(candidate, fontSize, bold) + ellipsisW > maxWidthPt) {
      break;
    }
    result = candidate;
  }
  return (result.trimEnd() || clean.slice(0, 1)) + ellipsis;
}

function formatPdfMoney(amount: unknown): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = safe.toLocaleString('en-US', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `Rs. ${formatted}`;
}

function formatPdfDate(rawDate: string | undefined): string {
  const parsed = rawDate ? new Date(rawDate) : new Date();
  const valid = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  try {
    const str = valid.toLocaleString('en-PK', {
      timeZone: KARACHI_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return sanitizePdfText(str);
  } catch {
    return sanitizePdfText(valid.toISOString().slice(0, 16).replace('T', ' '));
  }
}

function n2(val: number): string {
  return val.toFixed(2);
}

class PdfContentStream {
  private ops: string[] = [];

  setFillRgb(r: number, g: number, b: number) {
    this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  }

  setStrokeRgb(r: number, g: number, b: number) {
    this.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  }

  setLineWidth(w: number) {
    this.ops.push(`${n2(w)} w`);
  }

  setDash(pattern: string) {
    this.ops.push(pattern);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
  }

  fillAndStrokeRect(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re B`);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number) {
    this.ops.push(`${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`);
  }

  drawText(text: string, x: number, y: number, fontSize: number, bold = false) {
    const clean = escapePdfLiteral(sanitizePdfText(text));
    if (!clean) return;
    const fontKey = bold ? '/F2' : '/F1';
    this.ops.push(`BT ${fontKey} ${n2(fontSize)} Tf ${n2(x)} ${n2(y)} Td (${clean}) Tj ET`);
  }

  drawRightText(text: string, rightX: number, y: number, fontSize: number, bold = false) {
    const clean = sanitizePdfText(text);
    if (!clean) return;
    const w = estimateTextWidth(clean, fontSize, bold);
    this.drawText(clean, rightX - w, y, fontSize, bold);
  }

  drawCenteredText(text: string, centerX: number, y: number, fontSize: number, bold = false) {
    const clean = sanitizePdfText(text);
    if (!clean) return;
    const w = estimateTextWidth(clean, fontSize, bold);
    this.drawText(clean, centerX - w / 2, y, fontSize, bold);
  }

  toString(): string {
    return this.ops.join('\n');
  }
}

function drawSlipCell(
  cs: PdfContentStream,
  slip: PdfSalesSlipData,
  cellX: number,
  cellBottomY: number,
  cellW: number,
  cellH: number,
  perPage: SlipsPerPageOption
) {
  const isCompact = perPage === 6;
  const isWide = perPage === 2;
  const pad = isCompact ? 7 : isWide ? 12 : 9;
  const cellTopY = cellBottomY + cellH;
  const innerLeft = cellX + pad;
  const innerRight = cellX + cellW - pad;
  const innerW = cellW - pad * 2;

  // Outer card fill + border
  cs.setFillRgb(1, 1, 1);
  cs.setStrokeRgb(0.796, 0.835, 0.882);
  cs.setLineWidth(0.9);
  cs.setDash('[] 0 d');
  cs.fillAndStrokeRect(cellX, cellBottomY, cellW, cellH);

  // Header band
  const headerH = isCompact ? 23 : 28;
  const headerY = cellTopY - headerH;
  cs.setFillRgb(0.937, 0.965, 1.0);
  cs.setStrokeRgb(0.749, 0.859, 0.996);
  cs.setLineWidth(0.6);
  cs.fillAndStrokeRect(cellX, headerY, cellW, headerH);

  // Brand title & subtitle
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText('AL FAJAR TRADERS', innerLeft, headerY + (isCompact ? 13 : 16), isCompact ? 8 : isWide ? 10.5 : 9, true);
  cs.setFillRgb(0.278, 0.333, 0.412);
  cs.drawText(
    'Wholesale Cold Drinks & Beverages',
    innerLeft,
    headerY + (isCompact ? 5 : 6),
    isCompact ? 5.8 : isWide ? 7.2 : 6.4,
    false
  );

  // Status badge pill
  const due = Number(slip.balance_due || 0);
  const paid = Number(slip.paid_amount || 0);
  const isPaid = due <= 0;
  const isPartial = paid > 0 && due > 0;
  const badgeText = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'CREDIT';
  const badgeW = isCompact ? 42 : 48;
  const badgeH = isCompact ? 12 : 14;
  const badgeX = innerRight - badgeW;
  const badgeY = headerY + (headerH - badgeH) / 2;

  if (isPaid) {
    cs.setFillRgb(0.925, 0.992, 0.961);
    cs.setStrokeRgb(0.02, 0.588, 0.412);
  } else if (isPartial) {
    cs.setFillRgb(0.996, 0.953, 0.78);
    cs.setStrokeRgb(0.851, 0.467, 0.024);
  } else {
    cs.setFillRgb(0.996, 0.886, 0.886);
    cs.setStrokeRgb(0.863, 0.149, 0.149);
  }
  cs.setLineWidth(0.6);
  cs.fillAndStrokeRect(badgeX, badgeY, badgeW, badgeH);

  if (isPaid) cs.setFillRgb(0.02, 0.588, 0.412);
  else if (isPartial) cs.setFillRgb(0.706, 0.325, 0.035);
  else cs.setFillRgb(0.863, 0.149, 0.149);
  cs.drawCenteredText(badgeText, badgeX + badgeW / 2, badgeY + (isCompact ? 3.5 : 4.2), isCompact ? 6 : 6.8, true);

  // Metadata rows
  const metaFont = isCompact ? 6.6 : isWide ? 8 : 7.2;
  let curY = headerY - (isCompact ? 10 : 12);

  cs.setFillRgb(0.114, 0.306, 0.847);
  cs.drawText(
    truncateToWidth(sanitizePdfText(slip.receipt_no) || 'SLIP', innerW * 0.52, metaFont, true),
    innerLeft,
    curY,
    metaFont,
    true
  );
  cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawRightText(formatPdfDate(slip.sale_date), innerRight, curY, metaFont - 0.5, false);

  curY -= isCompact ? 9.5 : 11.5;
  const phoneStr = slip.customer_phone_snapshot ? sanitizePdfText(slip.customer_phone_snapshot) : '';
  const phoneReserve = phoneStr ? estimateTextWidth(phoneStr, metaFont - 0.5, false) + 8 : 0;
  const customerLabel = sanitizePdfText(slip.customer_name_snapshot) || 'Walk-in Customer';
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText(
    truncateToWidth(customerLabel, innerW - phoneReserve, metaFont, true),
    innerLeft,
    curY,
    metaFont,
    true
  );
  if (phoneStr) {
    cs.setFillRgb(0.278, 0.333, 0.412);
    cs.drawRightText(phoneStr, innerRight, curY, metaFont - 0.5, false);
  }

  curY -= isCompact ? 5 : 6;
  cs.setStrokeRgb(0.886, 0.91, 0.941);
  cs.setLineWidth(0.5);
  cs.drawLine(innerLeft, curY, innerRight, curY);
  const itemsTopY = curY - (isCompact ? 3 : 4);

  // Bottom anchored section (Stamp + Payment + Totals)
  const stampH = isCompact ? 14 : 18;
  const stampY = cellBottomY + (isCompact ? 5 : 6);
  cs.setFillRgb(0.937, 0.965, 1.0);
  cs.setStrokeRgb(0.114, 0.306, 0.847);
  cs.setLineWidth(0.8);
  cs.fillAndStrokeRect(innerLeft, stampY, innerW, stampH);
  cs.setFillRgb(0.114, 0.306, 0.847);
  const stampMsg = isPaid ? 'AL FAJAR TRADERS  |  VERIFIED & PAID' : 'AL FAJAR TRADERS  |  OFFICIAL SALES SLIP';
  cs.drawCenteredText(stampMsg, cellX + cellW / 2, stampY + (isCompact ? 4.2 : 6), isCompact ? 5.8 : 6.6, true);

  const finFont = isCompact ? 6.6 : isWide ? 8 : 7.2;
  const finStep = isCompact ? 8.8 : 10.5;
  let finY = stampY + stampH + (isCompact ? 6 : 8);

  // Remaining Due
  cs.setFillRgb(0.278, 0.333, 0.412);
  cs.drawText('Remaining Due:', innerLeft, finY, finFont, false);
  if (due > 0) cs.setFillRgb(0.863, 0.149, 0.149);
  else cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawRightText(formatPdfMoney(due), innerRight, finY, finFont, true);
  finY += finStep;

  // Paid row
  const payMethod = sanitizePdfText((slip.payment_method || 'cash').toUpperCase()) || 'CASH';
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText(`Paid (${payMethod}):`, innerLeft, finY, finFont, true);
  cs.setFillRgb(0.02, 0.588, 0.412);
  cs.drawRightText(formatPdfMoney(paid), innerRight, finY, finFont, true);
  finY += finStep + 1;

  // Final Total
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText('Final Total:', innerLeft, finY, finFont + 0.8, true);
  cs.setFillRgb(0.114, 0.306, 0.847);
  cs.drawRightText(formatPdfMoney(slip.total_amount), innerRight, finY, finFont + 0.8, true);
  finY += finStep + 1;

  // Discount if > 0
  const discount = Number(slip.discount || 0);
  if (discount > 0) {
    cs.setFillRgb(0.02, 0.588, 0.412);
    cs.drawText('Discount:', innerLeft, finY, finFont - 0.3, false);
    cs.drawRightText(`-${formatPdfMoney(discount)}`, innerRight, finY, finFont - 0.3, false);
    finY += finStep - 0.5;
  }

  // Subtotal
  cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawText('Subtotal:', innerLeft, finY, finFont - 0.3, false);
  cs.drawRightText(formatPdfMoney(slip.subtotal), innerRight, finY, finFont - 0.3, false);

  const totalsDividerY = finY + finStep - (isCompact ? 1 : 0.5);
  cs.setStrokeRgb(0.886, 0.91, 0.941);
  cs.setLineWidth(0.5);
  cs.drawLine(innerLeft, totalsDividerY, innerRight, totalsDividerY);

  // Items Table
  const thHeight = isCompact ? 11 : 13;
  const thY = itemsTopY - thHeight;
  if (thY > totalsDividerY + 6) {
    cs.setFillRgb(0.973, 0.98, 0.988);
    cs.fillRect(innerLeft, thY, innerW, thHeight);
    const thFont = isCompact ? 5.8 : 6.4;
    const qtyColRight = innerRight - (isWide ? 95 : isCompact ? 54 : 60);

    cs.setFillRgb(0.392, 0.455, 0.545);
    cs.drawText('ITEM DESCRIPTION', innerLeft + 3, thY + (isCompact ? 3.2 : 4), thFont, true);
    cs.drawRightText('QTY', qtyColRight, thY + (isCompact ? 3.2 : 4), thFont, true);
    cs.drawRightText('TOTAL', innerRight - 2, thY + (isCompact ? 3.2 : 4), thFont, true);

    const items = Array.isArray(slip.items) ? slip.items : [];
    const itemFont = isCompact ? 6.2 : isWide ? 7.6 : 6.8;
    const rowH = isCompact ? 9.5 : isWide ? 13 : 11.2;
    const usableH = thY - (totalsDividerY + 3);
    const maxRows = Math.max(0, Math.floor(usableH / rowH));

    if (items.length === 0) {
      if (usableH >= rowH) {
        cs.setFillRgb(0.58, 0.639, 0.722);
        cs.drawText(
          'Summary sales slip (tap individual slip for full item breakdown)',
          innerLeft + 3,
          thY - rowH + 2,
          itemFont - 0.3,
          false
        );
      }
    } else if (maxRows > 0) {
      const visibleCount = items.length <= maxRows ? items.length : Math.max(1, maxRows - 1);
      let rowY = thY - rowH + 2.5;

      for (let i = 0; i < visibleCount; i++) {
        const it = items[i];
        const rawName = sanitizePdfText(it.product_name_snapshot) || 'Drink Item';
        const size = sanitizePdfText(it.size_label_snapshot);
        const fullName =
          size && !rawName.toLowerCase().includes(size.toLowerCase()) ? `${rawName} (${size})` : rawName;

        const ctn = Number(it.cartons_qty || 0);
        const loose = Number(it.loose_units_qty || 0);
        const qtyParts: string[] = [];
        if (ctn > 0) qtyParts.push(`${ctn}c`);
        if (loose > 0) qtyParts.push(`${loose}b`);
        const qtyText = qtyParts.join('+') || '1';

        const qtyW = estimateTextWidth(qtyText, itemFont, false);
        const nameMaxW = Math.max(40, qtyColRight - qtyW - (innerLeft + 8));

        cs.setFillRgb(0.059, 0.09, 0.165);
        cs.drawText(truncateToWidth(fullName, nameMaxW, itemFont, false), innerLeft + 3, rowY, itemFont, false);
        cs.setFillRgb(0.278, 0.333, 0.412);
        cs.drawRightText(qtyText, qtyColRight, rowY, itemFont, false);
        cs.setFillRgb(0.059, 0.09, 0.165);
        cs.drawRightText(formatPdfMoney(it.line_total || 0), innerRight - 2, rowY, itemFont, true);

        rowY -= rowH;
      }

      if (items.length > visibleCount) {
        const remaining = items.slice(visibleCount);
        const remainingSum = remaining.reduce((sum, r) => sum + Number(r.line_total || 0), 0);
        cs.setFillRgb(0.278, 0.333, 0.412);
        cs.drawText(`+ ${remaining.length} more item(s)`, innerLeft + 3, rowY, itemFont - 0.2, true);
        cs.drawRightText(formatPdfMoney(remainingSum), innerRight - 2, rowY, itemFont - 0.2, true);
      }
    }
  }
}

function stringToAsciiBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Generates a single multi-page A4 PDF containing all provided sales slips arranged in a 2, 4, or 6 slips-per-sheet grid.
 */
export function buildSalesSlipsPdf(
  slips: PdfSalesSlipData[],
  slipsPerPage: SlipsPerPageOption = 4
): { bytes: Uint8Array; pageCount: number } {
  if (!slips || slips.length === 0) {
    throw new Error('Select at least one sales slip to generate PDF.');
  }

  const perPage: SlipsPerPageOption = slipsPerPage === 2 || slipsPerPage === 6 ? slipsPerPage : 4;
  const cols = perPage === 2 ? 1 : 2;
  const rows = perPage === 6 ? 3 : 2;
  const totalPages = Math.ceil(slips.length / perPage);

  const marginX = 16;
  const marginTop = 30;
  const marginBottom = 16;
  const gapX = 12;
  const gapY = 12;

  const gridLeft = marginX;
  const gridTop = A4_HEIGHT - marginTop;
  const gridW = A4_WIDTH - marginX * 2;
  const gridH = gridTop - marginBottom;

  const cellW = cols === 1 ? gridW : (gridW - gapX) / 2;
  const cellH = (gridH - gapY * (rows - 1)) / rows;

  const generatedLabel = formatPdfDate(new Date().toISOString());
  const pageStreams: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const cs = new PdfContentStream();

    // A4 Sheet Header
    cs.setFillRgb(0.114, 0.306, 0.847);
    cs.drawText('AL FAJAR TRADERS - SALES SLIPS REPORT', marginX, A4_HEIGHT - 19, 9, true);
    cs.setFillRgb(0.392, 0.455, 0.545);
    cs.drawRightText(
      `Page ${pageIdx + 1} of ${totalPages}  |  ${perPage} Slips/A4  |  Total Slips: ${slips.length}  |  ${generatedLabel}`,
      A4_WIDTH - marginX,
      A4_HEIGHT - 19,
      7.2,
      false
    );
    cs.setStrokeRgb(0.796, 0.835, 0.882);
    cs.setLineWidth(0.7);
    cs.drawLine(marginX, A4_HEIGHT - 24, A4_WIDTH - marginX, A4_HEIGHT - 24);

    // Cut guides between slips
    cs.setStrokeRgb(0.84, 0.87, 0.91);
    cs.setLineWidth(0.5);
    cs.setDash('[3 3] 0 d');
    if (cols === 2) {
      const midX = gridLeft + cellW + gapX / 2;
      cs.drawLine(midX, marginBottom, midX, gridTop);
    }
    for (let r = 0; r < rows - 1; r++) {
      const cutY = gridTop - (r + 1) * cellH - r * gapY - gapY / 2;
      cs.drawLine(gridLeft, cutY, gridLeft + gridW, cutY);
    }
    cs.setDash('[] 0 d');

    const startIdx = pageIdx * perPage;
    const endIdx = Math.min(slips.length, startIdx + perPage);

    for (let k = startIdx; k < endIdx; k++) {
      const slot = k - startIdx;
      const row = Math.floor(slot / cols);
      const col = slot % cols;

      const x = gridLeft + col * (cellW + gapX);
      const bottomY = gridTop - (row + 1) * cellH - row * gapY;
      drawSlipCell(cs, slips[k], x, bottomY, cellW, cellH, perPage);
    }

    pageStreams.push(cs.toString());
  }

  const objects: string[] = [];
  const pageObjRefs: string[] = [];

  for (let i = 0; i < totalPages; i++) {
    const pageObjId = 5 + i * 2;
    pageObjRefs.push(`${pageObjId} 0 R`);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${totalPages} >>\nendobj\n`
  );
  objects.push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`
  );
  objects.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`
  );

  for (let i = 0; i < totalPages; i++) {
    const pageObjId = 5 + i * 2;
    const streamObjId = 6 + i * 2;
    const streamData = pageStreams[i];

    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(A4_WIDTH)} ${n2(
        A4_HEIGHT
      )}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObjId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${streamObjId} 0 obj\n<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream\nendobj\n`
    );
  }

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  let body = header;
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }

  const xrefOffset = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const fullPdf = body + xref + trailer;

  return {
    bytes: stringToAsciiBytes(fullPdf),
    pageCount: totalPages,
  };
}
