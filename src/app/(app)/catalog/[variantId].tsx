import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/Stepper';
import { Screen } from '@/components/ui/Screen';
import { ScreenState } from '@/components/ui/ScreenState';
import { PriceDisplay } from '@/components/pricing/PriceDisplay';
import { CachedImage } from '@/components/ui/CachedImage';
import { useProductDetailStore } from '@/store/productDetailStore';
import { useTheme } from '@/theme/useTheme';
import { t } from '@/i18n';
import { formatMoney } from '@/utils/formatMoney';
import { Badge } from '@/components/ui/Badge';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@/store/cartStore';

export default function ProductDetailScreen() {
  const { variantId } = useLocalSearchParams<{ variantId: string }>();
  const { product, qty, load, setQty, toggleFavorite, status, error } = useProductDetailStore();
  const { setQty: updateCartQty } = useCartStore();
  const { colors, spacing } = useTheme();

  useEffect(() => {
    if (variantId) {
      void load(variantId);
    }
  }, [variantId, load]);

  const handleAddToCart = () => {
    if (product) {
      void updateCartQty('default_cart', product.variantId, qty);
    }
  };

  if (status === 'loading' || !product) {
    return <ScreenState status="loading" />;
  }
  if (status === 'error') {
    return <ScreenState status="error" errorMessage={error?.message} onRetry={() => { if (variantId) void load(variantId); }} />;
  }

  const isOutOfStock = product.availability === 'out_of_stock';

  return (
    <Screen title={product.name} scroll>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.imageContainer}>
          <CachedImage 
            imageUrl={product.images?.[0]} 
            style={styles.productImage} 
            placeholderIcon="image-outline"
            placeholderIconSize={48}
          />
        </View>
        
        <View style={styles.header}>
          <AppText variant="title">{product.brand} - {product.name}</AppText>
          <Ionicons 
            name={product.isFavorite ? 'heart' : 'heart-outline'} 
            size={24} 
            color={product.isFavorite ? colors.error : colors.textMuted} 
            onPress={toggleFavorite} 
          />
        </View>

        <View style={styles.priceSection}>
          <PriceDisplay shopPrice={product.shopPrice} normalPrice={product.normalPrice} size="large" />
          <Badge 
            label={isOutOfStock ? 'Out of Stock' : 'In Stock'}
            tone={isOutOfStock ? 'error' : 'success'} 
          />
        </View>

        <View style={styles.qtySection}>
          <Stepper 
            value={qty} 
            onChange={setQty} 
            min={product.minQty} 
            max={product.maxQty || 999} 
            multiple={product.qtyMultiple} 
          />
          <AppText variant="caption" color={colors.textMuted}>
            Line Total: {formatMoney(qty * product.shopPrice)}
          </AppText>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { borderTopColor: colors.border }]}>
        <AppText variant="subtitle">{formatMoney(qty * product.shopPrice)}</AppText>
        <Button 
          label={isOutOfStock ? t('notify_me') : t('add_to_cart')} 
          onPress={handleAddToCart}
          disabled={isOutOfStock} // Optionally enable if notify functionality is separate
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  imageContainer: { height: 260, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderRadius: 12, overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  imagePlaceholder: { height: 260, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', width: '100%', borderRadius: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  priceSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  qtySection: { gap: 8, marginBottom: 24 },
  bottomBar: { padding: 16, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
