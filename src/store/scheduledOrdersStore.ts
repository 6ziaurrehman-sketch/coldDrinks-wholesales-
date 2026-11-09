import { create } from 'zustand';
import { scheduledOrdersService } from '@/lib/scheduledOrdersService';
import type { ScheduledOrder } from '@/types/advancedModules.types';

interface ScheduledOrdersState {
  scheduledOrders: ScheduledOrder[];
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;

  // Actions
  loadScheduledOrders: (shopId: string) => Promise<void>;
  createSchedule: (payload: {
    shopId: string;
    addressId?: string | null;
    paymentMethod: 'cash' | 'credit' | 'bank_transfer';
    ruleType: 'weekly' | 'monthly' | 'specific_date';
    ruleDay?: number | null;
    deliveryTimeSlot?: string;
    templateId?: string | null;
    items?: { variantId: string; quantity: number }[];
  }) => Promise<string>;
  toggleStatus: (scheduleId: string, newStatus: 'active' | 'paused' | 'cancelled') => Promise<void>;
  reset: () => void;
}

export const useScheduledOrdersStore = create<ScheduledOrdersState>((set, get) => ({
  scheduledOrders: [],
  status: 'idle',
  error: null,

  loadScheduledOrders: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const list = await scheduledOrdersService.fetchScheduledOrders(shopId);
      set({ scheduledOrders: list, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load scheduled orders.' });
    }
  },

  createSchedule: async (payload) => {
    const id = await scheduledOrdersService.createScheduledOrder(payload);
    await get().loadScheduledOrders(payload.shopId);
    return id;
  },

  toggleStatus: async (scheduleId, newStatus) => {
    await scheduledOrdersService.toggleStatus(scheduleId, newStatus);
    set((state) => ({
      scheduledOrders: state.scheduledOrders.map((s) =>
        s.id === scheduleId ? { ...s, status: newStatus } : s,
      ),
    }));
  },

  reset: () => {
    set({
      scheduledOrders: [],
      status: 'idle',
      error: null,
    });
  },
}));
