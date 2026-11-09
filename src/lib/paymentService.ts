import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import type {
  PaymentProof,
  PaymentRecord,
  SubmitProofResult,
} from '@/types/payments.types';

export const paymentService = {
  fetchPayments: async (shopId: string): Promise<PaymentRecord[]> => {
    const { data, error } = await (supabase.rpc as any)('list_payments', {
      p_shop_id: shopId,
    });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as any[]) || []).map((p: any) => ({
      id: p.id,
      shopId: p.shop_id,
      amount: Number(p.amount || 0),
      method: p.method,
      reference: p.reference,
      orderId: p.order_id,
      status: p.status,
      createdAt: p.created_at,
      verifiedAt: p.verified_at,
    }));
  },

  fetchProofs: async (shopId: string, orderId?: string | null): Promise<PaymentProof[]> => {
    const { data, error } = await (supabase.rpc as any)('list_payment_proofs', {
      p_shop_id: shopId,
      p_order_id: orderId || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as any[]) || []).map((pp: any) => ({
      id: pp.id,
      paymentId: pp.payment_id,
      orderId: pp.order_id,
      shopId: pp.shop_id,
      filePath: pp.file_path,
      amount: Number(pp.amount || 0),
      bank: pp.bank,
      referenceNumber: pp.reference_number,
      status: pp.status,
      rejectReason: pp.reject_reason,
      resubmissionOf: pp.resubmission_of,
      createdAt: pp.created_at,
    }));
  },

  /**
   * Uploads proof screenshot or PDF to Supabase private storage bucket.
   * Path format: {shop_id}/{proof_uuid}.{ext}
   */
  uploadProofFile: async (
    shopId: string,
    file: { uri: string; name?: string; type?: string; size?: number },
    onProgress?: (progress: number) => void,
  ): Promise<string> => {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size && file.size > MAX_SIZE) {
      throw new Error('Payment proof file exceeds the maximum 5 MB limit.');
    }

    const ext = (file.uri.split('.').pop() || 'jpg').toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'pdf'];
    if (!validExts.includes(ext)) {
      throw new Error('Invalid file type. Supported formats: JPG, PNG, PDF.');
    }

    const filename = `${shopId}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;
    onProgress?.(0.2);

    try {
      let body: any;
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        body = await response.blob();
      } else {
        const formData = new FormData();
        formData.append('file', {
          uri: file.uri,
          name: filename,
          type: ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        } as any);
        body = formData;
      }

      onProgress?.(0.5);

      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .upload(filename, body, {
          contentType: ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      onProgress?.(0.85);
      return data.path;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to upload payment proof to storage.');
    }
  },

  /**
   * Deletes an orphan file from storage if RPC transaction fails.
   */
  deleteProofFile: async (filePath: string): Promise<void> => {
    try {
      await supabase.storage.from('payment-proofs').remove([filePath]);
    } catch {
      // Best-effort cleanup
    }
  },

  /**
   * Submits payment proof record to database via atomic RPC.
   */
  submitProof: async (
    shopId: string,
    orderId: string | null | undefined,
    filePath: string,
    amount: number,
    bank: string,
    referenceNumber: string,
    resubmissionOf?: string | null,
  ): Promise<SubmitProofResult> => {
    const { data, error } = await (supabase.rpc as any)('submit_payment_proof', {
      p_shop_id: shopId,
      p_order_id: orderId || null,
      p_file_path: filePath,
      p_amount: amount,
      p_bank: bank,
      p_reference_number: referenceNumber,
      p_resubmission_of: resubmissionOf || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const d = data as any;
    if (d.error_code === 'DUPLICATE_REFERENCE') {
      return {
        errorCode: 'DUPLICATE_REFERENCE',
        message: d.message,
        existingProofId: d.existing_proof_id,
        existingStatus: d.existing_status,
      };
    }

    return {
      proofId: d.proof_id,
      status: d.status,
    };
  },

  /**
   * Generates a temporary signed URL for viewing a private payment proof screenshot.
   */
  getProofSignedUrl: async (filePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } catch {
      // Fallback
    }
    return null;
  },
};
