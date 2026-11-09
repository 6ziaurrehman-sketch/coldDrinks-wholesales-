import { supabase } from '@/lib/supabase';
import { CheckoutQuote, DeliverySlot } from '@/types/checkout.types';
import { mapSupabaseError } from '@/lib/errors';

export const getAvailableSlots = async (): Promise<DeliverySlot[]> => {
  try {
    const { data, error } = await (supabase.rpc as any)('get_delivery_slots');
    if (error) throw error;
    return (data || []) as unknown as DeliverySlot[];
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'getAvailableSlots' });
  }
};

export const getCheckoutQuote = async (cartId: string, addressId: string): Promise<CheckoutQuote> => {
  try {
    const { data, error } = await (supabase.rpc as any)('get_checkout_quote', { p_cart_id: cartId, p_address_id: addressId });
    if (error) throw error;
    return (data || {}) as unknown as CheckoutQuote;
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'getCheckoutQuote' });
  }
};

export const placeOrder = async (cartId: string, payload: any): Promise<string> => {
  try {
    const { data, error } = await (supabase.rpc as any)('place_order', { p_cart_id: cartId, p_payload: payload });
    if (error) throw error;
    return (data as any)?.order_id || 'ORDER-PENDING';
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'placeOrder', isWrite: true });
  }
};
