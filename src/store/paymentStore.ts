import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { paymentService } from '@/lib/paymentService';
import type {
  PaymentProof,
  PaymentRecord,
  PaymentUploadState,
  SubmitProofResult,
} from '@/types/payments.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PaymentState {
  payments: PaymentRecord[];
  proofs: PaymentProof[];
  uploadState: PaymentUploadState;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  loadPayments: (shopId: string) => Promise<void>;
  loadProofs: (shopId: string, orderId?: string | null) => Promise<void>;
  submitProof: (
    shopId: string,
    orderId: string | null | undefined,
    file: { uri: string; name?: string; type?: string; size?: number },
    bank: string,
    referenceNumber: string,
    amount: number,
    resubmissionOf?: string | null,
  ) => Promise<SubmitProofResult>;
  cancelUpload: () => void;
  subscribe: (shopId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  payments: [],
  proofs: [],
  uploadState: { progress: 0, status: 'idle', error: null },
  status: 'idle',
  error: null,
  realtimeChannel: null,

  loadPayments: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });
    try {
      const payments = await paymentService.fetchPayments(shopId);
      set({ payments, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load payments.' });
    }
  },

  loadProofs: async (shopId: string, orderId?: string | null) => {
    if (!shopId) return;
    try {
      const proofs = await paymentService.fetchProofs(shopId, orderId);
      set({ proofs });
    } catch (err: any) {
      console.warn('[PaymentStore] Failed to load proofs:', err);
    }
  },

  submitProof: async (
    shopId: string,
    orderId: string | null | undefined,
    file: { uri: string; name?: string; type?: string; size?: number },
    bank: string,
    referenceNumber: string,
    amount: number,
    resubmissionOf?: string | null,
  ): Promise<SubmitProofResult> => {
    set({
      uploadState: { progress: 0.1, status: 'validating', error: null },
    });

    let uploadedPath: string | null = null;

    try {
      // 1. Upload to Supabase Storage with progress
      set({
        uploadState: { progress: 0.3, status: 'uploading', error: null },
      });

      uploadedPath = await paymentService.uploadProofFile(shopId, file, (progress) => {
        set({
          uploadState: { progress, status: 'uploading', error: null },
        });
      });

      // 2. Register proof in database via RPC
      set({
        uploadState: { progress: 0.9, status: 'verifying', error: null },
      });

      const res = await paymentService.submitProof(
        shopId,
        orderId,
        uploadedPath,
        amount,
        bank,
        referenceNumber,
        resubmissionOf,
      );

      if (res.errorCode === 'DUPLICATE_REFERENCE') {
        // If duplicate detected, remove the uploaded file to avoid orphan files
        if (uploadedPath) {
          void paymentService.deleteProofFile(uploadedPath);
        }
        set({
          uploadState: { progress: 0, status: 'error', error: res.message || 'Duplicate reference detected.' },
        });
        return res;
      }

      set({
        uploadState: { progress: 1.0, status: 'success', error: null },
      });

      // Refresh proofs list
      void get().loadProofs(shopId, orderId);

      return res;
    } catch (err: any) {
      // Cleanup orphan storage file if RPC or subsequent step failed
      if (uploadedPath) {
        void paymentService.deleteProofFile(uploadedPath);
      }

      const errorMessage = err.message || 'Failed to submit payment proof.';
      set({
        uploadState: { progress: 0, status: 'error', error: errorMessage },
      });
      throw err;
    }
  },

  cancelUpload: () => {
    set({
      uploadState: { progress: 0, status: 'idle', error: null },
    });
  },

  subscribe: (shopId: string) => {
    const existing = get().realtimeChannel;
    if (existing) {
      void supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`payments_shop_${shopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          void get().loadPayments(shopId);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_proofs',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          void get().loadProofs(shopId);
        },
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribe: () => {
    const ch = get().realtimeChannel;
    if (ch) {
      void supabase.removeChannel(ch);
      set({ realtimeChannel: null });
    }
  },

  reset: () => {
    get().unsubscribe();
    set({
      payments: [],
      proofs: [],
      uploadState: { progress: 0, status: 'idle', error: null },
      status: 'idle',
      error: null,
    });
  },
}));
