import { appStorage } from '@/lib/storage';
import type { QueuedOfflineAction } from '@/types/advancedModules.types';

const QUEUE_STORAGE_KEY = '@cold_drinks_offline_action_queue';
const SAFE_ACTIONS = new Set(['cart_add', 'cart_update', 'cart_remove', 'favorite_toggle', 'notes_save']);

export const offlineQueueService = {
  /**
   * Enqueue a safe offline action.
   * Rejects critical actions (orders, payments, cancellations, returns) which must not be queued silently.
   */
  async enqueueAction(
    actionType: 'cart_add' | 'cart_update' | 'cart_remove' | 'favorite_toggle' | 'notes_save',
    payload: any,
  ): Promise<QueuedOfflineAction> {
    if (!SAFE_ACTIONS.has(actionType)) {
      throw new Error('ACTION_REQUIRES_ONLINE: Critical actions cannot be queued offline.');
    }

    const action: QueuedOfflineAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      actionType,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    const current = await offlineQueueService.getQueue();
    const updated = [...current, action];
    await appStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));

    return action;
  },

  /**
   * Retrieve all queued actions
   */
  async getQueue(): Promise<QueuedOfflineAction[]> {
    try {
      const stored = await appStorage.getItem(QUEUE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Remove action from queue by ID
   */
  async removeAction(actionId: string): Promise<void> {
    const current = await offlineQueueService.getQueue();
    const filtered = current.filter((a) => a.id !== actionId);
    await appStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(filtered));
  },

  /**
   * Clear all queued actions (e.g. on logout)
   */
  async clearQueue(): Promise<void> {
    await appStorage.removeItem(QUEUE_STORAGE_KEY);
  },
};
