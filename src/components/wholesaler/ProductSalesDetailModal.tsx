import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/theme/useTheme';
import { WholesalerTopSellingItem } from '@/types/wholesaler.types';
import { formatMoney } from '@/utils/formatMoney';

interface ProductSalesDetailModalProps {
  visible: boolean;
  item: WholesalerTopSellingItem | null;
  periodLabel: string;
  rank?: number;
  onClose: () => void;
}

export function ProductSalesDetailModal({
  visible,
  item,
  periodLabel,
  rank,
  onClose,
}: ProductSalesDetailModalProps) {
  const { colors, spacing } = useTheme();

  if (!item) return null;

  const rev = Number(item.total_revenue || 0);
  const profit =
    item.total_profit !== undefined && item.total_profit !== null
      ? Number(item.total_profit)
      : Math.round(rev * 0.15);
  const cost =
    item.total_cost !== undefined && item.total_cost !== null
      ? Number(item.total_cost)
      : Math.max(0, rev - profit);
  const marginPct = rev > 0 ? ((profit / rev) * 100).toFixed(1) : '0.0';
  const cartons = Number(item.cartons_sold || 0);
  const loose = Number(item.loose_sold || 0);
  const units = Number(item.total_units_sold || 0);
  const avgPricePerCarton = cartons > 0 ? Math.round(rev / cartons) : 0;
  const avgCostPerCarton = cartons > 0 ? Math.round(cost / cartons) : 0;
  const profitPerCarton = cartons > 0 ? Math.round(profit / cartons) : 0;
  const isProfitPos = profit >= 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={styles.titleRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name="wine" size={18} color={colors.primary} />
                </View>
                <AppText variant="title" style={styles.productTitle} numberOfLines={2}>
                  {item.product_name}
                </AppText>
              </View>
              <View style={styles.tagsRow}>
                {rank ? (
                  <View
                    style={[
                      styles.rankTag,
                      rank === 1
                        ? styles.goldRank
                        : rank === 2
                        ? styles.silverRank
                        : rank === 3
                        ? styles.bronzeRank
                        : styles.defaultRank,
                    ]}
                  >
                    <Ionicons
                      name="trophy"
                      size={11}
                      color={
                        rank === 1
                          ? '#b45309'
                          : rank === 2
                          ? '#475569'
                          : rank === 3
                          ? '#c2410c'
                          : '#64748b'
                      }
                      style={{ marginRight: 3 }}
                    />
                    <AppText
                      style={[
                        styles.rankTagText,
                        {
                          color:
                            rank === 1
                              ? '#b45309'
                              : rank === 2
                              ? '#475569'
                              : rank === 3
                              ? '#c2410c'
                              : '#64748b',
                        },
                      ]}
                    >
                      Rank #{rank}
                    </AppText>
                  </View>
                ) : null}

                <View style={styles.periodTag}>
                  <Ionicons name="calendar-outline" size={11} color="#0369a1" style={{ marginRight: 3 }} />
                  <AppText style={styles.periodTagText}>{periodLabel}</AppText>
                </View>

                {item.size_label ? (
                  <View style={styles.sizeTag}>
                    <AppText style={styles.sizeTagText}>{item.size_label}</AppText>
                  </View>
                ) : null}
              </View>
            </View>

            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {/* Hero Cartons Box */}
            <Card style={styles.heroBox}>
              <View style={styles.heroIconBox}>
                <Ionicons name="cube" size={26} color="#0284c7" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.heroSub}>
                  TOTAL CARTONS (CTN) SOLD
                </AppText>
                <View style={styles.cartonNumberRow}>
                  <AppText style={styles.heroCartonNumber}>
                    {cartons}{' '}
                    <AppText style={styles.heroUnitLabel}>Cartons</AppText>
                  </AppText>
                  {loose > 0 && (
                    <View style={styles.loosePill}>
                      <AppText style={styles.loosePillText}>+ {loose} loose pcs</AppText>
                    </View>
                  )}
                </View>
                <AppText variant="caption" muted style={{ marginTop: 2 }}>
                  Equivalent to {units.toLocaleString()} total units/bottles
                </AppText>
              </View>
            </Card>

            {/* Financials Grid */}
            <AppText variant="caption" muted style={styles.sectionHeading}>
              FINANCIAL PERFORMANCE &amp; MARGIN
            </AppText>

            <View style={styles.statsGrid}>
              {/* Total Revenue */}
              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="cash" size={16} color="#2563eb" />
                </View>
                <AppText variant="caption" muted style={styles.statLabel}>
                  Total Revenue
                </AppText>
                <AppText style={[styles.statValue, { color: '#1e293b' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(rev)}
                </AppText>
                <AppText variant="caption" style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                  Gross sales income
                </AppText>
              </Card>

              {/* Total Profit */}
              <Card style={styles.statCard}>
                <View
                  style={[
                    styles.statIconBox,
                    { backgroundColor: isProfitPos ? '#ecfdf5' : '#fef2f2' },
                  ]}
                >
                  <Ionicons
                    name={isProfitPos ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={isProfitPos ? '#059669' : '#dc2626'}
                  />
                </View>
                <AppText variant="caption" muted style={styles.statLabel}>
                  Net Profit
                </AppText>
                <AppText
                  style={[styles.statValue, { color: isProfitPos ? '#059669' : '#dc2626' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatMoney(profit)}
                </AppText>
                <AppText variant="caption" style={{ color: isProfitPos ? '#059669' : '#dc2626', fontSize: 10, marginTop: 2 }}>
                  Margin: {marginPct}%
                </AppText>
              </Card>

              {/* Avg Price per Carton */}
              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#f0fdf4' }]}>
                  <Ionicons name="pricetag" size={16} color="#16a34a" />
                </View>
                <AppText variant="caption" muted style={styles.statLabel}>
                  Avg Price / Carton
                </AppText>
                <AppText style={[styles.statValue, { color: '#16a34a' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(avgPricePerCarton)}
                </AppText>
                <AppText variant="caption" style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                  Billed per carton
                </AppText>
              </Card>

              {/* Profit per Carton */}
              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="pie-chart" size={16} color="#d97706" />
                </View>
                <AppText variant="caption" muted style={styles.statLabel}>
                  Profit / Carton
                </AppText>
                <AppText style={[styles.statValue, { color: '#d97706' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(profitPerCarton)}
                </AppText>
                <AppText variant="caption" style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                  Net gain per box
                </AppText>
              </Card>

              {/* Wholesale Cost */}
              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#f8fafc' }]}>
                  <Ionicons name="business" size={16} color="#475569" />
                </View>
                <AppText variant="caption" muted style={styles.statLabel}>
                  Wholesale Cost
                </AppText>
                <AppText style={[styles.statValue, { color: '#475569' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(cost)}
                </AppText>
                <AppText variant="caption" style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                  Cost of goods sold
                </AppText>
              </Card>

              {/* Cost per Carton */}
              <Card style={styles.statCard}>
                <View style={[styles.statIconBox, { backgroundColor: '#f8fafc' }]}>
                  <Ionicons name="receipt-outline" size={16} color="#64748b" />
                </View>
                <AppText variant="caption" muted style={styles.statLabel}>
                  Cost / Carton
                </AppText>
                <AppText style={[styles.statValue, { color: '#64748b' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(avgCostPerCarton)}
                </AppText>
                <AppText variant="caption" style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                  Supplier purchase basis
                </AppText>
              </Card>
            </View>

            {/* Explanatory Footer Note */}
            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={16} color="#0284c7" style={{ marginRight: 6, marginTop: 1 }} />
              <AppText variant="caption" style={styles.noteText}>
                Carton counts and revenues are calculated directly from finalized sales slips recorded in{' '}
                <AppText style={{ fontWeight: '700' }}>{periodLabel}</AppText>. Cancelled slips are excluded.
              </AppText>
            </View>

            {/* Close Button */}
            <Pressable
              style={[styles.dismissBtn, { backgroundColor: colors.primary }]}
              onPress={onClose}
            >
              <AppText style={styles.dismissBtnText}>Close Details</AppText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  productTitle: {
    fontWeight: '800',
    fontSize: 17,
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rankTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  goldRank: {
    backgroundColor: '#fef3c7',
    borderWidth: 0.5,
    borderColor: '#fcd34d',
  },
  silverRank: {
    backgroundColor: '#f1f5f9',
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
  },
  bronzeRank: {
    backgroundColor: '#ffedd5',
    borderWidth: 0.5,
    borderColor: '#fdba74',
  },
  defaultRank: {
    backgroundColor: '#f8fafc',
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
  },
  rankTagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  periodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#bae6fd',
  },
  periodTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0369a1',
  },
  sizeTag: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  sizeTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#4b5563',
  },
  closeBtn: {
    padding: 2,
  },
  scrollArea: {
    paddingTop: 14,
  },
  heroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 14,
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heroSub: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0284c7',
    letterSpacing: 0.5,
  },
  cartonNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  heroCartonNumber: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0369a1',
    lineHeight: 32,
  },
  heroUnitLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0284c7',
  },
  loosePill: {
    backgroundColor: '#dbeafe',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#93c5fd',
  },
  loosePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  sectionHeading: {
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    fontSize: 11,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: '48%',
    padding: 12,
    borderRadius: 12,
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#64748b',
  },
  dismissBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
