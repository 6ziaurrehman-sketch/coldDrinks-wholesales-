import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, Pressable, RefreshControl, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { CachedImage } from '@/components/ui/CachedImage';
import { useTheme } from '@/theme/useTheme';
import { useWholesalerStore } from '@/store/wholesalerStore';
import { formatMoney } from '@/utils/formatMoney';
import { InventoryItem } from '@/types/wholesaler.types';
import { formatStockDisplay, getDisplayName } from '@/utils/productUtils';
import { matchInventoryItem } from '@/utils/searchUtils';

// Modals
import { StockAdjustmentModal } from '@/components/wholesaler/StockAdjustmentModal';
import { AddProductModal } from '@/components/wholesaler/AddProductModal';
import { EditProductModal } from '@/components/wholesaler/EditProductModal';
import { ProductDetailModal } from '@/components/wholesaler/ProductDetailModal';

interface InventoryCardProps {
  item: InventoryItem;
  primaryColor: string;
  onSelectDetail: (item: InventoryItem) => void;
  onAdjustStock: (item: InventoryItem) => void;
  onEditProduct: (item: InventoryItem) => void;
}

const InventoryCard = React.memo(function InventoryCard({
  item,
  primaryColor,
  onSelectDetail,
  onAdjustStock,
  onEditProduct,
}: InventoryCardProps) {
  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => onSelectDetail(item)}
        style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.imageBox}>
          <CachedImage
            imageUrl={item.image_url}
            style={styles.image}
            placeholderIcon="water-outline"
            placeholderIconSize={30}
          />
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
              {getDisplayName(item.product_name, item.size_label)}
            </AppText>
            {(() => {
              const isDisabled = item.is_active === false || item.status === 'disabled';
              const bgColor = isDisabled
                ? '#f1f5f9'
                : item.is_out_of_stock
                ? '#fee2e2'
                : item.is_low_stock
                ? '#fef3c7'
                : '#ecfdf5';
              const textColor = isDisabled
                ? '#64748b'
                : item.is_out_of_stock
                ? '#dc2626'
                : item.is_low_stock
                ? '#d97706'
                : '#059669';
              const label = isDisabled
                ? 'DISABLED'
                : item.is_out_of_stock
                ? 'OUT'
                : item.is_low_stock
                ? 'LOW'
                : 'IN STOCK';
              return (
                <View style={[styles.smallBadge, { backgroundColor: bgColor }]}>
                  <AppText style={[styles.smallBadgeText, { color: textColor }]}>
                    {label}
                  </AppText>
                </View>
              );
            })()}
          </View>

          <View style={styles.stockBadgeRow}>
            <View style={[styles.stockPill, { backgroundColor: item.total_units > 0 ? '#f0fdf4' : '#fef2f2' }]}>
              <AppText
                variant="caption"
                style={[
                  styles.boldText,
                  item.total_units > 0 ? { color: '#16a34a' } : { color: '#dc2626' },
                ]}
              >
                {formatStockDisplay(item.available_cartons, item.available_loose_units)}
              </AppText>
              <AppText variant="caption" muted style={{ marginLeft: 4, fontSize: 11 }}>
                ({item.total_units} units)
              </AppText>
            </View>
          </View>

          <View style={styles.priceRow}>
            <AppText variant="caption" muted style={{ fontSize: 11 }}>
              Wholesale Price:
            </AppText>
            <AppText variant="body" style={[styles.boldText, { color: primaryColor, fontSize: 14 }]}>
              {formatMoney(item.price_per_carton)}/ctn
            </AppText>
          </View>
        </View>
      </Pressable>

      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.compactSecondaryBtn, pressed && { opacity: 0.8 }]}
          onPress={() => onAdjustStock(item)}
        >
          <AppText style={styles.compactBtnTextSecondary}>Adjust Stock</AppText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.compactPrimaryBtn,
            { backgroundColor: primaryColor },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => onEditProduct(item)}
        >
          <AppText style={styles.compactBtnTextPrimary}>Edit Product</AppText>
        </Pressable>
      </View>
    </Card>
  );
});

export default function WholesalerInventoryScreen() {
  const { colors, spacing } = useTheme();
  const {
    inventory,
    loadInventory,
    recordStockAdjustment,
    addProduct,
    updateProductDetails,
  } = useWholesalerStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'disabled'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedDetailItem, setSelectedDetailItem] = useState<InventoryItem | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInventory();
    setRefreshing(false);
  }, [loadInventory]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const counts = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let disabled = 0;

    for (const item of inventory) {
      if (item.is_active === false || item.status === 'disabled') {
        disabled++;
      } else if (item.is_out_of_stock || item.total_units === 0) {
        outOfStock++;
      } else if (item.is_low_stock) {
        lowStock++;
      } else {
        inStock++;
      }
    }

    return { inStock, lowStock, outOfStock, disabled };
  }, [inventory]);

  const filteredItems = useMemo(() => {
    return inventory.filter((item) => {
      const isItemDisabled = item.is_active === false || item.status === 'disabled';

      if (filter === 'disabled') {
        if (!isItemDisabled) return false;
      } else if (filter === 'in_stock') {
        if (isItemDisabled || item.total_units === 0 || item.is_low_stock) return false;
      } else if (filter === 'low_stock') {
        if (isItemDisabled || !item.is_low_stock || item.total_units === 0) return false;
      } else if (filter === 'out_of_stock') {
        if (isItemDisabled || item.total_units !== 0) return false;
      }

      if (!matchInventoryItem(item, search)) return false;
      return true;
    });
  }, [inventory, filter, search]);

  const handleSelectDetail = useCallback((item: InventoryItem) => setSelectedDetailItem(item), []);
  const handleAdjustStock = useCallback((item: InventoryItem) => setAdjustItem(item), []);
  const handleEditProduct = useCallback((item: InventoryItem) => setEditingItem(item), []);
  const keyExtractor = useCallback((item: InventoryItem) => item.variant_id, []);

  const renderItem = useCallback(
    ({ item }: { item: InventoryItem }) => (
      <InventoryCard
        item={item}
        primaryColor={colors.primary}
        onSelectDetail={handleSelectDetail}
        onAdjustStock={handleAdjustStock}
        onEditProduct={handleEditProduct}
      />
    ),
    [colors.primary, handleSelectDetail, handleAdjustStock, handleEditProduct]
  );

  return (
    <Screen title="Stock & Inventory" scroll={false}>
      <View style={[styles.container, { paddingHorizontal: spacing.md, paddingTop: 4 }]}>
        {/* Inventory List with unified ListHeaderComponent for pull-to-refresh */}
        <FlatList
          data={filteredItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          updateCellsBatchingPeriod={30}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: 4 }}>
              {/* Top Header: Search input side by side with compact Add Drink button */}
              <View style={styles.topBar}>
                <View style={styles.searchWrapper}>
                  <Input
                    placeholder="Search drinks & packaging..."
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search.length > 0 && (
                    <Pressable
                      onPress={() => setSearch('')}
                      style={styles.clearSearchBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.compactAddBtn,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => setShowAddProduct(true)}
                >
                  <Ionicons name="add" size={18} color="#ffffff" style={{ marginRight: 2 }} />
                  <AppText style={styles.compactAddBtnText}>Add Drink</AppText>
                </Pressable>
              </View>

              {/* Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
                style={{ maxHeight: 38, marginBottom: 10 }}
              >
                {[
                  { key: 'all', label: `All (${inventory.length})` },
                  { key: 'in_stock', label: `In Stock (${counts.inStock})` },
                  { key: 'low_stock', label: `Low Stock (${counts.lowStock})` },
                  { key: 'out_of_stock', label: `Out of Stock (${counts.outOfStock})` },
                  { key: 'disabled', label: `Disabled (${counts.disabled})` },
                ].map((f) => {
                  const isSel = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key as any)}
                      style={[
                        styles.chip,
                        isSel
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { borderColor: colors.border, backgroundColor: colors.surface },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={isSel ? 'onPrimary' : 'text'}
                        style={{ fontWeight: isSel ? '700' : '500', fontSize: 12 }}
                      >
                        {f.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
              <AppText variant="body" muted style={{ marginTop: 8 }}>
                No inventory matching your search.
              </AppText>
            </Card>
          }
        />

        {/* Modals */}
        <StockAdjustmentModal
          visible={Boolean(adjustItem)}
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSubmit={recordStockAdjustment}
        />

        <AddProductModal
          visible={showAddProduct}
          onClose={() => setShowAddProduct(false)}
          onSubmit={addProduct}
        />

        <EditProductModal
          visible={Boolean(editingItem)}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSubmit={updateProductDetails}
        />

        <ProductDetailModal
          visible={Boolean(selectedDetailItem)}
          item={selectedDetailItem}
          onClose={() => setSelectedDetailItem(null)}
          onAdjustStock={(item) => setAdjustItem(item)}
          onEditProduct={(item) => setEditingItem(item)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  searchWrapper: { flex: 1, position: 'relative', justifyContent: 'center' },
  clearSearchBtn: { position: 'absolute', right: 12, zIndex: 5 },
  compactAddBtn: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  compactAddBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  chipsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1 },
  card: { padding: 12, marginBottom: 10, borderRadius: 12 },
  cardHeader: { flexDirection: 'row' },
  imageBox: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  image: { width: '100%', height: '100%' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boldText: { fontWeight: '700' },
  smallBadge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, alignSelf: 'center' },
  smallBadgeText: { fontSize: 10, fontWeight: '700' },
  stockBadgeRow: { marginVertical: 4 },
  stockPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6, alignSelf: 'flex-start' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  compactSecondaryBtn: {
    flex: 1,
    height: 32,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  compactBtnTextSecondary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  compactPrimaryBtn: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  compactBtnTextPrimary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyCard: { padding: 32, alignItems: 'center', justifyContent: 'center' },
});
