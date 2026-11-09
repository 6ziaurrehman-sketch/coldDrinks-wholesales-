import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { CartItem, CartTotals, CartIssue, CartChange } from '@/types/cart.types';
import { upsertItem, removeItem, clearCart, getValidatedCart } from '@/lib/cartService';

export type CartState = AsyncSlice & {
  itemCount: number;
  items: CartItem[];
  totals: CartTotals;
  issues: CartIssue[];
  changes: CartChange[];
  load: (cartId: string) => Promise<void>;
  setQty: (cartId: string, variantId: string, qty: number) => Promise<void>;
  removeItem: (cartId: string, variantId: string) => Promise<void>;
  clear: (cartId: string) => Promise<void>;
  reset: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  ...createAsyncSlice<CartState>(set, get),
  itemCount: 0,
  items: [],
  totals: { subtotal: 0, discounts: 0, tax: 0, deliveryFee: 0, deposits: 0, total: 0 },
  issues: [],
  changes: [],

  load: async (cartId: string) => {
    await get().run(async () => {
      const data = await getValidatedCart(cartId);
      const items = data.items || [];
      const count = items.reduce((sum, i) => sum + i.qty, 0);
      set({ 
        items, 
        itemCount: count,
        totals: data.totals || get().totals,
        issues: data.issues || [],
        changes: data.changes || [],
      });
    });
  },

  setQty: async (cartId: string, variantId: string, qty: number) => {
    const prevItems = get().items;
    const existing = prevItems.find(i => i.variantId === variantId);
    let nextItems: CartItem[];
    if (existing) {
      nextItems = prevItems.map(i => i.variantId === variantId ? { ...i, qty } : i);
    } else {
      nextItems = [
        ...prevItems,
        {
          id: variantId,
          variantId,
          productId: variantId,
          name: 'Cart Item',
          brand: '',
          images: [],
          saleUnit: 'case',
          qty,
          shopPrice: 0,
          normalPrice: 0,
          isAvailable: true,
        },
      ];
    }
    const count = nextItems.reduce((sum, i) => sum + i.qty, 0);
    set({ items: nextItems, itemCount: count });

    try {
      await upsertItem(cartId, variantId, qty);
      await get().load(cartId);
    } catch (e) {
      set({ items: prevItems, itemCount: prevItems.reduce((sum, i) => sum + i.qty, 0) });
      throw e;
    }
  },

  removeItem: async (cartId: string, variantId: string) => {
    await removeItem(cartId, variantId);
    await get().load(cartId);
  },

  clear: async (cartId: string) => {
    await clearCart(cartId);
    set({ items: [], itemCount: 0, totals: { subtotal: 0, discounts: 0, tax: 0, deliveryFee: 0, deposits: 0, total: 0 } });
  },

  reset: () => set({ 
    items: [], 
    itemCount: 0, 
    totals: { subtotal: 0, discounts: 0, tax: 0, deliveryFee: 0, deposits: 0, total: 0 }, 
    issues: [], 
    changes: [], 
  }),
}));
