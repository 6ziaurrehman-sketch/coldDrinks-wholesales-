import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { useRealtimeOrderAndMessageNotifications } from '@/hooks/useRealtimeOrderAndMessageNotifications';

export default function AppLayout() {
  useRealtimeOrderAndMessageNotifications();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="orders/[id]" options={{ title: t('orders.title') }} />
      <Stack.Screen name="orders/history/[id]" options={{ title: t('orderHistory.title') }} />
      <Stack.Screen name="orders/reorder/[id]" options={{ title: t('reorder.title') }} />
      <Stack.Screen name="favorites" options={{ title: t('favorites.title') }} />
      <Stack.Screen name="recent-purchases" options={{ title: t('recentPurchases.title') }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="notification-preferences" options={{ headerShown: false }} />
      <Stack.Screen name="payments/[id]" options={{ title: t('payments.detail', { id: '' }) }} />
      <Stack.Screen name="admin/management" options={{ headerShown: false }} />
      <Stack.Screen name="messages/index" options={{ headerShown: false }} />
      <Stack.Screen name="messages/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="shop/profile" options={{ headerShown: false }} />
      <Stack.Screen name="shop/staff" options={{ headerShown: false }} />
      <Stack.Screen name="shop/approval-threshold" options={{ headerShown: false }} />
      <Stack.Screen name="shop/addresses" options={{ headerShown: false }} />
      <Stack.Screen name="shop/delivery-preferences" options={{ headerShown: false }} />
      <Stack.Screen name="catalog/search" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="catalog/filters" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="support/index" options={{ headerShown: false }} />
      <Stack.Screen name="support/create" options={{ headerShown: false }} />
      <Stack.Screen name="support/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="settings/change-password" options={{ headerShown: false }} />
      <Stack.Screen name="settings/terms-privacy" options={{ headerShown: false }} />
      <Stack.Screen name="settings/delete-account" options={{ headerShown: false }} />
      <Stack.Screen name="settings/edit-profile" options={{ headerShown: false }} />
      <Stack.Screen name="credit/index" options={{ headerShown: false }} />
      <Stack.Screen name="payments/index" options={{ headerShown: false }} />
      <Stack.Screen name="payments/upload-proof" options={{ headerShown: false }} />
      <Stack.Screen name="payments/proof-detail" options={{ headerShown: false }} />
      <Stack.Screen name="invoices/index" options={{ headerShown: false }} />
      <Stack.Screen name="invoices/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="statements/index" options={{ headerShown: false }} />
      <Stack.Screen name="returns/index" options={{ headerShown: false }} />
      <Stack.Screen name="returns/create" options={{ headerShown: false }} />
      <Stack.Screen name="returns/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="returns/empties" options={{ headerShown: false }} />
      <Stack.Screen name="bulk-order" options={{ headerShown: false }} />
      <Stack.Screen name="templates/index" options={{ headerShown: false }} />
      <Stack.Screen name="scheduled/index" options={{ headerShown: false }} />
      <Stack.Screen name="loyalty" options={{ headerShown: false }} />
    </Stack>
  );
}
