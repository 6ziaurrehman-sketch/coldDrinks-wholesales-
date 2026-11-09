import React, { memo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Stepper } from '@/components/Stepper';
import { CachedImage } from '@/components/ui/CachedImage';
import { useTheme } from '@/theme/useTheme';
import { spacing, radius } from '@/theme/tokens';
import { ProductTile } from '@/types/home.types';
import { formatMoney } from '@/utils/formatMoney';
import { useCartStore } from '@/store/cartStore';

export const ProductTileCard = memo(function ProductTileCard({ product }: { product: ProductTile }) {
  const theme = useTheme();
  // Using generic zustand selector syntax assuming useCartStore has items
  const cartItem = useCartStore((state: any) => state.items?.find((i: any) => i.variantId === product.variantId));
  const quantity = cartItem?.quantity || 0;
  
  const handleQtyChange = (val: number) => {
    const shopId = 'default_cart';
    if (val === 0) {
      void useCartStore.getState().removeItem(shopId, product.variantId);
    } else {
      void useCartStore.getState().setQty(shopId, product.variantId, val);
    }
  };

  return (
    <Card style={styles.card}>
      <Pressable onPress={() => router.push(`/catalog/product/${product.productId}`)}>
        <View style={styles.imageContainer}>
          <CachedImage
            imageUrl={product.imageUrl}
            style={styles.image}
            placeholderIcon="water-outline"
            placeholderIconSize={32}
          />
        </View>
        <View style={styles.info}>
          <AppText muted variant="caption" numberOfLines={1}>{product.brand}</AppText>
          <AppText variant="subtitle" numberOfLines={2} style={styles.name}>{product.name}</AppText>
          <AppText>{product.saleUnit} ({product.piecesPerUnit} pcs)</AppText>
          <View style={styles.priceRow}>
            <AppText variant="subtitle" color={theme.colors.primary}>{formatMoney(product.shopPrice)}</AppText>
            {product.normalPrice > product.shopPrice && (
              <AppText muted style={styles.strike}>{formatMoney(product.normalPrice)}</AppText>
            )}
          </View>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Stepper 
          value={quantity} 
          onChange={handleQtyChange}
          min={0}
          max={product.maxQty || 99}
          multiple={product.qtyMultiple || 1}
        />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 160,
    marginEnd: spacing.md,
  },
  imageContainer: {
    height: 120,
    borderTopStartRadius: radius.md,
    borderTopEndRadius: radius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  info: {
    padding: spacing.sm,
  },
  name: {
    height: 40,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  strike: {
    textDecorationLine: 'line-through',
    fontSize: 12,
  },
  actions: {
    padding: spacing.sm,
    paddingTop: 0,
    alignItems: 'center',
  }
});
