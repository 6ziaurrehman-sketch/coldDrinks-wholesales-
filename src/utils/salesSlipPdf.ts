import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  buildSalesSlipsPdf,
  getKarachiDateKey,
  getTodayAndYesterdayKeys,
  type PdfSaleItem,
  type PdfSalesSlipData,
  type SlipsPerPageOption,
} from '@/utils/salesSlipPdfGenerator';

export {
  buildSalesSlipsPdf,
  getKarachiDateKey,
  getTodayAndYesterdayKeys,
  type PdfSaleItem,
  type PdfSalesSlipData,
  type SlipsPerPageOption,
};

/**
 * Generates an A4 multi-page PDF of sales slips and opens the native share sheet (or downloads on web).
 */
export async function shareSalesSlipsPdf(params: {
  slips: PdfSalesSlipData[];
  slipsPerPage: SlipsPerPageOption;
  label?: string;
}): Promise<{ pageCount: number; slipCount: number }> {
  const { bytes, pageCount } = buildSalesSlipsPdf(params.slips, params.slipsPerPage);
  const datePart = getKarachiDateKey(new Date()) || new Date().toISOString().slice(0, 10);
  const safeLabel = (params.label || 'Sales-Slips').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const fileName = `Al-Fajar-${safeLabel}-${params.slipsPerPage}perA4-${datePart}.pdf`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    return { pageCount, slipCount: params.slips.length };
  }

  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${params.slips.length} Sales Slip(s) (${pageCount} A4 PDF)`,
    UTI: 'com.adobe.pdf',
  });

  return { pageCount, slipCount: params.slips.length };
}
