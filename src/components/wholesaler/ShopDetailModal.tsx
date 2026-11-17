import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/useTheme';
import { WholesalerCustomer, ShopInsightsData } from '@/types/wholesaler.types';
import { wholesalerService } from '@/lib/wholesalerService';
import { formatMoney } from '@/utils/formatMoney';
import { formatDate } from '@/utils/formatDate';

interface ShopDetailModalProps {
  visible: boolean;
  customer: WholesalerCustomer | null;
  onClose: () => void;
  onReceivePayment: (customer: WholesalerCustomer) => void;
  onViewLedger: (customer: WholesalerCustomer) => void;
}

export function ShopDetailModal({
  visible,
  customer,
  onClose,
  onReceivePayment,
  onViewLedger,
}: ShopDetailModalProps) {
  const { colors, spacing } = useTheme();
  const [insightsState, setInsightsState] = useState<{ customerId: string; data: ShopInsightsData } | null>(null);

  const customerId = customer?.id;
  const loading = Boolean(visible && customerId && (!insightsState || insightsState.customerId !== customerId));
  const insights =
    insightsState && customerId && insightsState.customerId === customerId
      ? insightsState.data
      : null;

  useEffect(() => {
    let active = true;
    if (visible && customerId) {
      wholesalerService
        .getShopInsights(customerId)
        .then((res) => {
          if (active) setInsightsState({ customerId, data: res });
        })
        .catch((err) => {
          console.warn('Error fetching shop insights:', err);
        });
    }
    return () => {
      active = false;
    };
  }, [visible, customerId]);

  if (!customer) return null;

  const currentBal = Number(customer.current_balance || 0);
  const totalSales = insights ? insights.total_sales : 0;
  const totalProfit = insights ? insights.total_profit : Math.round(totalSales * 0.15);
  const creditTaken = insights ? insights.total_credit_taken : 0;
  const paymentsMade = insights ? insights.total_payments_made : 0;
  const paymentsCount = insights ? insights.payments_count : 0;
  const salesCount = insights ? insights.sales_count : 0;

  const handleCall = () => {
    if (customer.phone) {
      void Linking.openURL(`tel:${customer.phone}`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="storefront" size={20} color={colors.primary} style={{ marginRight: 6 }} />
                <AppText variant="title" numberOfLines={1}>{customer.name}</AppText>
              </View>
              <AppText variant="caption" muted style={{ marginTop: 2 }}>
                Retail Shop Profile & 360° Financial Analytics
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {/* Shop Overview Info Card */}
            <Card style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={15} color="#64748b" style={{ marginRight: 6 }} />
                <AppText variant="caption" muted>Owner / Contact: </AppText>
                <AppText variant="caption" style={styles.boldText}>
                  {customer.owner_name || 'Walk-in / Shop Owner'}
                </AppText>
              </View>

              {customer.phone && (
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={15} color="#64748b" style={{ marginRight: 6 }} />
                  <AppText variant="caption" muted>Phone: </AppText>
                  <Pressable onPress={handleCall} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AppText variant="caption" style={[styles.boldText, { color: colors.primary }]}>
                      {customer.phone}
                    </AppText>
                    <Ionicons name="call" size={12} color={colors.primary} style={{ marginLeft: 4 }} />
                  </Pressable>
                </View>
              )}

              {customer.address && (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={15} color="#64748b" style={{ marginRight: 6 }} />
                  <AppText variant="caption" muted>Location: </AppText>
                  <AppText variant="caption" style={styles.boldText} numberOfLines={1}>
                    {customer.address}
                  </AppText>
                </View>
              )}

              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={15} color="#64748b" style={{ marginRight: 6 }} />
                <AppText variant="caption" muted>Customer Since: </AppText>
                <AppText variant="caption" style={styles.boldText}>
                  {customer.created_at ? formatDate(customer.created_at, { style: 'date' }) : 'Registered'}
                </AppText>
              </View>
            </Card>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <AppText variant="caption" muted style={{ marginTop: 6 }}>
                  Calculating shop analytics & profit...
                </AppText>
              </View>
            ) : (
              <>
                {/* 360° Financial Highlights Grid */}
                <AppText variant="caption" muted style={styles.sectionHeading}>
                  SHOP PERFORMANCE & FINANCIAL HIGHLIGHTS
                </AppText>

                <View style={styles.grid}>
                  {/* Total Sales Card */}
                  <Card style={styles.gridCard}>
                    <View style={[styles.iconWrap, { backgroundColor: '#eff6ff' }]}>
                      <Ionicons name="cart" size={16} color="#2563eb" />
                    </View>
                    <AppText variant="caption" muted>Total Sales</AppText>
                    <AppText style={[styles.gridVal, { color: '#1e40af' }]}>
                      {formatMoney(totalSales)}
                    </AppText>
                    <AppText variant="caption" style={{ fontSize: 10, color: '#64748b' }}>
                      {salesCount} sales slip{salesCount === 1 ? '' : 's'}
                    </AppText>
                  </Card>

                  {/* Total Profit Card */}
                  <Card style={styles.gridCard}>
                    <View style={[styles.iconWrap, { backgroundColor: '#ecfdf5' }]}>
                      <Ionicons name="trending-up" size={16} color="#059669" />
                    </View>
                    <AppText variant="caption" muted>Profit We Made</AppText>
                    <AppText style={[styles.gridVal, { color: '#059669' }]}>
                      {formatMoney(totalProfit)}
                    </AppText>
                    <AppText variant="caption" style={{ fontSize: 10, color: '#059669' }}>
                      Wholesale Margin
                    </AppText>
                  </Card>

                  {/* Current Loan Khata Balance */}
                  <Card style={styles.gridCard}>
                    <View style={[styles.iconWrap, { backgroundColor: currentBal > 0 ? '#fef2f2' : '#ecfdf5' }]}>
                      <Ionicons
                        name={currentBal > 0 ? 'book' : 'checkmark-circle'}
                        size={16}
                        color={currentBal > 0 ? '#dc2626' : '#059669'}
                      />
                    </View>
                    <AppText variant="caption" muted>Current Khata Due</AppText>
                    <AppText style={[styles.gridVal, { color: currentBal > 0 ? '#dc2626' : '#059669' }]}>
                      {formatMoney(currentBal)}
                    </AppText>
                    <AppText variant="caption" style={{ fontSize: 10, color: currentBal > 0 ? '#dc2626' : '#059669' }}>
                      {currentBal > 0 ? 'Pending Payment' : 'Fully Cleared'}
                    </AppText>
                  </Card>

                  {/* Lifetime Credit Taken */}
                  <Card style={styles.gridCard}>
                    <View style={[styles.iconWrap, { backgroundColor: '#fef3c7' }]}>
                      <Ionicons name="time" size={16} color="#d97706" />
                    </View>
                    <AppText variant="caption" muted>Total Credit Taken</AppText>
                    <AppText style={[styles.gridVal, { color: '#b45309' }]}>
                      {formatMoney(creditTaken)}
                    </AppText>
                    <AppText variant="caption" style={{ fontSize: 10, color: '#64748b' }}>
                      Lifetime Loan Khata
                    </AppText>
                  </Card>
                </View>

                {/* Repayment Settlement Track Record */}
                <Card style={styles.trackCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name="shield-checkmark" size={18} color="#10b981" style={{ marginRight: 6 }} />
                    <AppText variant="body" style={styles.boldText}>
                      Khata Repayment Track Record
                    </AppText>
                  </View>
                  <AppText variant="caption" muted style={{ lineHeight: 18 }}>
                    • Total Cash Payments Received: <AppText style={{ fontWeight: '700', color: '#059669' }}>{formatMoney(paymentsMade)}</AppText>
                  </AppText>
                  <AppText variant="caption" muted style={{ lineHeight: 18 }}>
                    • Debt Settlements Recorded: <AppText style={{ fontWeight: '700', color: '#0f172a' }}>{paymentsCount} time{paymentsCount === 1 ? '' : 's'}</AppText>
                  </AppText>
                  <AppText variant="caption" muted style={{ lineHeight: 18 }}>
                    • Payment Status:{' '}
                    <AppText style={{ fontWeight: '700', color: currentBal === 0 ? '#059669' : '#d97706' }}>
                      {currentBal === 0 ? '100% Cleared (Zero Dues)' : `${formatMoney(currentBal)} Remaining Due`}
                    </AppText>
                  </AppText>
                </Card>
              </>
            )}
          </ScrollView>

          {/* Modal Actions */}
          <View style={styles.actions}>
            <Button
              label={currentBal > 0 ? `Receive Khata (${formatMoney(currentBal)})` : 'Receive Payment'}
              variant="primary"
              onPress={() => {
                onClose();
                onReceivePayment(customer);
              }}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              label="View Khata Ledger"
              variant="secondary"
              onPress={() => {
                onClose();
                onViewLedger(customer);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  scrollArea: { maxHeight: 520 },
  infoCard: { padding: 12, borderRadius: 12, marginBottom: 12, backgroundColor: '#f8fafc' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  boldText: { fontWeight: '700', color: '#0f172a' },
  sectionHeading: { fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  gridCard: { width: '48.5%', padding: 10, borderRadius: 12 },
  iconWrap: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  gridVal: { fontSize: 15, fontWeight: '800', marginVertical: 2 },
  trackCard: { padding: 12, borderRadius: 12, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 10 },
  loadingWrap: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', marginTop: 12, paddingTop: 4 },
});
