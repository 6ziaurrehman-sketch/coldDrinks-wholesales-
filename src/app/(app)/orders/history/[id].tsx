import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Card, Button } from '@/components/ui';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { OrderTimelineSkeleton } from '@/components/orders/OrderTimelineSkeleton';
import { OrderNotesSection } from '@/components/orders/OrderNotesSection';
import { CancellationStatusCard } from '@/components/orders/CancellationStatusCard';
import { useOrderHistoryStore } from '@/store/orderHistoryStore';
import { useCancellationStore } from '@/store/cancellationStore';
import { orderHistoryService } from '@/lib/orderHistoryService';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/formatMoney';
import {
  getOrderStatusTone,
  getPaymentStatusTone,
} from '@/utils/orders';
import type { OrderHistoryDetail, OrderHistoryDetailItem } from '@/types/orderHistory.types';

export default function OrderHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Array.isArray(id) ? id[0] : (id ?? '');

  const theme = useTheme();
  const { activeShopId } = useAuthStore();
  const { detailCache, loadDetail } = useOrderHistoryStore();

  const [detail, setDetail] = useState<OrderHistoryDetail | null>(detailCache[orderId] || null);
  const [loading, setLoading] = useState(!detailCache[orderId]);
  const [error, setError] = useState<Error | null>(null);

  // Return Request Modal State
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadDetail(orderId);
      setDetail(data);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [orderId, loadDetail]);

  const cancellationRequest = useCancellationStore((s) => s.requestsByOrder[orderId]);

  useEffect(() => {
    let isMounted = true;
    if (!orderId) return;

    if (activeShopId) {
      void useCancellationStore.getState().loadRequests(activeShopId, orderId);
    }

    void loadDetail(orderId)
      .then((data) => {
        if (isMounted) {
          setDetail(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [orderId, loadDetail, activeShopId]);

  const handleReorderPress = () => {
    if (!orderId) return;
    router.push(`/orders/reorder/${orderId}`);
  };

  const handleReturnSubmit = async () => {
    if (!returnReason.trim() || !activeShopId) return;
    setIsSubmittingReturn(true);
    try {
      await orderHistoryService.requestReturn({
        orderId,
        shopId: activeShopId,
        reason: returnReason.trim(),
      });
      setReturnModalVisible(false);
      setReturnReason('');
      await fetchDetail();
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (detail?.invoiceUrl) {
      void Linking.openURL(detail.invoiceUrl);
    }
  };

  const isDelivered = detail?.orderStatus === 'delivered';
  const hasReturns = detail?.returns && detail.returns.length > 0;

  return (
    <Screen
      title={
        detail
          ? t('orders.detail', { id: String(detail.orderNumber) })
          : t('orderHistory.title')
      }
      onBack={router.back}
    >
      <ScreenState
        status={loading && !detail ? 'loading' : error && !detail ? 'error' : 'data'}
        onRetry={fetchDetail}
        data={
          detail ? (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={fetchDetail}
                  colors={[theme.colors.primary]}
                />
              }
            >


              {/* 1. HEADER SECTION */}
              <Card style={styles.sectionCard}>
                <View style={styles.headerRow}>
                  <View>
                    <AppText variant="title">#{detail.orderNumber}</AppText>
                    <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                      {formatDate(detail.createdAt, { style: 'datetime' })}
                    </AppText>
                  </View>

                  <View style={styles.badgesCol}>
                    <Badge
                      label={t(`orders.status.${detail.orderStatus}`) || detail.orderStatus}
                      tone={getOrderStatusTone(detail.orderStatus)}
                    />
                    <View style={{ height: 4 }} />
                    <Badge
                      label={t(`orders.payment.${detail.paymentStatus}`) || detail.paymentStatus}
                      tone={getPaymentStatusTone(detail.paymentStatus)}
                    />
                  </View>
                </View>

                {/* Delivery summary pill */}
                <View style={[styles.deliveryBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    Delivery Status:{' '}
                    <AppText variant="caption" color={theme.colors.text} style={{ fontWeight: '600' }}>
                      {t(`orders.delivery.${detail.deliveryStatus}`) || detail.deliveryStatus}
                    </AppText>
                  </AppText>
                  {detail.deliveryAddress && (
                    <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                      📍 {detail.deliveryAddress}
                    </AppText>
                  )}
                </View>
              </Card>

              {/* Cancellation status banner if applicable */}
              <CancellationStatusCard
                request={cancellationRequest}
                orderStatus={detail.orderStatus}
                orderNotes={detail.notes}
              />

              {/* 2. ITEMS SECTION (WITH PRODUCT SNAPSHOT & DELETED PRODUCT RESILIENCE) */}
              <Card style={styles.sectionCard}>
                <AppText variant="title" style={{ marginBottom: 12 }}>
                  {t('orderHistory.itemsSection', { count: detail.items.length })}
                </AppText>

                {detail.items.map((item: OrderHistoryDetailItem) => (
                  <View
                    key={item.id}
                    style={[styles.itemRow, { borderBottomColor: theme.colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="subtitle">{item.productName}</AppText>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {item.brand ? `${item.brand} • ` : ''}{item.saleUnit}
                      </AppText>

                      {/* Edge case: Deleted product fallback notification */}
                      {!item.variantId && (
                        <AppText variant="caption" color={theme.colors.warning} style={{ marginTop: 2 }}>
                          ℹ️ {t('orderHistory.itemUnavailable')}
                        </AppText>
                      )}
                    </View>

                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText variant="caption">
                        {t('orderHistory.orderedQty', { qty: item.orderedQty })}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={item.deliveredQty > 0 ? theme.colors.success : theme.colors.textMuted}
                      >
                        {t('orderHistory.deliveredQty', { qty: item.deliveredQty })}
                      </AppText>

                      {/* Role-restricted item line total */}
                      {detail.isFinancialAuthorized && item.lineTotal !== null ? (
                        <AppText variant="subtitle" color={theme.colors.primary} style={{ marginTop: 2 }}>
                          {formatMoney(item.lineTotal)}
                        </AppText>
                      ) : (
                        <Badge label={t('orderHistory.roleRestricted')} tone="neutral" />
                      )}
                    </View>
                  </View>
                ))}
              </Card>

              {/* 3. STATUS HISTORY SECTION */}
              <Card style={styles.sectionCard}>
                <AppText variant="title" style={{ marginBottom: 12 }}>
                  {t('orderHistory.statusSection')}
                </AppText>
                <OrderTimeline
                  timeline={detail.statusHistory}
                  currentOrderStatus={detail.orderStatus}
                />
              </Card>

              {/* 4. PAYMENT SECTION (ROLE RESTRICTED) */}
              <Card style={styles.sectionCard}>
                <AppText variant="title" style={{ marginBottom: 12 }}>
                  {t('orderHistory.paymentSection')}
                </AppText>

                <View style={styles.infoRow}>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    Payment Method
                  </AppText>
                  <AppText variant="subtitle" style={{ textTransform: 'capitalize' }}>
                    {detail.payment.paymentMethod.replace('_', ' ')}
                  </AppText>
                </View>

                <View style={styles.infoRow}>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    Payment Status
                  </AppText>
                  <Badge
                    label={t(`orders.payment.${detail.paymentStatus}`) || detail.paymentStatus}
                    tone={getPaymentStatusTone(detail.paymentStatus)}
                  />
                </View>

                {/* Financial amounts (Owner & Manager only) */}
                {detail.isFinancialAuthorized ? (
                  <View style={[styles.amountsBox, { borderTopColor: theme.colors.border }]}>
                    <View style={styles.amountLine}>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {t('orderHistory.subtotal')}
                      </AppText>
                      <AppText variant="body">{formatMoney(detail.payment.subtotal)}</AppText>
                    </View>
                    <View style={styles.amountLine}>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {t('orderHistory.tax')}
                      </AppText>
                      <AppText variant="body">{formatMoney(detail.payment.taxTotal)}</AppText>
                    </View>
                    <View style={styles.amountLine}>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {t('orderHistory.deliveryFee')}
                      </AppText>
                      <AppText variant="body">{formatMoney(detail.payment.deliveryFee)}</AppText>
                    </View>
                    <View style={[styles.amountLine, styles.grandTotalLine]}>
                      <AppText variant="subtitle">{t('orderHistory.grandTotal')}</AppText>
                      <AppText variant="title" color={theme.colors.primary}>
                        {formatMoney(detail.grandTotal)}
                      </AppText>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.restrictedBanner, { backgroundColor: theme.colors.surfaceMuted }]}>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      🔒 {t('orderHistory.roleRestrictedNotice')}
                    </AppText>
                  </View>
                )}
              </Card>

              {/* 5. INVOICE SECTION */}
              <Card style={styles.sectionCard}>
                <AppText variant="title" style={{ marginBottom: 12 }}>
                  {t('orderHistory.invoiceSection')}
                </AppText>

                {detail.isFinancialAuthorized ? (
                  detail.isInvoiceAvailable && detail.invoiceUrl ? (
                    <Button
                      label={`📄 ${t('orderHistory.invoiceAvailable')}`}
                      variant="primary"
                      onPress={handleDownloadInvoice}
                    />
                  ) : (
                    <View style={[styles.invoicePendingBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        ⏳ {t('orderHistory.invoicePending')}
                      </AppText>
                    </View>
                  )
                ) : (
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    🔒 Invoices are accessible only by shop owners and managers.
                  </AppText>
                )}
              </Card>

              {/* 6. ORDER NOTES & INSTRUCTIONS SECTION (C14) */}
              <OrderNotesSection
                orderId={orderId}
                orderStatus={detail.orderStatus}
                sellerPhone={detail.contactPhone}
                orderNumber={detail.orderNumber}
              />

              {/* 7. RETURNS SECTION */}
              <Card style={styles.sectionCard}>
                <View style={styles.headerRow}>
                  <AppText variant="title">{t('orderHistory.returnsSection')}</AppText>
                  {isDelivered && !hasReturns && (
                    <Button
                      label={t('orderHistory.requestReturn')}
                      variant="ghost"
                      onPress={() => setReturnModalVisible(true)}
                    />
                  )}
                </View>

                {hasReturns ? (
                  detail.returns.map((ret) => (
                    <View key={ret.id} style={[styles.returnRow, { backgroundColor: theme.colors.surfaceMuted }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Badge label={ret.status.toUpperCase()} tone="warning" />
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          {formatDate(ret.createdAt, { style: 'datetime' })}
                        </AppText>
                      </View>
                      <AppText variant="body" style={{ marginTop: 6 }}>
                        {t('orderHistory.returnReason', { reason: ret.reason })}
                      </AppText>
                      {ret.refundAmount !== null && ret.refundAmount > 0 && (
                        <AppText variant="subtitle" color={theme.colors.primary} style={{ marginTop: 4 }}>
                          {t('orderHistory.returnRefund', { amount: formatMoney(ret.refundAmount) })}
                        </AppText>
                      )}
                    </View>
                  ))
                ) : (
                  <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                    No returns requested for this order.
                  </AppText>
                )}
              </Card>

              {/* 8. REORDER BUTTON (PROMINENT AT BOTTOM) */}
              <View style={styles.bottomActionContainer}>
                <Button
                  label={`🔄 ${t('orderHistory.reorder')}`}
                  variant="primary"
                  onPress={handleReorderPress}
                />
              </View>
            </ScrollView>
          ) : (
            <OrderTimelineSkeleton />
          )
        }
      />

      {/* Return Request Modal */}
      <Modal
        visible={returnModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReturnModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title" style={{ marginBottom: 12 }}>
              {t('orderHistory.requestReturn')}
            </AppText>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: theme.colors.border, color: theme.colors.text },
              ]}
              placeholder="Reason for return (damaged bottles, missing items, etc.)"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
              value={returnReason}
              onChangeText={setReturnReason}
            />
            <View style={styles.modalButtonsRow}>
              <View style={{ flex: 1, marginEnd: 8 }}>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  onPress={() => setReturnModalVisible(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Submit Return"
                  loading={isSubmittingReturn}
                  onPress={handleReturnSubmit}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badgesCol: {
    alignItems: 'flex-end',
  },
  deliveryBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
  },
  feedbackBanner: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  amountsBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  amountLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  grandTotalLine: {
    marginTop: 6,
    paddingTop: 6,
  },
  restrictedBanner: {
    marginTop: 10,
    padding: 10,
    borderRadius: 6,
  },
  invoicePendingBox: {
    padding: 12,
    borderRadius: 8,
  },
  returnRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
  },
  bottomActionContainer: {
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    padding: 20,
    borderRadius: 12,
  },
  modalInput: {
    height: 80,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    textAlignVertical: 'top',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
