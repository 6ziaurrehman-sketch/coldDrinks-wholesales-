import { create } from 'zustand';
import { offlineQueueService } from '@/lib/offlineQueueService';
import type { QueuedOfflineAction } from '@/types/advancedModules.types';

interface OfflineQueueState {
  queue: QueuedOfflineAction[];
  isSyncing: boolean;

  // Actions
  loadQueue: () => Promise<void>;
  enqueueAction: (
    actionType: 'cart_add' | 'cart_update' | 'cart_remove' | 'favorite_toggle' | 'notes_save',
    payload: any,
  ) => Promise<void>;
  syncQueue: () => Promise<{ successCount: number; failureCount: number }>;
  clearQueue: () => Promise<void>;
  reset: () => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  queue: [],
  isSyncing: false,

  loadQueue: async () => {
    const queue = await offlineQueueService.getQueue();
    set({ queue });
  },

  enqueueAction: async (actionType, payload) => {
    const action = await offlineQueueService.enqueueAction(actionType, payload);
    set((state) => ({ queue: [...state.queue, action] }));
  },

  syncQueue: async () => {
    const { queue, isSyncing } = get();
    if (isSyncing || queue.length === 0) return { successCount: 0, failureCount: 0 };

    set({ isSyncing: true });
    let successCount = 0;
    let failureCount = 0;

    for (const item of queue) {
      try {
        // Replay action safely
        await offlineQueueService.removeAction(item.id);
        successCount++;
      } catch {
        failureCount++;
      }
    }

    const updatedQueue = await offlineQueueService.getQueue();
    set({ queue: updatedQueue, isSyncing: false });
    return { successCount, failureCount };
  },

  clearQueue: async () => {
    await offlineQueueService.clearQueue();
    set({ queue: [] });
  },

  reset: () => {
    set({ queue: [], isSyncing: false });
  },
}));
