import React, { memo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { AppText } from '@/components/AppText';
import { ProductTileCard } from './ProductTileCard';
import { ProductTile } from '@/types/home.types';
import { spacing } from '@/theme/tokens';

export const HorizontalProductList = memo(function HorizontalProductList({ title, products }: { title: string, products: ProductTile[] }) {
  if (!products?.length) return null;

  return (
    <View style={styles.container}>
      <AppText variant="title" style={styles.title}>{title}</AppText>
      <FlatList
        data={products}
        keyExtractor={(item) => item.variantId}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ProductTileCard product={item} />}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  title: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  }
});
