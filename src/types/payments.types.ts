export type PaymentMethod = 'cash' | 'bank_transfer' | 'credit';
export type PaymentStatus = 'pending' | 'verified' | 'rejected' | 'refunded';
export type ProofStatus = 'submitted' | 'verified' | 'rejected';

export interface PaymentRecord {
  id: string;
  shopId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  orderId?: string | null;
  status: PaymentStatus;
  createdAt: string;
  verifiedAt?: string | null;
}

export interface PaymentProof {
  id: string;
  paymentId?: string | null;
  orderId?: string | null;
  shopId: string;
  filePath: string;
  amount: number;
  bank: string;
  referenceNumber: string;
  status: ProofStatus;
  rejectReason?: string | null;
  resubmissionOf?: string | null;
  createdAt: string;
  signedUrl?: string | null;
}

export interface PaymentUploadState {
  progress: number;
  status: 'idle' | 'validating' | 'compressing' | 'uploading' | 'verifying' | 'success' | 'error';
  error: string | null;
}

export interface SubmitProofResult {
  proofId?: string;
  status?: ProofStatus;
  errorCode?: 'DUPLICATE_REFERENCE' | 'VALIDATION_ERROR' | string;
  message?: string;
  existingProofId?: string;
  existingStatus?: string;
}
