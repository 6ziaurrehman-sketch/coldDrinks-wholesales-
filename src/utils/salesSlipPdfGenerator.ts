// Embedded 128x128 rounded JPEG representation of assets/images/icon.png for A4 PDF slips
const SLIP_LOGO_JPEG_WIDTH = 128;
const SLIP_LOGO_JPEG_HEIGHT = 128;
const SLIP_LOGO_JPEG_BASE64 =
  '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';

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
  current_total_balance?: number;
  payment_method: string;
  items?: PdfSaleItem[];
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const KARACHI_TIMEZONE = 'Asia/Karachi';

/**
 * Pure JS Base64 decoder (works identically in React Native Hermes, Web, and Node without polyfills).
 */
function decodeBase64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  let pad = 0;
  if (clean.endsWith('==')) pad = 2;
  else if (clean.endsWith('=')) pad = 1;

  const outLen = (clean.length * 3) / 4 - pad;
  const bytes = new Uint8Array(outLen);
  let p = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const c1 = chars.indexOf(clean[i]);
    const c2 = chars.indexOf(clean[i + 1]);
    const c3 = clean[i + 2] === '=' ? 0 : chars.indexOf(clean[i + 2]);
    const c4 = clean[i + 3] === '=' ? 0 : chars.indexOf(clean[i + 3]);

    const triple = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
    if (p < outLen) bytes[p++] = (triple >> 16) & 0xff;
    if (p < outLen) bytes[p++] = (triple >> 8) & 0xff;
    if (p < outLen) bytes[p++] = triple & 0xff;
  }
  return bytes;
}

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
      dateStyle: 'medium',
      timeStyle: 'short',
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

  pushRaw(op: string) {
    this.ops.push(op);
  }

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

  strokeRect(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re S`);
  }

  fillAndStrokeRect(x: number, y: number, w: number, h: number) {
    this.ops.push(`${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re B`);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number) {
    this.ops.push(`${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`);
  }

  drawLogo(x: number, y: number, size: number) {
    this.ops.push(`q ${n2(size)} 0 0 ${n2(size)} ${n2(x)} ${n2(y)} cm /Im1 Do Q`);
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

/**
 * Draws the official tilted (-6deg) dashed double-ring Al Fajar Traders stamp matching SalesSlipModal.
 */
function drawOfficialStamp(
  cs: PdfContentStream,
  centerX: number,
  centerY: number,
  stampW: number,
  stampH: number,
  isPaid: boolean,
  isCompact: boolean
) {
  const cos6 = 0.994522;
  const sin6 = 0.104528;

  // Save graphics state, translate to stamp center, rotate counter-clockwise 6 degrees
  cs.pushRaw(`q ${cos6.toFixed(6)} ${sin6.toFixed(6)} ${(-sin6).toFixed(6)} ${cos6.toFixed(6)} ${n2(centerX)} ${n2(centerY)} cm`);

  const halfW = stampW / 2;
  const halfH = stampH / 2;

  // Outer stamp box (#eff6ff fill, #1d4ed8 solid border)
  cs.setFillRgb(0.937, 0.965, 1.0);
  cs.setStrokeRgb(0.114, 0.306, 0.847);
  cs.setLineWidth(isCompact ? 1.2 : 1.5);
  cs.setDash('[] 0 d');
  cs.fillAndStrokeRect(-halfW, -halfH, stampW, stampH);

  // Inner dashed ring
  const inset = isCompact ? 2.2 : 2.6;
  cs.setLineWidth(isCompact ? 0.7 : 0.9);
  cs.setDash('[2 2] 0 d');
  cs.strokeRect(-halfW + inset, -halfH + inset, stampW - inset * 2, stampH - inset * 2);
  cs.setDash('[] 0 d');

  // Text & inner light-blue divider lines (#93c5fd)
  const fBrand = isCompact ? 5.2 : 6.2;
  const fStatus = isCompact ? 5.8 : 6.9;
  const fSub = isCompact ? 4.3 : 5.0;
  const fFooter = isCompact ? 4.3 : 5.0;

  cs.setFillRgb(0.114, 0.306, 0.847);
  cs.drawCenteredText('* AL FAJAR TRADERS *', 0, halfH - inset - (isCompact ? 6.2 : 7.6), fBrand, true);

  // Top divider line inside stamp
  const topLineY = halfH - inset - (isCompact ? 8.3 : 10.2);
  cs.setStrokeRgb(0.576, 0.773, 0.992); // #93c5fd
  cs.setLineWidth(0.5);
  cs.drawLine(-halfW + inset + 5, topLineY, halfW - inset - 5, topLineY);

  // Status text + small checkmark vector icon
  const statusText = isPaid ? 'VERIFIED & PAID' : 'OFFICIAL SLIP';
  const statusW = estimateTextWidth(statusText, fStatus, true);
  const iconR = isCompact ? 2.6 : 3.2;
  const totalBadgeW = iconR * 2 + 3 + statusW;
  const badgeStartX = -totalBadgeW / 2;
  const statusBaselineY = isCompact ? -1.4 : -1.8;
  const circleCx = badgeStartX + iconR;
  const circleCy = statusBaselineY + (isCompact ? 2.0 : 2.4);

  // Draw small circle + checkmark stroke
  cs.setStrokeRgb(0.114, 0.306, 0.847);
  cs.setLineWidth(isCompact ? 0.65 : 0.8);
  const k = iconR * 0.552;
  cs.pushRaw(
    `${n2(circleCx)} ${n2(circleCy + iconR)} m ` +
      `${n2(circleCx + k)} ${n2(circleCy + iconR)} ${n2(circleCx + iconR)} ${n2(circleCy + k)} ${n2(circleCx + iconR)} ${n2(circleCy)} c ` +
      `${n2(circleCx + iconR)} ${n2(circleCy - k)} ${n2(circleCx + k)} ${n2(circleCy - iconR)} ${n2(circleCx)} ${n2(circleCy - iconR)} c ` +
      `${n2(circleCx - k)} ${n2(circleCy - iconR)} ${n2(circleCx - iconR)} ${n2(circleCy - k)} ${n2(circleCx - iconR)} ${n2(circleCy)} c ` +
      `${n2(circleCx - iconR)} ${n2(circleCy + k)} ${n2(circleCx - k)} ${n2(circleCy + iconR)} ${n2(circleCx)} ${n2(circleCy + iconR)} c S`
  );
  // Checkmark inside circle
  cs.pushRaw(
    `${n2(circleCx - iconR * 0.45)} ${n2(circleCy)} m ` +
      `${n2(circleCx - iconR * 0.1)} ${n2(circleCy - iconR * 0.4)} l ` +
      `${n2(circleCx + iconR * 0.5)} ${n2(circleCy + iconR * 0.4)} l S`
  );

  cs.setFillRgb(0.114, 0.306, 0.847);
  cs.drawText(statusText, badgeStartX + iconR * 2 + 3, statusBaselineY, fStatus, true);

  // Sub text (#2563eb)
  cs.setFillRgb(0.145, 0.388, 0.922);
  cs.drawCenteredText('WHOLESALE COLD DRINKS', 0, statusBaselineY - (isCompact ? 5.6 : 6.9), fSub, true);

  // Bottom divider line inside stamp
  const botLineY = -halfH + inset + (isCompact ? 6.8 : 8.5);
  cs.setStrokeRgb(0.576, 0.773, 0.992);
  cs.setLineWidth(0.5);
  cs.drawLine(-halfW + inset + 5, botLineY, halfW - inset - 5, botLineY);

  // Authorised signature (#1e40af)
  cs.setFillRgb(0.118, 0.251, 0.686);
  cs.drawCenteredText('AUTHORISED SIGNATURE', 0, -halfH + inset + (isCompact ? 2.1 : 2.8), fFooter, true);

  cs.pushRaw('Q');
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
  const pad = isCompact ? 7 : isWide ? 14 : 9;
  const cellTopY = cellBottomY + cellH;
  const innerLeft = cellX + pad;
  const innerRight = cellX + cellW - pad;
  const innerW = cellW - pad * 2;
  const centerX = cellX + cellW / 2;

  // Outer Slip Card (White + #cbd5e1 border matching SalesSlipModal.slipCard)
  cs.setFillRgb(1, 1, 1);
  cs.setStrokeRgb(0.796, 0.835, 0.882);
  cs.setLineWidth(1.0);
  cs.setDash('[] 0 d');
  cs.fillAndStrokeRect(cellX, cellBottomY, cellW, cellH);

  // =========================================================================
  // 1. CENTERED BRAND HEADER WITH LOGO (Identical to SalesSlipModal)
  // =========================================================================
  const logoSize = isCompact ? 20 : isWide ? 36 : 28;
  const logoY = cellTopY - (isCompact ? 5 : 7) - logoSize;
  cs.drawLogo(centerX - logoSize / 2, logoY, logoSize);

  let curY = logoY - (isCompact ? 8.5 : 10.5);
  cs.setFillRgb(0.059, 0.09, 0.165); // #0f172a
  cs.drawCenteredText('AL FAJAR TRADERS', centerX, curY, isCompact ? 8.5 : isWide ? 11.5 : 9.8, true);

  curY -= isCompact ? 7.2 : 8.5;
  cs.setFillRgb(0.2, 0.255, 0.333); // #334155
  cs.drawCenteredText(
    'Wholesale Cold Drinks & Beverages Distribution',
    centerX,
    curY,
    isCompact ? 5.6 : isWide ? 7.4 : 6.4,
    true
  );

  curY -= isCompact ? 6.5 : 7.5;
  cs.setFillRgb(0.392, 0.455, 0.545); // #64748b
  cs.drawCenteredText(
    'Official Sales Slip & Delivery Invoice',
    centerX,
    curY,
    isCompact ? 5.1 : isWide ? 6.5 : 5.7,
    false
  );

  curY -= isCompact ? 4 : 5;
  cs.setStrokeRgb(0.886, 0.91, 0.941); // #e2e8f0
  cs.setLineWidth(0.6);
  cs.drawLine(innerLeft, curY, innerRight, curY);

  // =========================================================================
  // 2. METADATA ROWS (Identical Labels to SalesSlipModal)
  // =========================================================================
  const metaFont = isCompact ? 6.0 : isWide ? 7.8 : 6.8;
  const metaStep = isCompact ? 7.8 : isWide ? 10.2 : 9.0;
  const customerLabel = sanitizePdfText(slip.customer_name_snapshot) || 'Retail Shop Customer';
  const phoneStr = slip.customer_phone_snapshot ? sanitizePdfText(slip.customer_phone_snapshot) : '';

  curY -= metaStep;
  cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawText('Receipt No:', innerLeft, curY, metaFont, false);
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawRightText(
    truncateToWidth(sanitizePdfText(slip.receipt_no) || 'SLIP', innerW * 0.6, metaFont, true),
    innerRight,
    curY,
    metaFont,
    true
  );

  curY -= metaStep;
  cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawText('Date & Time:', innerLeft, curY, metaFont, false);
  cs.setFillRgb(0.2, 0.255, 0.333);
  cs.drawRightText(formatPdfDate(slip.sale_date), innerRight, curY, metaFont, false);

  curY -= metaStep;
  cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawText('Customer (Shop):', innerLeft, curY, metaFont, false);
  cs.setFillRgb(0.059, 0.09, 0.165);
  const custMaxW = innerW - estimateTextWidth('Customer (Shop): ', metaFont, false);
  cs.drawRightText(truncateToWidth(customerLabel, custMaxW, metaFont, true), innerRight, curY, metaFont, true);

  if (phoneStr) {
    curY -= metaStep;
    cs.setFillRgb(0.392, 0.455, 0.545);
    cs.drawText('Phone:', innerLeft, curY, metaFont, false);
    cs.setFillRgb(0.2, 0.255, 0.333);
    cs.drawRightText(phoneStr, innerRight, curY, metaFont, false);
  }

  curY -= isCompact ? 4 : 5;
  cs.setStrokeRgb(0.886, 0.91, 0.941);
  cs.setLineWidth(0.6);
  cs.drawLine(innerLeft, curY, innerRight, curY);
  const itemsTopY = curY - (isCompact ? 3 : 4);

  // =========================================================================
  // 3. BOTTOM ANCHORED SECTION: FOOTER + TILTED OFFICIAL STAMP + TOTALS
  // =========================================================================
  // Footer note
  const footerLineY = cellBottomY + (isCompact ? 11 : 14);
  cs.setStrokeRgb(0.945, 0.961, 0.976); // #f1f5f9
  cs.setLineWidth(0.5);
  cs.drawLine(innerLeft, footerLineY, innerRight, footerLineY);
  cs.setFillRgb(0.392, 0.455, 0.545);
  cs.drawCenteredText(
    'Computer generated sales slip with verified digital stamp of Al Fajar Traders.',
    centerX,
    cellBottomY + (isCompact ? 4.2 : 5.5),
    isCompact ? 4.6 : isWide ? 6.2 : 5.2,
    false
  );

  // Official Tilted Stamp (-6deg)
  const due = Number(slip.balance_due || 0);
  const paid = Number(slip.paid_amount || 0);
  const isPaid = due === 0;
  const stampW = isCompact ? 106 : isWide ? 140 : 122;
  const stampH = isCompact ? 32 : isWide ? 42 : 37;
  const stampEnvelopeH = stampH + (isCompact ? 10 : 12);
  const stampCenterY = footerLineY + stampEnvelopeH / 2 + 1;
  drawOfficialStamp(cs, centerX, stampCenterY, stampW, stampH, isPaid, isCompact);

  // Payment & Totals section above Stamp
  const finFont = isCompact ? 6.0 : isWide ? 7.8 : 6.8;
  const finStep = isCompact ? 7.8 : isWide ? 10.4 : 9.0;
  let finY = footerLineY + stampEnvelopeH + (isCompact ? 4 : 5);

  // Optional Khata Balance (only if > 0)
  const totalKhata = Number(slip.current_total_balance || 0);
  if (totalKhata > 0 && !isCompact) {
    cs.setFillRgb(0.392, 0.455, 0.545);
    cs.drawText('Total Customer Loan Khata Balance:', innerLeft, finY, finFont - 0.5, false);
    cs.setFillRgb(0.059, 0.09, 0.165);
    cs.drawRightText(formatPdfMoney(totalKhata), innerRight, finY, finFont - 0.5, true);
    finY += finStep - 0.5;
  }

  // Remaining Balance Due
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText('Remaining Balance Due:', innerLeft, finY, finFont, false);
  if (due > 0) cs.setFillRgb(0.863, 0.149, 0.149); // #dc2626
  else cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawRightText(formatPdfMoney(due), innerRight, finY, finFont, true);
  finY += finStep;

  // Amount Paid (PAYMENT_METHOD)
  const payMethod = sanitizePdfText((slip.payment_method || 'cash').toUpperCase()) || 'CASH';
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText(`Amount Paid (${payMethod}):`, innerLeft, finY, finFont, true);
  cs.setFillRgb(0.02, 0.588, 0.412); // #059669
  cs.drawRightText(formatPdfMoney(paid), innerRight, finY, finFont, true);
  finY += finStep - 1.5;

  // Divider between Payment & Final Total
  cs.setStrokeRgb(0.886, 0.91, 0.941);
  cs.setLineWidth(0.5);
  cs.drawLine(innerLeft, finY, innerRight, finY);
  finY += isCompact ? 6.5 : 8.5;

  // Final Total (Bold primary #1d4ed8)
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText('Final Total:', innerLeft, finY, finFont + 0.8, true);
  cs.setFillRgb(0.114, 0.306, 0.847);
  cs.drawRightText(formatPdfMoney(slip.total_amount), innerRight, finY, finFont + 0.8, true);

  // Subtle top border above Final Total (#cbd5e1)
  const totalTopLineY = finY + (isCompact ? 6.2 : 7.8);
  cs.setStrokeRgb(0.796, 0.835, 0.882);
  cs.setLineWidth(0.7);
  cs.drawLine(innerLeft, totalTopLineY, innerRight, totalTopLineY);
  finY = totalTopLineY + (isCompact ? 4.8 : 6.2);

  // Discount if > 0
  const discount = Number(slip.discount || 0);
  if (discount > 0) {
    cs.setFillRgb(0.02, 0.588, 0.412);
    cs.drawText('Discount:', innerLeft, finY, finFont, false);
    cs.drawRightText(`-${formatPdfMoney(discount)}`, innerRight, finY, finFont, false);
    finY += finStep;
  }

  // Subtotal
  cs.setFillRgb(0.059, 0.09, 0.165);
  cs.drawText('Subtotal:', innerLeft, finY, finFont, false);
  cs.drawRightText(formatPdfMoney(slip.subtotal), innerRight, finY, finFont, false);

  const totalsDividerY = finY + (isCompact ? 5.5 : 7);
  cs.setStrokeRgb(0.886, 0.91, 0.941);
  cs.setLineWidth(0.6);
  cs.drawLine(innerLeft, totalsDividerY, innerRight, totalsDividerY);

  // =========================================================================
  // 4. ITEMS LIST (Matches SalesSlipModal ITEM DESCRIPTION / AMOUNT)
  // =========================================================================
  const thFont = isCompact ? 5.6 : 6.4;
  const thY = itemsTopY - (isCompact ? 6 : 7);
  if (thY > totalsDividerY + 6) {
    cs.setFillRgb(0.059, 0.09, 0.165);
    cs.drawText('ITEM DESCRIPTION', innerLeft, thY, thFont, true);
    cs.drawRightText('AMOUNT', innerRight, thY, thFont, true);

    const items = Array.isArray(slip.items) ? slip.items : [];
    const itemTitleFont = isCompact ? 5.9 : isWide ? 7.6 : 6.8;
    const itemSubFont = isCompact ? 5.2 : isWide ? 6.6 : 5.8;
    const rowH = isCompact ? 9.5 : isWide ? 16.5 : 14.5;
    const usableH = thY - (totalsDividerY + 4);
    const maxRows = Math.max(0, Math.floor(usableH / rowH));

    if (items.length === 0) {
      if (usableH >= 10) {
        cs.setFillRgb(0.58, 0.639, 0.722);
        cs.drawText('Summary sales slip (tap slip in app for details)', innerLeft, thY - 10, itemTitleFont - 0.3, false);
      }
    } else if (maxRows > 0) {
      const visibleCount = items.length <= maxRows ? items.length : Math.max(1, maxRows - 1);
      let rowY = thY - (isCompact ? 9 : 11);

      for (let i = 0; i < visibleCount; i++) {
        const it = items[i];
        const rawName = sanitizePdfText(it.product_name_snapshot) || 'Drink Item';
        const size = sanitizePdfText(it.size_label_snapshot);
        const includeSize = size && !rawName.toLowerCase().includes(size.toLowerCase());

        const ctn = Number(it.cartons_qty || 0);
        const loose = Number(it.loose_units_qty || 0);
        const subParts: string[] = [];
        if (includeSize) subParts.push(size);
        if (ctn > 0) subParts.push(`${ctn} carton${ctn === 1 ? '' : 's'}`);
        if (loose > 0) subParts.push(`${loose} bottle${loose === 1 ? '' : 's'}`);
        const subLine = subParts.join(' - ');

        const amountText = formatPdfMoney(it.line_total || 0);
        const amountW = estimateTextWidth(amountText, itemTitleFont, true);
        const nameMaxW = Math.max(45, innerW - amountW - 10);

        if (isCompact) {
          // Single tight line on 6/page so 6+ items fit with Logo + Stamp
          const compactLabel = subLine ? `${rawName} (${subLine.replace(/ cartons?/g, 'c').replace(/ bottles?/g, 'b')})` : rawName;
          cs.setFillRgb(0.059, 0.09, 0.165);
          cs.drawText(truncateToWidth(compactLabel, nameMaxW, itemTitleFont, true), innerLeft, rowY, itemTitleFont, true);
          cs.drawRightText(amountText, innerRight, rowY, itemTitleFont, true);
        } else {
          // Full 2-line layout matching SalesSlipModal!
          cs.setFillRgb(0.059, 0.09, 0.165);
          cs.drawText(truncateToWidth(rawName, nameMaxW, itemTitleFont, true), innerLeft, rowY, itemTitleFont, true);
          cs.drawRightText(amountText, innerRight, rowY - 2, itemTitleFont, true);
          if (subLine) {
            cs.setFillRgb(0.392, 0.455, 0.545);
            cs.drawText(truncateToWidth(subLine, nameMaxW, itemSubFont, false), innerLeft, rowY - 6.8, itemSubFont, false);
          }
        }

        rowY -= rowH;
      }

      if (items.length > visibleCount) {
        const remaining = items.slice(visibleCount);
        const remainingSum = remaining.reduce((sum, r) => sum + Number(r.line_total || 0), 0);
        cs.setFillRgb(0.278, 0.333, 0.412);
        cs.drawText(`+ ${remaining.length} more item(s)`, innerLeft, rowY, itemTitleFont - 0.2, true);
        cs.drawRightText(formatPdfMoney(remainingSum), innerRight, rowY, itemTitleFont - 0.2, true);
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

function concatByteChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/**
 * Generates a single multi-page A4 PDF containing all provided sales slips styled identically
 * to the individual SalesSlipModal (with logo, metadata, line items, totals, tilted digital stamp, and footer)
 * arranged in a 2, 4 (default), or 6 slips-per-sheet grid.
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
  const marginTop = 28;
  const marginBottom = 14;
  const gapX = 12;
  const gapY = 10;

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
    cs.drawText('AL FAJAR TRADERS - SALES SLIPS REPORT', marginX, A4_HEIGHT - 17, 8.5, true);
    cs.setFillRgb(0.392, 0.455, 0.545);
    cs.drawRightText(
      `Page ${pageIdx + 1} of ${totalPages}  |  ${perPage} Slips/A4  |  Total Slips: ${slips.length}  |  ${generatedLabel}`,
      A4_WIDTH - marginX,
      A4_HEIGHT - 17,
      7.0,
      false
    );
    cs.setStrokeRgb(0.796, 0.835, 0.882);
    cs.setLineWidth(0.7);
    cs.drawLine(marginX, A4_HEIGHT - 22, A4_WIDTH - marginX, A4_HEIGHT - 22);

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

  // Assemble PDF 1.4 byte chunks with shared JPEG Logo Image XObject (/Im1 = 5 0 obj)
  const logoBytes = decodeBase64ToBytes(SLIP_LOGO_JPEG_BASE64);
  const objectChunks: Uint8Array[] = [];
  const pageObjRefs: string[] = [];

  for (let i = 0; i < totalPages; i++) {
    const pageObjId = 6 + i * 2;
    pageObjRefs.push(`${pageObjId} 0 R`);
  }

  objectChunks.push(stringToAsciiBytes(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));
  objectChunks.push(
    stringToAsciiBytes(`2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${totalPages} >>\nendobj\n`)
  );
  objectChunks.push(
    stringToAsciiBytes(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`)
  );
  objectChunks.push(
    stringToAsciiBytes(
      `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`
    )
  );
  objectChunks.push(
    concatByteChunks([
      stringToAsciiBytes(
        `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${SLIP_LOGO_JPEG_WIDTH} /Height ${SLIP_LOGO_JPEG_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`
      ),
      logoBytes,
      stringToAsciiBytes(`\nendstream\nendobj\n`),
    ])
  );

  for (let i = 0; i < totalPages; i++) {
    const pageObjId = 6 + i * 2;
    const streamObjId = 7 + i * 2;
    const streamData = pageStreams[i];

    objectChunks.push(
      stringToAsciiBytes(
        `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(A4_WIDTH)} ${n2(
          A4_HEIGHT
        )}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents ${streamObjId} 0 R >>\nendobj\n`
      )
    );
    objectChunks.push(
      stringToAsciiBytes(
        `${streamObjId} 0 obj\n<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream\nendobj\n`
      )
    );
  }

  const headerBytes = stringToAsciiBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets: number[] = [0];
  let byteCursor = headerBytes.length;

  for (const objChunk of objectChunks) {
    offsets.push(byteCursor);
    byteCursor += objChunk.length;
  }

  const xrefOffset = byteCursor;
  let xref = `xref\n0 ${objectChunks.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objectChunks.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return {
    bytes: concatByteChunks([headerBytes, ...objectChunks, stringToAsciiBytes(xref + trailer)]),
    pageCount: totalPages,
  };
}
