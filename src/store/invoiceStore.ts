import { create } from 'zustand';
import { invoiceService } from '@/lib/invoiceService';
import type {
  InvoiceDetail,
  InvoiceRecord,
} from '@/types/invoices.types';

interface InvoiceState {
  invoices: InvoiceRecord[];
  selectedInvoice: InvoiceDetail | null;
  pdfUrlCache: Record<string, { url: string; expiresAt: number }>;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  hasMore: boolean;
  nextCursor: string | null;
  roleDenied: boolean;
  filterStatus: string;

  // Actions
  setFilterStatus: (status: string) => void;
  loadInvoices: (shopId: string, refresh?: boolean) => Promise<void>;
  loadMoreInvoices: (shopId: string) => Promise<void>;
  loadInvoiceDetail: (invoiceId: string) => Promise<InvoiceDetail | null>;
  getPdfUrl: (invoice: InvoiceRecord) => Promise<string>;
  sharePdf: (invoiceNumber: string, pdfUrl: string) => Promise<void>;
  generateInvoice: (orderId: string) => Promise<{ invoiceId: string; invoiceNumber: string }>;
  reset: () => void;
}

export const useInvoiceStore = create<InvoiceState>((set, get) => ({
  invoices: [],
  selectedInvoice: null,
  pdfUrlCache: {},
  status: 'idle',
  error: null,
  hasMore: false,
  nextCursor: null,
  roleDenied: false,
  filterStatus: 'all',

  setFilterStatus: (filterStatus: string) => {
    set({ filterStatus });
  },

  loadInvoices: async (shopId: string, refresh: boolean = false) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const { filterStatus } = get();
      const res = await invoiceService.fetchInvoices(shopId, filterStatus, null, 20);

      set({
        invoices: res.invoices,
        hasMore: res.hasMore,
        nextCursor: res.nextCursor,
        roleDenied: res.roleDenied || false,
        status: 'success',
      });
    } catch (err: any) {
      set({
        status: 'error',
        error: err.message || 'Failed to load invoices.',
      });
    }
  },

  loadMoreInvoices: async (shopId: string) => {
    const { nextCursor, hasMore, status, invoices, filterStatus } = get();
    if (!shopId || !hasMore || status === 'loading' || !nextCursor) return;

    try {
      const res = await invoiceService.fetchInvoices(shopId, filterStatus, nextCursor, 20);
      set({
        invoices: [...invoices, ...res.invoices],
        hasMore: res.hasMore,
        nextCursor: res.nextCursor,
      });
    } catch (err: any) {
      console.warn('[InvoiceStore] loadMore error:', err);
    }
  },

  loadInvoiceDetail: async (invoiceId: string) => {
    set({ status: 'loading', error: null });
    try {
      const detail = await invoiceService.fetchInvoiceDetail(invoiceId);
      set({ selectedInvoice: detail, status: 'success' });
      return detail;
    } catch (err: any) {
      set({
        status: 'error',
        error: err.message || 'Failed to load invoice details.',
      });
      return null;
    }
  },

  getPdfUrl: async (invoice: InvoiceRecord) => {
    const cache = get().pdfUrlCache[invoice.id];
    const now = Date.now();

    // Check cached URL with 5 min buffer before expiry
    if (cache && cache.expiresAt > now + 300000) {
      return cache.url;
    }

    const url = await invoiceService.getInvoicePdfUrl(invoice);
    set((state) => ({
      pdfUrlCache: {
        ...state.pdfUrlCache,
        [invoice.id]: {
          url,
          expiresAt: now + 3500000,
        },
      },
    }));

    return url;
  },

  sharePdf: async (invoiceNumber: string, pdfUrl: string) => {
    await invoiceService.shareOrDownloadPdf(invoiceNumber, pdfUrl);
  },

  generateInvoice: async (orderId: string) => {
    return await invoiceService.generateInvoice(orderId);
  },

  reset: () => {
    set({
      invoices: [],
      selectedInvoice: null,
      pdfUrlCache: {},
      status: 'idle',
      error: null,
      hasMore: false,
      nextCursor: null,
      roleDenied: false,
      filterStatus: 'all',
    });
  },
}));
