import React, { memo } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { CachedImage } from '@/components/ui/CachedImage';
import { useTheme } from '@/theme/useTheme';
import { BrandTile, CategoryTile } from '@/types/home.types';
import { spacing, radius } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';

export const BrandCategorySection = memo(function BrandCategorySection({ 
  title, 
  items, 
  type 
}: { 
  title: string, 
  items: (BrandTile | CategoryTile)[],
  type: 'brand' | 'category'
}) {
  const theme = useTheme();

  if (!items?.length) return null;

  const renderItem = ({ item }: { item: any }) => {
    return (
      <Pressable 
        style={styles.item}
        onPress={() => {
          router.push(`/catalog/search?${type}=${item.id}`);
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.surface }]}>
          {type === 'brand' && item.logoUrl ? (
            <CachedImage
              imageUrl={item.logoUrl}
              style={styles.image}
              placeholderIcon="cube-outline"
              placeholderIconSize={24}
            />
          ) : type === 'category' && item.iconName ? (
            <Ionicons name={item.iconName as any} size={24} color={theme.colors.primary} />
          ) : (
            <Ionicons name="grid-outline" size={24} color={theme.colors.primary} />
          )}
        </View>
        <AppText variant="caption" style={styles.name} numberOfLines={2}>{item.name}</AppText>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <AppText variant="title" style={styles.title}>{title}</AppText>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
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
    gap: spacing.md,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  image: {
    width: '80%',
    height: '80%',
  },
  name: {
    textAlign: 'center',
  }
});
