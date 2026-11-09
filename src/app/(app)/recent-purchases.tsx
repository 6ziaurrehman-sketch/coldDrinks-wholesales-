import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Card, Stepper, EmptyState, Button } from '@/components/ui';
import { reorderService } from '@/lib/reorderService';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatMoney } from '@/utils/formatMoney';
import type { RecentProductItem } from '@/types/reorder.types';

export default function RecentPurchasesScreen() {
  const theme = useTheme();
  const { activeShopId } = useAuthStore();

  const [items, setItems] = useState<RecentProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const refreshRecent = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    try {
      const data = await reorderService.fetchRecentProducts(activeShopId, 30);
      setItems(data);
      const initialQty: Record<string, number> = {};
      data.forEach((i) => {
        initialQty[i.variantId] = i.minQty;
      });
      setQuantities(initialQty);
    } finally {
      setLoading(false);
    }
  }, [activeShopId]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (!activeShopId) {
        setLoading(false);
        return;
      }
      try {
        const data = await reorderService.fetchRecentProducts(activeShopId, 30);
        if (!active) return;
        setItems(data);

        const initialQty: Record<string, number> = {};
        data.forEach((i) => {
          initialQty[i.variantId] = i.minQty;
        });
        setQuantities(initialQty);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [activeShopId]);

  const handleAddToCart = async (item: RecentProductItem) => {
    if (!activeShopId) return;
    const qty = quantities[item.variantId] || item.minQty;
    await useCartStore.getState().setQty(activeShopId, item.variantId, qty);
    router.push('/(app)/(tabs)/cart');
  };

  const formatRecency = (daysAgo?: number) => {
    const days = daysAgo ?? 0;
    if (days <= 0) return t('recentPurchases.lastOrderedToday');
    return t('recentPurchases.lastOrderedDays', { days });
  };

  return (
    <Screen title={t('recentPurchases.title')} onBack={router.back}>
      <ScreenState
        status={loading && items.length === 0 ? 'loading' : 'data'}
        onRetry={refreshRecent}
        data={
          items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <EmptyState
                title={t('recentPurchases.emptyTitle')}
                message={t('recentPurchases.emptyMessage')}
              />
              <View style={styles.emptyBtn}>
                <Button
                  label="Browse Catalog"
                  variant="primary"
                  onPress={() => router.push('/(app)/(tabs)/catalog')}
                />
              </View>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.variantId}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={refreshRecent}
                  colors={[theme.colors.primary]}
                />
              }
              renderItem={({ item }) => (
                <Card style={styles.card}>
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="subtitle">{item.productName}</AppText>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {item.brandName ? `${item.brandName} • ` : ''}
                        {item.saleUnit}
                      </AppText>

                      {/* Recency & frequency badges */}
                      <View style={styles.recencyRow}>
                        <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                          🕒 {formatRecency(item.daysAgo)}
                        </AppText>
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          • {t('recentPurchases.orderCount', { count: item.orderFrequency })}
                        </AppText>
                      </View>
                    </View>

                    {item.isAvailable ? (
                      <Badge label="In Stock" tone="success" />
                    ) : (
                      <Badge label="Unavailable" tone="error" />
                    )}
                  </View>

                  <View style={[styles.footerRow, { borderTopColor: theme.colors.border }]}>
                    <AppText variant="subtitle" color={theme.colors.primary}>
                      {formatMoney(item.currentPrice)}
                    </AppText>

                    {item.isAvailable ? (
                      <View style={styles.stepperActionCol}>
                        <Stepper
                          value={quantities[item.variantId] || item.minQty}
                          min={item.minQty}
                          max={item.maxQty}
                          multiple={item.qtyMultiple}
                          onChange={(val) =>
                            setQuantities((prev) => ({ ...prev, [item.variantId]: val }))
                          }
                        />
                        <View style={{ height: 6 }} />
                        <Button
                          label="Add to Cart"
                          variant="primary"
                          onPress={() => handleAddToCart(item)}
                        />
                      </View>
                    ) : (
                      <Badge label="Out of Stock" tone="error" />
                    )}
                  </View>
                </Card>
              )}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  recencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepperActionCol: {
    alignItems: 'flex-end',
  },
  emptyContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtn: {
    marginTop: 16,
    width: '60%',
  },
});
