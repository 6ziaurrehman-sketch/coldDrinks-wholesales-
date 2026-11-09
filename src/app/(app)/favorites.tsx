import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Badge, Card, Stepper, EmptyState, Button } from '@/components/ui';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { formatMoney } from '@/utils/formatMoney';
import { supabase } from '@/lib/supabase';

interface FavoriteProductItem {
  variantId: string;
  productName: string;
  brandName: string | null;
  saleUnit: string;
  price: number;
  stockStatus: string;
  isAvailable: boolean;
  minQty: number;
  maxQty: number;
  qtyMultiple: number;
}

export default function FavoritesScreen() {
  const theme = useTheme();
  const { activeShopId } = useAuthStore();
  const { load, toggle } = useFavoritesStore();

  const [items, setItems] = useState<FavoriteProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const refreshFavorites = useCallback(async () => {
    if (!activeShopId) return;
    setLoading(true);
    try {
      await load(activeShopId);

      const { data, error } = await (supabase as any)
        .from('favorites')
        .select(`
          variant_id,
          product_variants (
            id,
            sale_unit,
            price,
            stock_status,
            min_qty,
            max_qty,
            qty_multiple,
            is_active,
            products (
              name,
              is_active,
              brands (name)
            )
          )
        `)
        .eq('shop_id', activeShopId);

      if (error) throw error;

      const loadedItems: FavoriteProductItem[] = (data || []).map((row: any) => {
        const pv = row.product_variants;
        const prod = pv?.products;
        const isAvail = Boolean(pv && pv.is_active && prod && prod.is_active && pv.stock_status === 'in_stock');

        return {
          variantId: row.variant_id,
          productName: prod?.name || 'Unavailable Product',
          brandName: prod?.brands?.name || null,
          saleUnit: pv?.sale_unit || 'unit',
          price: Number(pv?.price || 0),
          stockStatus: pv?.stock_status || 'out_of_stock',
          isAvailable: isAvail,
          minQty: Number(pv?.min_qty || 1),
          maxQty: Number(pv?.max_qty || 999),
          qtyMultiple: Number(pv?.qty_multiple || 1),
        };
      });

      setItems(loadedItems);

      // Initialize quantities
      const initialQty: Record<string, number> = {};
      loadedItems.forEach((i) => {
        initialQty[i.variantId] = i.minQty;
      });
      setQuantities(initialQty);
    } finally {
      setLoading(false);
    }
  }, [activeShopId, load]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (!activeShopId) {
        setLoading(false);
        return;
      }
      try {
        await load(activeShopId);

        const { data, error } = await (supabase as any)
          .from('favorites')
          .select(`
            variant_id,
            product_variants (
              id,
              sale_unit,
              price,
              stock_status,
              min_qty,
              max_qty,
              qty_multiple,
              is_active,
              products (
                name,
                is_active,
                brands (name)
              )
            )
          `)
          .eq('shop_id', activeShopId);

        if (error) throw error;
        if (!active) return;

        const loadedItems: FavoriteProductItem[] = (data || []).map((row: any) => {
          const pv = row.product_variants;
          const prod = pv?.products;
          const isAvail = Boolean(pv && pv.is_active && prod && prod.is_active && pv.stock_status === 'in_stock');

          return {
            variantId: row.variant_id,
            productName: prod?.name || 'Unavailable Product',
            brandName: prod?.brands?.name || null,
            saleUnit: pv?.sale_unit || 'unit',
            price: Number(pv?.price || 0),
            stockStatus: pv?.stock_status || 'out_of_stock',
            isAvailable: isAvail,
            minQty: Number(pv?.min_qty || 1),
            maxQty: Number(pv?.max_qty || 999),
            qtyMultiple: Number(pv?.qty_multiple || 1),
          };
        });

        setItems(loadedItems);

        // Initialize quantities
        const initialQty: Record<string, number> = {};
        loadedItems.forEach((i) => {
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
  }, [activeShopId, load]);

  const handleRemoveFavorite = async (variantId: string) => {
    if (!activeShopId) return;
    await toggle(activeShopId, variantId);
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const handleAddToCart = async (item: FavoriteProductItem) => {
    if (!activeShopId) return;
    const qty = quantities[item.variantId] || item.minQty;
    await useCartStore.getState().setQty(activeShopId, item.variantId, qty);
    router.push('/(app)/(tabs)/cart');
  };

  return (
    <Screen title={t('favorites.title')} onBack={router.back}>
      <ScreenState
        status={loading && items.length === 0 ? 'loading' : 'data'}
        onRetry={refreshFavorites}
        data={
          items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <EmptyState
                title={t('favorites.emptyTitle')}
                message={t('favorites.emptyMessage')}
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
                  onRefresh={refreshFavorites}
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
                    </View>

                    {item.isAvailable ? (
                      <Badge label="In Stock" tone="success" />
                    ) : (
                      <Badge label="Unavailable" tone="error" />
                    )}
                  </View>

                  <View style={[styles.footerRow, { borderTopColor: theme.colors.border }]}>
                    <View>
                      <AppText variant="subtitle" color={theme.colors.primary}>
                        {formatMoney(item.price)}
                      </AppText>
                      <Pressable
                        onPress={() => handleRemoveFavorite(item.variantId)}
                        style={styles.removeBtn}
                      >
                        <AppText variant="caption" color={theme.colors.error}>
                          💔 {t('favorites.remove')}
                        </AppText>
                      </Pressable>
                    </View>

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
                      <Button
                        label="Remove"
                        variant="ghost"
                        onPress={() => handleRemoveFavorite(item.variantId)}
                      />
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  removeBtn: {
    marginTop: 4,
    paddingVertical: 2,
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
