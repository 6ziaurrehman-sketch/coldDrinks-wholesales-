import { useAddressStore } from '@/store/addressStore';
import { useCartStore } from '@/store/cartStore';
import { useShopStore } from '@/store/shopStore';
import { useUiStore } from '@/store/uiStore';

type StoreResetFn = () => void;
const storeResets = new Set<StoreResetFn>();

export function registerStoreReset(resetFn: StoreResetFn) {
  storeResets.add(resetFn);
  return () => {
    storeResets.delete(resetFn);
  };
}

/**
 * Resets all application Zustand stores, unregisters push tokens,
 * and clears session states on sign out.
 */
export async function resetAllStores() {
  // Reset cart
  useCartStore.getState().reset();

  // Reset UI store toasts
  useUiStore.setState({ toasts: [] });

  // Reset shop store
  useShopStore.getState().reset();

  // Reset address store
  useAddressStore.getState().reset();

  // Reset home store
  import('@/store/homeStore').then((m) => m.useHomeStore.getState().reset());

  // Reset catalog store
  import('@/store/catalogStore').then((m) => m.useCatalogStore.getState().reset());

  // Reset orders store
  import('@/store/ordersStore').then((m) => m.useOrdersStore.getState().reset());

  // Reset order history store
  import('@/store/orderHistoryStore').then((m) => m.useOrderHistoryStore.getState().reset());

  // Reset reorder, favorites, notes, cancellation, and notification stores
  import('@/store/reorderStore').then((m) => m.useReorderStore.getState().reset());
  import('@/store/favoritesStore').then((m) => m.useFavoritesStore.getState().reset());
  import('@/store/notesStore').then((m) => m.useNotesStore.getState().reset());
  import('@/store/cancellationStore').then((m) => m.useCancellationStore.getState().reset());
  import('@/store/notificationStore').then((m) => m.useNotificationStore.getState().reset());
  import('@/store/wholesalerStore').then((m) => m.useWholesalerStore.getState().reset());

  // Reset support and settings stores
  import('@/store/supportStore').then((m) => m.useSupportStore.getState().reset());
  import('@/store/settingsStore').then((m) => m.useSettingsStore.getState().reset());

  // Reset credit and payment stores
  import('@/store/creditStore').then((m) => m.useCreditStore.getState().reset());
  import('@/store/paymentStore').then((m) => m.usePaymentStore.getState().reset());

  // Reset invoice and statement stores
  import('@/store/invoiceStore').then((m) => m.useInvoiceStore.getState().reset());
  import('@/store/statementStore').then((m) => m.useStatementStore.getState().reset());

  // Reset discount and returns stores
  import('@/store/discountStore').then((m) => m.useDiscountStore.getState().reset());
  import('@/store/returnsStore').then((m) => m.useReturnsStore.getState().reset());

  // Reset chat store
  import('@/store/chatStore').then((m) => m.useChatStore.getState().reset());

  // Reset promotions, bulk order, templates, scheduled orders, loyalty, feedback, and offline queue stores
  import('@/store/promotionsStore').then((m) => m.usePromotionsStore.getState().reset());
  import('@/store/bulkOrderStore').then((m) => m.useBulkOrderStore.getState().reset());
  import('@/store/templatesStore').then((m) => m.useTemplatesStore.getState().reset());
  import('@/store/scheduledOrdersStore').then((m) => m.useScheduledOrdersStore.getState().reset());
  import('@/store/loyaltyStore').then((m) => m.useLoyaltyStore.getState().reset());
  import('@/store/feedbackStore').then((m) => m.useFeedbackStore.getState().reset());
  import('@/store/offlineQueueStore').then((m) => m.useOfflineQueueStore.getState().reset());

  // Reset any other registered stores
  storeResets.forEach((reset) => {
    try {
      reset();
    } catch (err) {
      console.warn('[resetAllStores] Error executing store reset:', err);
    }
  });
}
