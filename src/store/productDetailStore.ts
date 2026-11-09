import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { ProductDetail, QtyValidation } from '@/types/productDetail.types';
import { fetchProductDetail, toggleFavorite, toggleNotifyMe } from '@/lib/productService';
import { validateQty } from '@/lib/qtyValidator';
import { useAuthStore } from '@/store/authStore';

type ProductDetailState = AsyncSlice & {
  product: ProductDetail | null;
  qty: number;
  validation: QtyValidation;
  load: (variantId: string) => Promise<void>;
  setQty: (qty: number) => void;
  toggleFavorite: () => Promise<void>;
  toggleNotifyMe: () => Promise<void>;
  reset: () => void;
};

export const useProductDetailStore = create<ProductDetailState>((set, get) => ({
  ...createAsyncSlice<ProductDetailState>(set, get),
  product: null,
  qty: 1,
  validation: { valid: true, message: null, adjustedQty: null },
  
  load: async (variantId: string) => {
    await get().run(async () => {
      const shopId = useAuthStore.getState().activeShopId;
      if (!shopId) return;
      const product = await fetchProductDetail(variantId, shopId);
      if (product) {
        set({ product, qty: product.minQty });
      }
    });
  },
  
  setQty: (qty: number) => {
    const { product } = get();
    if (!product) return;
    const validation = validateQty(qty, product.minQty, product.maxQty, product.qtyMultiple, product.bulkTiers);
    set({ qty: validation.adjustedQty || qty, validation });
  },
  
  toggleFavorite: async () => {
    const { product } = get();
    if (!product) return;
    const newStatus = !product.isFavorite;
    set({ product: { ...product, isFavorite: newStatus } });
    try {
      await toggleFavorite(product.variantId, newStatus);
    } catch (e) {
      set({ product: { ...product, isFavorite: !newStatus } });
      throw e;
    }
  },
  
  toggleNotifyMe: async () => {
    const { product } = get();
    if (!product) return;
    await toggleNotifyMe(product.variantId, true);
  },
  
  reset: () => set({ product: null, qty: 1, validation: { valid: true, message: null, adjustedQty: null } }),
}));
