import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { wholesalerService } from '@/lib/wholesalerService';
import {
  InventoryItem,
  WholesalerCustomer,
  WholesalerSupplier,
  WholesalerSalePayload,
  WholesalerSaleReceipt,
  WholesalerSaleSummary,
  WholesalerDashboardMetrics,
  WholesalerProductInput,
} from '@/types/wholesaler.types';
import { prefetchProductImages } from '@/components/ui/CachedImage';

export interface WholesalerState extends AsyncSlice {
  inventory: InventoryItem[];
  metrics: WholesalerDashboardMetrics | null;
  customers: WholesalerCustomer[];
  suppliers: WholesalerSupplier[];
  salesHistory: WholesalerSaleSummary[];
  activeSaleReceipt: WholesalerSaleReceipt | null;
  inventorySearch: string;
  metricsRange: string;

  // Actions
  loadDashboard: (range?: string, force?: boolean) => Promise<void>;
  setMetricsRange: (range: string) => void;
  loadInventory: (search?: string, force?: boolean) => Promise<void>;
  setInventorySearch: (q: string) => void;
  recordStockAdjustment: (params: {
    variantId: string;
    type: 'opening_stock' | 'damage' | 'expiry' | 'breakage' | 'count_correction' | 'return';
    unitsDelta: number;
    reason: string;
    notes?: string;
  }) => Promise<void>;
  addProduct: (input: WholesalerProductInput) => Promise<{ product_id: string; variant_id: string }>;
  updateProductPrice: (params: { variantId: string; pricePerCarton: number; costPrice?: number; unitSalePrice?: number }) => Promise<void>;
  updateProductDetails: (params: {
    productId: string;
    variantId: string;
    name?: string;
    sizeLabel?: string;
    packagingType?: string;
    piecesPerCarton?: number;
    pricePerCarton?: number;
    costPrice?: number;
    unitSalePrice?: number;
    lowStockThreshold?: number;
    isActive?: boolean;
    status?: 'active' | 'out_of_stock' | 'disabled';
    imageUrl?: string;
  }) => Promise<void>;
  loadCustomers: (force?: boolean) => Promise<void>;
  addCustomer: (customer: { name: string; owner_name?: string; phone?: string; address?: string; area?: string; opening_balance?: number; notes?: string }) => Promise<WholesalerCustomer>;
  loadSuppliers: (force?: boolean) => Promise<void>;
  addSupplier: (supplier: { name: string; contact_person?: string; phone?: string; address?: string; notes?: string }) => Promise<WholesalerSupplier>;
  finalizePurchase: (params: {
    supplierId: string;
    invoiceNo: string;
    purchaseDate?: string;
    transportCost?: number;
    paidAmount?: number;
    paymentMethod?: string;
    notes?: string;
    items: { variant_id: string; cartons_qty: number; loose_units_qty: number; cost_per_carton: number }[];
  }) => Promise<void>;
  finalizeSale: (payload: WholesalerSalePayload) => Promise<WholesalerSaleReceipt>;
  loadSalesHistory: (search?: string, force?: boolean) => Promise<void>;
  recordCustomerPayment: (params: { customerId: string; amount: number; paymentMethod: string; referenceNo?: string; notes?: string }) => Promise<void>;
  recordCustomerReturn: (params: { customerId?: string; variantId: string; cartonsQty?: number; looseUnitsQty?: number; creditAmount?: number; reason: string; notes?: string }) => Promise<void>;
  clearReceipt: () => void;
  reset: () => void;
}

let lastInventoryFetch = 0;
let lastDashboardFetch = 0;
let lastCustomersFetch = 0;
let lastSuppliersFetch = 0;
let lastSalesHistoryFetch = 0;
const CACHE_TTL_MS = 30000; // 30 seconds fresh cache window for instant screen transitions

export const useWholesalerStore = create<WholesalerState>((set, get) => ({
  ...createAsyncSlice<WholesalerState>(set, get),
  inventory: [],
  metrics: null,
  customers: [],
  suppliers: [],
  salesHistory: [],
  activeSaleReceipt: null,
  inventorySearch: '',
  metricsRange: '1_day',

  setInventorySearch: (q: string) => set({ inventorySearch: q }),
  setMetricsRange: (range: string) => set({ metricsRange: range }),

  loadDashboard: async (range?: string, force = false) => {
    const r = range !== undefined ? range : get().metricsRange;
    const now = Date.now();
    if (!force && get().metrics && r === get().metricsRange && (now - lastDashboardFetch) < CACHE_TTL_MS) {
      return;
    }
    await get().run(async () => {
      const metrics = await wholesalerService.getDashboardMetrics(r);
      lastDashboardFetch = Date.now();
      set({ metrics, metricsRange: r });
    });
  },

  loadInventory: async (search?: string, force = false) => {
    const q = search !== undefined ? search : get().inventorySearch;
    const now = Date.now();
    if (!force && !q && get().inventory.length > 0 && (now - lastInventoryFetch) < CACHE_TTL_MS) {
      return;
    }
    await get().run(async () => {
      const inventory = await wholesalerService.getInventory(q);
      lastInventoryFetch = Date.now();
      set({ inventory });
      // Proactively prefetch and cache images directly to device disk storage
      if (inventory.length > 0) {
        void prefetchProductImages(inventory.map((item) => item.image_url));
      }
    });
  },

  recordStockAdjustment: async (params) => {
    await get().run(
      async () => {
        await wholesalerService.recordStockAdjustment(params);
        lastInventoryFetch = 0;
        lastDashboardFetch = 0;
        await get().loadInventory(undefined, true);
        await get().loadDashboard(undefined, true);
      },
      { rethrow: true }
    );
  },

  addProduct: async (input) => {
    const res = await get().run(
      async () => {
        const r = await wholesalerService.addProduct(input);
        lastInventoryFetch = 0;
        lastDashboardFetch = 0;
        await get().loadInventory(undefined, true);
        await get().loadDashboard(undefined, true);
        return r;
      },
      { rethrow: true }
    );
    return res!;
  },

  updateProductPrice: async (params) => {
    await get().run(
      async () => {
        await wholesalerService.updateProductPrice(params);
        lastInventoryFetch = 0;
        await get().loadInventory(undefined, true);
      },
      { rethrow: true }
    );
  },

  updateProductDetails: async (params) => {
    await get().run(
      async () => {
        await wholesalerService.updateProductDetails(params);
        lastInventoryFetch = 0;
        lastDashboardFetch = 0;
        await get().loadInventory(undefined, true);
        await get().loadDashboard(undefined, true);
      },
      { rethrow: true }
    );
  },

  loadCustomers: async (force = false) => {
    const now = Date.now();
    if (!force && get().customers.length > 0 && (now - lastCustomersFetch) < CACHE_TTL_MS) {
      return;
    }
    await get().run(async () => {
      const customers = await wholesalerService.getCustomers();
      lastCustomersFetch = Date.now();
      set({ customers });
    });
  },

  addCustomer: async (customer) => {
    const res = await get().run(
      async () => {
        const newCust = await wholesalerService.addCustomer(customer);
        lastCustomersFetch = 0;
        await get().loadCustomers(true);
        return newCust;
      },
      { rethrow: true }
    );
    return res!;
  },

  loadSuppliers: async (force = false) => {
    const now = Date.now();
    if (!force && get().suppliers.length > 0 && (now - lastSuppliersFetch) < CACHE_TTL_MS) {
      return;
    }
    await get().run(async () => {
      const suppliers = await wholesalerService.getSuppliers();
      lastSuppliersFetch = Date.now();
      set({ suppliers });
    });
  },

  addSupplier: async (supplier) => {
    const res = await get().run(
      async () => {
        const newSup = await wholesalerService.addSupplier(supplier);
        const suppliers = await wholesalerService.getSuppliers();
        set({ suppliers });
        return newSup;
      },
      { rethrow: true }
    );
    return res!;
  },

  finalizePurchase: async (params) => {
    await get().run(
      async () => {
        await wholesalerService.finalizePurchase(params);
        await get().loadInventory();
        await get().loadDashboard();
        await get().loadSuppliers();
      },
      { rethrow: true }
    );
  },

  finalizeSale: async (payload) => {
    const res = await get().run(
      async () => {
        const receipt = await wholesalerService.finalizeSale(payload);
        set({ activeSaleReceipt: receipt });
        lastInventoryFetch = 0;
        lastDashboardFetch = 0;
        lastCustomersFetch = 0;
        lastSalesHistoryFetch = 0;
        await get().loadInventory(undefined, true);
        await get().loadDashboard(undefined, true);
        await get().loadCustomers(true);
        await get().loadSalesHistory(undefined, true);
        return receipt;
      },
      { rethrow: true }
    );
    return res!;
  },

  loadSalesHistory: async (search?: string, force = false) => {
    const now = Date.now();
    if (!force && !search && get().salesHistory.length > 0 && (now - lastSalesHistoryFetch) < CACHE_TTL_MS) {
      return;
    }
    await get().run(async () => {
      const salesHistory = await wholesalerService.getSalesHistory(search);
      lastSalesHistoryFetch = Date.now();
      set({ salesHistory });
    });
  },

  recordCustomerPayment: async (params) => {
    await get().run(
      async () => {
        await wholesalerService.recordCustomerPayment(params);
        lastCustomersFetch = 0;
        lastDashboardFetch = 0;
        await get().loadCustomers(true);
        await get().loadDashboard(undefined, true);
      },
      { rethrow: true }
    );
  },

  recordCustomerReturn: async (params) => {
    await get().run(
      async () => {
        await wholesalerService.recordCustomerReturn(params);
        lastInventoryFetch = 0;
        lastCustomersFetch = 0;
        lastDashboardFetch = 0;
        await get().loadInventory(undefined, true);
        await get().loadCustomers(true);
        await get().loadDashboard(undefined, true);
      },
      { rethrow: true }
    );
  },

  clearReceipt: () => set({ activeSaleReceipt: null }),

  reset: () => {
    set({
      inventory: [],
      metrics: null,
      customers: [],
      suppliers: [],
      salesHistory: [],
      activeSaleReceipt: null,
      inventorySearch: '',
      status: 'idle',
      error: null,
    });
  },
}));
