import React from 'react';
import { View, StyleSheet, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CachedImage } from '@/components/ui/CachedImage';
import { useTheme } from '@/theme/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { InventoryItem } from '@/types/wholesaler.types';

interface ProductDetailModalProps {
  visible: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onAdjustStock: (item: InventoryItem) => void;
  onEditProduct: (item: InventoryItem) => void;
}

export function ProductDetailModal({
  visible,
  item,
  onClose,
  onAdjustStock,
  onEditProduct,
}: ProductDetailModalProps) {
  const { colors, spacing } = useTheme();

  if (!item) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
                {item.product_name}
              </AppText>
              <AppText variant="caption" muted>
                {item.brand_name} • {item.category_name}
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            {/* Image Preview & Status Badge */}
            <View style={styles.imageContainer}>
              <View style={styles.imageBox}>
                <CachedImage
                  imageUrl={item.image_url}
                  style={styles.image}
                  placeholderIcon="water-outline"
                  placeholderIconSize={54}
                />
              </View>
              <View style={{ marginTop: 8 }}>
                <Badge
                  label={
                    item.is_active === false || item.status === 'disabled'
                      ? 'DISABLED'
                      : item.is_out_of_stock
                      ? 'OUT OF STOCK'
                      : item.is_low_stock
                      ? 'LOW STOCK'
                      : 'IN STOCK'
                  }
                  tone={
                    item.is_active === false || item.status === 'disabled'
                      ? 'neutral'
                      : item.is_out_of_stock
                      ? 'error'
                      : item.is_low_stock
                      ? 'warning'
                      : 'success'
                  }
                />
              </View>
            </View>

            {/* Packaging & Unit Info Card */}
            <Card style={styles.sectionCard}>
              <AppText variant="caption" muted style={styles.sectionTitle}>
                PACKAGING SPECIFICATIONS
              </AppText>
              <View style={styles.specRow}>
                <AppText variant="body">Bottle / Can Size:</AppText>
                <AppText variant="body" style={styles.boldText}>{item.size_label}</AppText>
              </View>
              <View style={styles.specRow}>
                <AppText variant="body">Packaging Type:</AppText>
                <AppText variant="body" style={[styles.boldText, { textTransform: 'capitalize' }]}>
                  {item.packaging_type}
                </AppText>
              </View>
              <View style={styles.specRow}>
                <AppText variant="body">Bottles per Carton:</AppText>
                <AppText variant="body" style={styles.boldText}>
                  {item.pieces_per_carton} pcs/carton
                </AppText>
              </View>
            </Card>

            {/* Current Physical Inventory Card */}
            <Card style={styles.sectionCard}>
              <AppText variant="caption" muted style={styles.sectionTitle}>
                INVENTORY & WAREHOUSE STOCK
              </AppText>
              <View style={styles.stockSummaryBox}>
                <View style={styles.stockColumn}>
                  <AppText variant="caption" muted>Cartons Available</AppText>
                  <AppText variant="title" style={[styles.boldText, { color: colors.primary }]}>
                    {item.available_cartons}
                  </AppText>
                </View>
                <View style={styles.stockDivider} />
                <View style={styles.stockColumn}>
                  <AppText variant="caption" muted>Bottles</AppText>
                  <AppText variant="title" style={[styles.boldText, { color: colors.primary }]}>
                    {item.available_loose_units}
                  </AppText>
                </View>
              </View>

              <View style={[styles.specRow, { marginTop: 10 }]}>
                <AppText variant="body">Total Physical Units:</AppText>
                <AppText variant="body" style={styles.boldText}>
                  {item.total_units} bottles/cans
                </AppText>
              </View>
              <View style={styles.specRow}>
                <AppText variant="body">Low-Stock Alert Level:</AppText>
                <AppText variant="body" style={styles.boldText}>
                  {item.low_stock_threshold} units
                </AppText>
              </View>
            </Card>

            {/* Pricing & Cost Details Card */}
            <Card style={styles.sectionCard}>
              <AppText variant="caption" muted style={styles.sectionTitle}>
                WHOLESALE RATES & VALUATION
              </AppText>
              <View style={styles.specRow}>
                <AppText variant="body">Wholesale Carton Price:</AppText>
                <AppText variant="body" style={[styles.boldText, { color: colors.primary }]}>
                  {formatMoney(item.price_per_carton)}
                </AppText>
              </View>
              <View style={styles.specRow}>
                <AppText variant="body">Bottle / Can Rate:</AppText>
                <AppText variant="body" style={styles.boldText}>
                  {formatMoney(item.price_per_unit)}
                </AppText>
              </View>
              {item.cost_per_carton > 0 && (
                <>
                  <View style={styles.specRow}>
                    <AppText variant="body">Purchase Cost (per Carton):</AppText>
                    <AppText variant="body" style={styles.boldText}>
                      {formatMoney(item.cost_per_carton)}
                    </AppText>
                  </View>
                  <View style={styles.specRow}>
                    <AppText variant="body">Purchase Cost (per Bottle):</AppText>
                    <AppText variant="body" style={styles.boldText}>
                      {formatMoney(item.cost_per_unit)}
                    </AppText>
                  </View>
                </>
              )}
              {item.stock_value > 0 && (
                <View style={[styles.specRow, { paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f0f0f0' }]}>
                  <AppText variant="body" style={styles.boldText}>Total Stock Valuation:</AppText>
                  <AppText variant="body" style={[styles.boldText, { color: colors.success }]}>
                    {formatMoney(item.stock_value)}
                  </AppText>
                </View>
              )}
            </Card>

            {/* Quick Action Buttons */}
            <View style={styles.actionsRow}>
              <Button
                label="Adjust Stock"
                variant="secondary"
                onPress={() => {
                  onClose();
                  onAdjustStock(item);
                }}
                style={styles.actionBtn}
              />
              <Button
                label="Edit Product"
                variant="primary"
                onPress={() => {
                  onClose();
                  onEditProduct(item);
                }}
                style={styles.actionBtn}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeBtn: {
    padding: 4,
  },
  boldText: {
    fontWeight: '700',
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  imageBox: {
    width: 110,
    height: 110,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  sectionCard: {
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  stockSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4,
  },
  stockColumn: {
    flex: 1,
    alignItems: 'center',
  },
  stockDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#cbd5e1',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
  },
});
