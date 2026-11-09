import { supabase } from '@/lib/supabase';
import { CartItem, CartTotals, CartIssue, CartChange } from '@/types/cart.types';
import { mapSupabaseError } from '@/lib/errors';

export interface ValidatedCartResponse {
  items: CartItem[];
  totals: CartTotals;
  issues: CartIssue[];
  changes: CartChange[];
}

export const upsertItem = async (cartId: string, variantId: string, qty: number): Promise<void> => {
  try {
    const { error } = await (supabase as any).from('cart_items').upsert(
      { cart_id: cartId, variant_id: variantId, qty },
      { onConflict: 'cart_id,variant_id' }
    );
    if (error) throw error;
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'upsertItem', isWrite: true });
  }
};

export const removeItem = async (cartId: string, variantId: string): Promise<void> => {
  try {
    const { error } = await (supabase as any).from('cart_items').delete().eq('cart_id', cartId).eq('variant_id', variantId);
    if (error) throw error;
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'removeItem', isWrite: true });
  }
};

export const clearCart = async (cartId: string): Promise<void> => {
  try {
    const { error } = await (supabase as any).from('cart_items').delete().eq('cart_id', cartId);
    if (error) throw error;
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'clearCart', isWrite: true });
  }
};

export const getValidatedCart = async (cartId: string): Promise<ValidatedCartResponse> => {
  try {
    const { data, error } = await (supabase.rpc as any)('validate_cart', { p_cart_id: cartId });
    if (error) throw error;
    const res = (data || {}) as any;
    return {
      items: (res.items || []) as CartItem[],
      totals: (res.totals || { subtotal: 0, discounts: 0, tax: 0, deliveryFee: 0, deposits: 0, total: 0 }) as CartTotals,
      issues: (res.issues || []) as CartIssue[],
      changes: (res.changes || []) as CartChange[],
    };
  } catch (err) {
    throw mapSupabaseError(err, { actionName: 'getValidatedCart' });
  }
};
