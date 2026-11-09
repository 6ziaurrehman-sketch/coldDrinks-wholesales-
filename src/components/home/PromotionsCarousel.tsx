import React, { memo } from 'react';
import { View, StyleSheet, FlatList, Pressable, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Banner } from '@/types/home.types';
import { spacing, radius } from '@/theme/tokens';
import { AppText } from '@/components/AppText';
import { CachedImage } from '@/components/ui/CachedImage';

const { width } = Dimensions.get('window');
const BANNER_WIDTH = width - spacing.md * 2;

export const PromotionsCarousel = memo(function PromotionsCarousel({ banners }: { banners: Banner[] }) {
  if (!banners?.length) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={banners}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled
        snapToInterval={width}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable 
            style={[styles.banner, { width: BANNER_WIDTH }]}
            onPress={() => {
              if (item.linkType && item.linkTarget) {
                router.push(item.linkTarget as any);
              }
            }}
          >
            {item.imageUrl ? (
              <CachedImage imageUrl={item.imageUrl} style={styles.image} contentFit="cover" />
            ) : (
              <View style={styles.textBanner}>
                <AppText variant="subtitle" style={styles.title}>{item.title}</AppText>
                {item.body && <AppText numberOfLines={2}>{item.body}</AppText>}
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  banner: {
    height: 140,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textBanner: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    marginBottom: spacing.xs,
  }
});
