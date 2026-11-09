import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/theme/themeContext';
import { tokens } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Stepper } from '@/components/ui/Stepper';
import { CachedImage } from '@/components/ui/CachedImage';
import { formatMoney } from '@/utils/formatMoney';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { CatalogItem } from '@/types/catalog.types';

interface ProductCardProps {
  item: CatalogItem;
  viewMode: 'grid' | 'list';
  onToggleFavorite: (id: string) => void;
  cartQty: number;
  onUpdateCart: (id: string, qty: number) => void;
}

export function ProductCard({ item, viewMode, onToggleFavorite, cartQty, onUpdateCart }: ProductCardProps) {
  const theme = useTheme();
  
  const handleFavorite = () => {
    onToggleFavorite(item.variantId);
  };

  const handleUpdateQty = (newQty: number) => {
    onUpdateCart(item.variantId, newQty);
  };

  const getAvailabilityTone = () => {
    switch (item.availability) {
      case 'in_stock': return 'success';
      case 'low_stock': return 'warning';
      case 'out_of_stock': return 'error';
      default: return 'neutral';
    }
  };

  const isList = viewMode === 'list';

  return (
    <View style={[styles.card, isList ? styles.cardList : styles.cardGrid, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.imageContainer, isList && styles.imageContainerList, { backgroundColor: theme.colors.background }]}>
        <CachedImage
          imageUrl={item.imageUrl}
          style={styles.image}
          placeholderIcon="image-outline"
          placeholderIconSize={40}
        />
        <Pressable 
          style={styles.favoriteButton} 
          onPress={handleFavorite}
          accessibilityRole="button"
          accessibilityLabel={item.isFavorite ? t('catalog.unfavorite') : t('catalog.favorite')}
        >
          <Ionicons 
            name={item.isFavorite ? "heart" : "heart-outline"} 
            size={24} 
            color={item.isFavorite ? theme.colors.error : theme.colors.textMuted} 
          />
        </Pressable>
      </View>

      <View style={[styles.content, isList && styles.contentList]}>
        <View>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>{item.brand}</AppText>
          <AppText variant="subtitle" numberOfLines={2} style={styles.name}>{item.name}</AppText>
          <AppText variant="caption" color="textMuted">
            {t(`catalog.unit_${item.saleUnit}`, { count: item.piecesPerUnit })}
          </AppText>
        </View>
        
        <View style={styles.priceRow}>
          <View>
            <AppText variant="title" color="text">{formatMoney(item.shopPrice)}</AppText>
            {item.normalPrice > item.shopPrice && (
              <AppText variant="caption" color="textMuted" style={styles.strike}>
                {formatMoney(item.normalPrice)}
              </AppText>
            )}
          </View>
          <Badge 
            label={t(`catalog.availability_${item.availability}`) || item.availability}
            tone={getAvailabilityTone()} 
          />
        </View>

        <View style={styles.actions}>
          <Stepper 
            value={cartQty} 
            onChange={handleUpdateQty} 
            min={0} 
            max={item.maxQty} 
            multiple={item.qtyMultiple}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e5e5', // Would use theme.colors.border normally
  },
  cardGrid: {
    flex: 1,
    flexDirection: 'column',
    margin: tokens.spacing.xs,
  },
  cardList: {
    flexDirection: 'row',
    marginHorizontal: tokens.spacing.md,
    marginVertical: tokens.spacing.xs,
  },
  imageContainer: {
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imageContainerList: {
    width: 100,
    height: 100,
  },
  image: {
    width: '80%',
    height: '80%',
  },
  favoriteButton: {
    position: 'absolute',
    top: tokens.spacing.xs,
    end: tokens.spacing.xs,
    padding: tokens.spacing.xs,
  },
  content: {
    padding: tokens.spacing.sm,
    flex: 1,
    justifyContent: 'space-between',
  },
  contentList: {
    justifyContent: 'space-between',
  },
  name: {
    marginVertical: tokens.spacing.xxs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: tokens.spacing.sm,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  actions: {
    alignItems: 'flex-start',
  }
});
