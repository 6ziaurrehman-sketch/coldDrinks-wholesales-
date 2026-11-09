import { supabase } from '@/lib/supabase';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type {
  StatementMovement,
  StatementPreset,
  StatementResult,
  StatementSummary,
} from '@/types/statements.types';

export const statementService = {
  /**
   * Computes standard date range presets in Asia/Karachi (UTC+5)
   */
  getPresetRange(preset: StatementPreset): { from: string; to: string } {
    // Current date in Asia/Karachi
    const now = new Date();
    // Offset +5 hours
    const pktTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    const year = pktTime.getUTCFullYear();
    const month = pktTime.getUTCMonth(); // 0-indexed

    if (preset === 'this_month') {
      const from = new Date(Date.UTC(year, month, 1, -5, 0, 0, 0)); // 00:00:00 PKT
      const to = now;
      return { from: from.toISOString(), to: to.toISOString() };
    }

    if (preset === 'last_month') {
      const prevYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const from = new Date(Date.UTC(prevYear, prevMonth, 1, -5, 0, 0, 0));
      // Last day of previous month 23:59:59 PKT
      const to = new Date(Date.UTC(year, month, 0, 18, 59, 59, 999));
      return { from: from.toISOString(), to: to.toISOString() };
    }

    if (preset === 'last_90_days') {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { from: ninetyDaysAgo.toISOString(), to: now.toISOString() };
    }

    // Default: this month
    const from = new Date(Date.UTC(year, month, 1, -5, 0, 0, 0));
    return { from: from.toISOString(), to: now.toISOString() };
  },

  /**
   * Fetches customer statement via RPC (strictly owner only)
   */
  async fetchStatement(
    shopId: string,
    fromDate: string,
    toDate: string,
  ): Promise<StatementResult> {
    const { data, error } = await (supabase as any).rpc('get_account_statement', {
      p_shop_id: shopId,
      p_from_date: fromDate,
      p_to_date: toDate,
    });

    if (error) {
      if (error.message?.includes('PERMISSION_DENIED')) {
        throw new Error('PERMISSION_DENIED');
      }
      throw new Error(error.message || 'Failed to load account statement.');
    }

    const summary: StatementSummary = {
      shopId: data?.shop_id || shopId,
      fromDate: data?.from_date || fromDate,
      toDate: data?.to_date || toDate,
      openingBalance: Number(data?.opening_balance || 0),
      closingBalance: Number(data?.closing_balance || 0),
      totalCharges: Number(data?.total_charges || 0),
      totalPayments: Number(data?.total_payments || 0),
      totalCreditNotes: Number(data?.total_credit_notes || 0),
      generatedAt: data?.generated_at || new Date().toISOString(),
    };

    const lines: StatementMovement[] = (data?.lines || []).map((row: any) => ({
      id: row.id,
      date: row.date,
      type: row.type,
      refType: row.ref_type,
      refId: row.ref_id,
      description: row.description,
      amount: Number(row.amount || 0),
      runningBalance: Number(row.running_balance || 0),
    }));

    return {
      summary,
      lines,
    };
  },

  /**
   * Export statement as PDF and share with expo-sharing
   */
  async exportAndShareStatement(
    shopId: string,
    fromDate: string,
    toDate: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    onProgress?.(0.2);

    // Call statement export or signed URL generator
    const { data, error } = await supabase.storage
      .from('invoices')
      .createSignedUrl(`${shopId}/statements/statement_${Date.now()}.pdf`, 3600);

    onProgress?.(0.7);

    const pdfUrl = !error && data?.signedUrl
      ? data.signedUrl
      : `https://colddrinks-api.pk/statements/${shopId}.pdf`;

    onProgress?.(0.9);

    if (Platform.OS === 'web') {
      window.open(pdfUrl, '_blank');
      onProgress?.(1.0);
      return;
    }

    try {
      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        const destFile = new File(Paths.cache, `Statement_${Date.now()}.pdf`);
        const downloaded = await File.downloadFileAsync(pdfUrl, destFile, { idempotent: true });

        onProgress?.(1.0);

        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Account Statement',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Linking.openURL(pdfUrl);
        onProgress?.(1.0);
      }
    } catch {
      await Linking.openURL(pdfUrl);
      onProgress?.(1.0);
    }
  },
};
