import { create } from 'zustand';
import { CheckoutStep } from '@/types/checkout.types';

type CheckoutState = {
  step: CheckoutStep;
  addressId: string | null;
  slotId: string | null;
  paymentMethod: string | null;
  setStep: (step: CheckoutStep) => void;
  setAddress: (id: string) => void;
  setSlot: (id: string) => void;
  setPayment: (method: string) => void;
  reset: () => void;
};

export const useCheckoutStore = create<CheckoutState>((set) => ({
  step: 'address',
  addressId: null,
  slotId: null,
  paymentMethod: null,
  setStep: (step) => set({ step }),
  setAddress: (addressId) => set({ addressId }),
  setSlot: (slotId) => set({ slotId }),
  setPayment: (paymentMethod) => set({ paymentMethod }),
  reset: () => set({ step: 'address', addressId: null, slotId: null, paymentMethod: null }),
}));
