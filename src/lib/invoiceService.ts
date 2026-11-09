import { supabase } from '@/lib/supabase';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type {
  InvoiceDetail,
  InvoiceRecord,
  ListInvoicesResponse,
} from '@/types/invoices.types';

export const invoiceService = {
  /**
   * Generates invoice atomically using DB sequence and delivered quantities
   */
  async generateInvoice(orderId: string): Promise<{ invoiceId: string; invoiceNumber: string }> {
    const { data, error } = await (supabase as any).rpc('generate_invoice', {
      p_order_id: orderId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to generate invoice.');
    }

    return {
      invoiceId: data?.invoice_id,
      invoiceNumber: data?.invoice_number,
    };
  },

  /**
   * Fetches paginated invoices for a shop
   */
  async fetchInvoices(
    shopId: string,
    status: string = 'all',
    cursor?: string | null,
    limit: number = 20,
  ): Promise<ListInvoicesResponse> {
    const { data, error } = await (supabase as any).rpc('list_invoices', {
      p_shop_id: shopId,
      p_status: status,
      p_cursor: cursor || null,
      p_limit: limit,
    });

    if (error) {
      throw new Error(error.message || 'Failed to load invoices.');
    }

    const invoices: InvoiceRecord[] = (data?.invoices || []).map((row: any) => ({
      id: row.id,
      shopId: row.shop_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      invoiceNumber: row.invoice_number,
      version: row.version,
      status: row.status,
      subtotal: Number(row.subtotal || 0),
      discounts: Number(row.discounts || 0),
      tax: Number(row.tax || 0),
      deliveryCharge: Number(row.delivery_charge || 0),
      deposits: Number(row.deposits || 0),
      total: Number(row.total || 0),
      paidAmount: Number(row.paid_amount || 0),
      remainingAmount: Number(row.remaining_amount || 0),
      dueDate: row.due_date,
      pdfStoragePath: row.pdf_storage_path,
      pdfGeneratedAt: row.pdf_generated_at,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      invoices,
      hasMore: Boolean(data?.has_more),
      nextCursor: data?.next_cursor || null,
      roleDenied: Boolean(data?.role_denied),
    };
  },

  /**
   * Fetches single invoice detail with items, receipts, and credit notes
   */
  async fetchInvoiceDetail(invoiceId: string): Promise<InvoiceDetail> {
    const { data, error } = await (supabase as any).rpc('get_invoice_detail', {
      p_invoice_id: invoiceId,
    });

    if (error) {
      throw new Error(error.message || 'Failed to load invoice details.');
    }

    const raw = data?.invoice || {};
    const invoice: InvoiceRecord = {
      id: raw.id,
      shopId: raw.shop_id,
      orderId: raw.order_id,
      orderNumber: raw.order_number,
      invoiceNumber: raw.invoice_number,
      version: raw.version || 1,
      status: raw.status || 'unpaid',
      subtotal: Number(raw.subtotal || 0),
      discounts: Number(raw.discounts || 0),
      tax: Number(raw.tax || 0),
      deliveryCharge: Number(raw.delivery_charge || 0),
      deposits: Number(raw.deposits || 0),
      total: Number(raw.total || 0),
      paidAmount: Number(raw.paid_amount || 0),
      remainingAmount: Number(raw.remaining_amount || 0),
      dueDate: raw.due_date,
      pdfStoragePath: raw.pdf_storage_path,
      pdfGeneratedAt: raw.pdf_generated_at,
      notes: raw.notes,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };

    const items = (data?.items || []).map((it: any) => ({
      id: it.id,
      invoiceId: it.invoice_id,
      variantId: it.variant_id,
      productName: it.product_name,
      variantTitle: it.variant_title,
      unitPrice: Number(it.unit_price || 0),
      quantity: Number(it.quantity || 0),
      totalPrice: Number(it.total_price || 0),
      createdAt: it.created_at,
    }));

    const receipts = (data?.receipts || []).map((rc: any) => ({
      id: rc.id,
      shopId: raw.shop_id,
      paymentId: rc.payment_id,
      invoiceId: raw.id,
      receiptNumber: rc.receipt_number,
      amount: Number(rc.amount || 0),
      paymentMethod: rc.payment_method,
      referenceNumber: rc.reference_number,
      pdfStoragePath: rc.pdf_storage_path,
      createdAt: rc.created_at,
    }));

    const creditNotes = (data?.credit_notes || []).map((cn: any) => ({
      id: cn.id,
      shopId: raw.shop_id,
      invoiceId: raw.id,
      creditNoteNumber: cn.credit_note_number,
      amount: Number(cn.amount || 0),
      reason: cn.reason,
      status: cn.status,
      createdAt: cn.created_at,
    }));

    return {
      invoice,
      items,
      receipts,
      creditNotes,
    };
  },

  /**
   * Generates or retrieves signed URL for the invoice PDF with auto-refresh expiry
   */
  async getInvoicePdfUrl(invoice: InvoiceRecord): Promise<string> {
    const path = invoice.pdfStoragePath || `${invoice.shopId}/${invoice.invoiceNumber}.pdf`;
    const { data, error } = await supabase.storage
      .from('invoices')
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error || !data?.signedUrl) {
      return `https://colddrinks-api.pk/invoices/${invoice.invoiceNumber}.pdf`;
    }

    return data.signedUrl;
  },

  /**
   * Download and share PDF using expo-sharing or system viewer fallback
   */
  async shareOrDownloadPdf(invoiceNumber: string, pdfUrl: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        window.open(pdfUrl, '_blank');
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();

      if (isAvailable) {
        const destFile = new File(Paths.cache, `${invoiceNumber}.pdf`);
        const downloaded = await File.downloadFileAsync(pdfUrl, destFile, { idempotent: true });

        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${invoiceNumber}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Linking.openURL(pdfUrl);
      }
    } catch {
      await Linking.openURL(pdfUrl);
    }
  },
};
