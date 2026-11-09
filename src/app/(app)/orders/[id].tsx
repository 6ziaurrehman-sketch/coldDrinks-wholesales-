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
import { CancellationBottomSheet } from '@/components/orders/CancellationBottomSheet';
import { CancellationStatusCard } from '@/components/orders/CancellationStatusCard';
import { useOrdersStore } from '@/store/ordersStore';
import { useCancellationStore } from '@/store/cancellationStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/formatMoney';
import {
  getOrderStatusTone,
  getPaymentStatusTone,
} from '@/utils/orders';
import type { OrderTrackingInfo, OrderTrackedItem } from '@/types/orders.types';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Array.isArray(id) ? id[0] : (id ?? '');

  const theme = useTheme();
  const { activeShopId } = useAuthStore();
  const {
    trackingById,
    status,
    isRealtimeConnected,
    loadTracking,
    rescheduleDelivery,
    submitPaymentProof,
  } = useOrdersStore();

  const cancellationRequest = useCancellationStore((s) => s.requestsByOrder[orderId]);
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);

  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');

  const [paymentProofModalVisible, setPaymentProofModalVisible] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [isActionLoading, setIsActionLoading] = useState(false);

  const tracking: OrderTrackingInfo | undefined = trackingById[orderId];

  const fetchDetails = useCallback(() => {
    if (orderId) {
      void loadTracking(orderId);
    }
  }, [orderId, loadTracking]);

  useEffect(() => {
    fetchDetails();
    if (activeShopId && orderId) {
      void useCancellationStore.getState().loadRequests(activeShopId, orderId);
    }
  }, [fetchDetails, activeShopId, orderId]);

  const handleCallSeller = () => {
    const phone = tracking?.contactPhone || '+923001234567';
    void Linking.openURL(`tel:${phone}`);
  };

  const handleHelpWithOrder = () => {
    const phone = tracking?.contactPhone || '+923001234567';
    const msg = `Hi, I need assistance with Order #${tracking?.orderNumber || orderId}`;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    void Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`);
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleDate) return;
    setIsActionLoading(true);
    try {
      await rescheduleDelivery({
        orderId,
        newDate: rescheduleDate,
        notes: rescheduleNotes,
      });
      setRescheduleModalVisible(false);
      setRescheduleDate('');
      setRescheduleNotes('');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handlePaymentProofSubmit = async () => {
    if (!paymentReference.trim()) return;
    setIsActionLoading(true);
    try {
      await submitPaymentProof({
        orderId,
        reference: paymentReference.trim(),
        notes: paymentNotes.trim() || undefined,
      });
      setPaymentProofModalVisible(false);
      setPaymentReference('');
      setPaymentNotes('');
    } finally {
      setIsActionLoading(false);
    }
  };

  const isDeliveryFailed = tracking?.deliveryStatus === 'failed';
  const isCancelledOrRejected =
    tracking?.orderStatus === 'cancelled' || tracking?.orderStatus === 'rejected';
  const hasShortfall =
    tracking?.items.some((item) => item.shortfallQty > 0) ||
    tracking?.orderStatus === 'partially_delivered';
  const isTerminalStatus = ['delivered', 'partially_delivered', 'cancelled', 'rejected'].includes(
    tracking?.orderStatus ?? '',
  );
  const hasPendingCancellation = cancellationRequest?.status === 'pending';
  const canCancelOrder = (!isTerminalStatus || isDeliveryFailed) && !hasPendingCancellation;
  const canAddProof =
    ['unpaid', 'partially_paid'].includes(tracking?.paymentStatus ?? '');

  return (
    <Screen
      title={
        tracking
          ? t('orders.detail', { id: String(tracking.orderNumber) })
          : 'Order Tracking'
      }
      onBack={router.back}
      rightAction={
        <Button
          label={t('orders.callSeller')}
          variant="ghost"
          onPress={handleCallSeller}
        />
      }
    >
      {/* Realtime Live Dot / Connection Indicator */}
      <View
        style={[
          styles.realtimeBanner,
          {
            backgroundColor: isRealtimeConnected
              ? theme.colors.surface
              : theme.colors.surfaceMuted,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.realtimeLeft}>
          <View
            style={[
              styles.liveDot,
              {
                backgroundColor: isRealtimeConnected
                  ? theme.colors.success
                  : theme.colors.warning,
              },
            ]}
          />
          <AppText
            variant="caption"
            color={isRealtimeConnected ? theme.colors.text : theme.colors.warning}
          >
            {isRealtimeConnected ? t('orders.liveConnected') : t('orders.livePaused')}
          </AppText>
        </View>
      </View>

      <ScreenState
        status={status === 'loading' && !tracking ? 'loading' : 'data'}
        onRetry={fetchDetails}
        data={
          tracking ? (
            <View style={styles.wrapper}>
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                  <RefreshControl
                    refreshing={status === 'loading'}
                    onRefresh={fetchDetails}
                    colors={[theme.colors.primary]}
                  />
                }
              >
                {/* 1. TOP HERO: ETA AT TOP */}
                <Card style={[styles.sectionCard, styles.etaHeroCard]}>
                  <View style={styles.etaHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {t('orders.etaHeader')}
                      </AppText>
                      {tracking.deliveryEta ? (
                        <AppText variant="title" color={theme.colors.primary} style={styles.etaTimeText}>
                          🕒 {formatDate(tracking.deliveryEta, { style: 'time' })}
                        </AppText>
                      ) : (
                        <AppText variant="title" color={theme.colors.textMuted} style={styles.etaTimeText}>
                          {t('orders.noEta')}
                        </AppText>
                      )}
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {tracking.deliveryEta
                          ? formatDate(tracking.deliveryEta, { style: 'date' }) + ' (Asia/Karachi)'
                          : t('orders.noEtaDesc')}
                      </AppText>
                    </View>

                    <View style={styles.badgeCol}>
                      <Badge
                        label={t(`orders.status.${tracking.orderStatus}`) || tracking.orderStatus}
                        tone={getOrderStatusTone(tracking.orderStatus)}
                      />
                      <View style={{ height: 4 }} />
                      <Badge
                        label={t(`orders.payment.${tracking.paymentStatus}`) || tracking.paymentStatus}
                        tone={getPaymentStatusTone(tracking.paymentStatus)}
                      />
                    </View>
                  </View>

                  {/* 2. DELIVERY STATUS AS A SEPARATE LINE */}
                  <View
                    style={[
                      styles.deliveryLineBox,
                      { backgroundColor: theme.colors.surfaceMuted },
                    ]}
                  >
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('orders.deliveryStatusLine')}
                    </AppText>
                    <AppText
                      variant="subtitle"
                      color={theme.colors.text}
                      style={{ marginTop: 2, fontWeight: '600' }}
                    >
                      🚚 {tracking.deliveryStatusLine}
                    </AppText>
                  </View>
                </Card>

                {/* 3. FAILED DELIVERY CARD (REASON + RESCHEDULE & CANCEL BUTTONS) */}
                {isDeliveryFailed && (
                  <Card style={[styles.sectionCard, styles.failedCard, { borderColor: theme.colors.error }]}>
                    <View style={styles.failedHeaderRow}>
                      <Badge label="Delivery Failed" tone="error" />
                      <AppText variant="caption" color={theme.colors.error} style={{ fontWeight: '600' }}>
                        Action Required
                      </AppText>
                    </View>

                    <AppText variant="subtitle" color={theme.colors.error} style={{ marginTop: 8 }}>
                      {t('orders.failedDeliveryTitle')}
                    </AppText>

                    {tracking.failureReason && (
                      <View style={[styles.reasonBox, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <AppText variant="body" color={theme.colors.text}>
                          Reason: {tracking.failureReason}
                        </AppText>
                      </View>
                    )}

                    <View style={styles.failedActionsRow}>
                      <View style={{ flex: 1, marginEnd: 8 }}>
                        <Button
                          label={t('orders.rescheduleAction')}
                          variant="primary"
                          onPress={() => setRescheduleModalVisible(true)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          label={t('orders.cancelAction')}
                          variant="destructive"
                          onPress={() => setCancelSheetVisible(true)}
                        />
                      </View>
                    </View>
                  </Card>
                )}

                {/* 4. CANCELLED / REJECTED TERMINAL CARD */}
                {isCancelledOrRejected && (
                  <Card style={[styles.sectionCard, { borderColor: theme.colors.error, borderWidth: 1 }]}>
                    <View style={styles.terminalHeaderRow}>
                      <Badge
                        label={tracking.orderStatus === 'rejected' ? 'Rejected' : 'Cancelled'}
                        tone="error"
                      />
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {formatDate(tracking.updatedAt, { style: 'datetime' })}
                      </AppText>
                    </View>
                    <AppText variant="title" color={theme.colors.error} style={{ marginTop: 6 }}>
                      {tracking.orderStatus === 'rejected'
                        ? t('orders.terminalRejectedTitle')
                        : t('orders.terminalCancelledTitle')}
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 4 }}>
                      {t('orders.terminalNotice')}
                    </AppText>
                  </Card>
                )}

                {/* 5. VERTICAL TIMELINE CARD */}
                <Card style={styles.sectionCard}>
                  <AppText variant="title" style={{ marginBottom: 12 }}>
                    {t('orders.timelineTitle')}
                  </AppText>
                  <OrderTimeline
                    timeline={tracking.timeline}
                    currentOrderStatus={tracking.orderStatus}
                    cancellationReason={tracking.failureReason}
                  />
                </Card>

                {/* 6. PARTIAL DELIVERY TABLE & ITEMS LIST */}
                <Card style={styles.sectionCard}>
                  <View style={styles.itemsHeaderRow}>
                    <View>
                      <AppText variant="title">{t('orders.itemsTitle')}</AppText>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {t('orders.orderedVsDelivered')}
                      </AppText>
                    </View>
                    {hasShortfall && (
                      <Badge label="Shortfall Detected" tone="warning" />
                    )}
                  </View>

                  {/* Partial Delivery Notice Banner */}
                  {hasShortfall && (
                    <View style={[styles.shortfallBanner, { backgroundColor: theme.colors.surfaceMuted }]}>
                      <AppText variant="caption" color={theme.colors.warning} style={{ fontWeight: '600' }}>
                        ⚠️ {t('orders.partialDeliveryNotice')}
                      </AppText>
                    </View>
                  )}

                  {/* Items comparison table */}
                  {tracking.items.map((item: OrderTrackedItem) => (
                    <View
                      key={item.id}
                      style={[styles.itemRow, { borderBottomColor: theme.colors.border }]}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText variant="subtitle">{item.productName}</AppText>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          {item.saleUnit} • {formatMoney(item.unitPrice)}
                        </AppText>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="caption">
                          {t('orders.ordered', { qty: item.orderedQty })}
                        </AppText>
                        <AppText
                          variant="caption"
                          color={
                            item.deliveredQty > 0
                              ? theme.colors.success
                              : theme.colors.textMuted
                          }
                          style={{ fontWeight: '600' }}
                        >
                          {t('orders.delivered', { qty: item.deliveredQty })}
                        </AppText>
                        {item.shortfallQty > 0 && (
                          <Badge
                            label={t('orders.shortfall', { qty: item.shortfallQty })}
                            tone="warning"
                          />
                        )}
                      </View>
                    </View>
                  ))}

                  <View style={styles.grandTotalRow}>
                    <AppText variant="subtitle">Grand Total</AppText>
                    <AppText variant="title" color={theme.colors.primary}>
                      {formatMoney(tracking.grandTotal)}
                    </AppText>
                  </View>
                </Card>

                {/* 6.5. ORDER NOTES SECTION (C14) */}
                <OrderNotesSection
                  orderId={orderId}
                  orderStatus={tracking.orderStatus}
                  sellerPhone={tracking.contactPhone}
                  orderNumber={tracking.orderNumber}
                />

                {/* 7. QUICK ACTIONS */}
                <Card style={styles.sectionCard}>
                  <AppText variant="title" style={{ marginBottom: 12 }}>
                    Quick Actions
                  </AppText>
                  <View style={styles.quickActionsCol}>
                    <Button
                      label={`💬 ${t('orders.helpWithOrder')}`}
                      variant="secondary"
                      onPress={handleHelpWithOrder}
                    />

                    {/* Cancellation Status Card if request exists or order cancelled */}
                    {(cancellationRequest || tracking.orderStatus === 'cancelled') && (
                      <CancellationStatusCard
                        request={cancellationRequest}
                        orderStatus={tracking.orderStatus}
                        onRetryRequest={() => setCancelSheetVisible(true)}
                      />
                    )}

                    {canAddProof && (
                      <Button
                        label={`💳 ${t('orders.addPaymentProof')}`}
                        variant="primary"
                        onPress={() => setPaymentProofModalVisible(true)}
                      />
                    )}

                    {canCancelOrder && (
                      <Button
                        label={
                          ['placed', 'confirmed'].includes(tracking?.orderStatus ?? '')
                            ? t('cancellation.title')
                            : t('cancellation.requestTitle')
                        }
                        variant="destructive"
                        onPress={() => setCancelSheetVisible(true)}
                      />
                    )}
                  </View>
                </Card>

                {/* Padding for sticky footer */}
                <View style={{ height: 60 }} />
              </ScrollView>

              {/* 8. ALWAYS REACHABLE CALL SELLER BOTTOM BAR */}
              <View
                style={[
                  styles.stickyBottomBar,
                  {
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.border,
                  },
                ]}
              >
                <Button
                  label={`📞 ${t('orders.callSeller')} (${tracking.contactPhone || '+92 300 1234567'})`}
                  variant="primary"
                  onPress={handleCallSeller}
                />
              </View>
            </View>
          ) : (
            <OrderTimelineSkeleton />
          )
        }
      />

      {/* Reschedule Modal */}
      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRescheduleModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title" style={{ marginBottom: 12 }}>
              {t('orders.rescheduleModalTitle')}
            </AppText>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: theme.colors.border, color: theme.colors.text },
              ]}
              placeholder={t('orders.newDatePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={rescheduleDate}
              onChangeText={setRescheduleDate}
            />
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 },
              ]}
              placeholder="Delivery instructions / notes"
              placeholderTextColor={theme.colors.textMuted}
              value={rescheduleNotes}
              onChangeText={setRescheduleNotes}
            />
            <View style={styles.modalButtonsRow}>
              <View style={{ flex: 1, marginEnd: 8 }}>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  onPress={() => setRescheduleModalVisible(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('orders.rescheduleConfirm')}
                  loading={isActionLoading}
                  onPress={handleRescheduleSubmit}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Proof Modal */}
      <Modal
        visible={paymentProofModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentProofModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title" style={{ marginBottom: 12 }}>
              {t('orders.submitProofTitle')}
            </AppText>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: theme.colors.border, color: theme.colors.text },
              ]}
              placeholder={t('orders.referencePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={paymentReference}
              onChangeText={setPaymentReference}
            />
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: theme.colors.border, color: theme.colors.text, marginTop: 8 },
              ]}
              placeholder={t('orders.notesPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={paymentNotes}
              onChangeText={setPaymentNotes}
            />
            <View style={styles.modalButtonsRow}>
              <View style={{ flex: 1, marginEnd: 8 }}>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  onPress={() => setPaymentProofModalVisible(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('orders.submitProofConfirm')}
                  loading={isActionLoading}
                  onPress={handlePaymentProofSubmit}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancellation Bottom Sheet */}
      <CancellationBottomSheet
        visible={cancelSheetVisible}
        orderId={orderId}
        orderNumber={tracking?.orderNumber}
        onClose={() => setCancelSheetVisible(false)}
        onCancelled={() => {
          void loadTracking(orderId);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  realtimeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  realtimeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  sectionCard: {
    padding: 16,
  },
  etaHeroCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  etaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  etaTimeText: {
    marginVertical: 4,
  },
  badgeCol: {
    alignItems: 'flex-end',
  },
  deliveryLineBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  failedCard: {
    borderWidth: 1.5,
  },
  failedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reasonBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
  },
  failedActionsRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  terminalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  shortfallBanner: {
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 8,
  },
  quickActionsCol: {
    gap: 10,
  },
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
