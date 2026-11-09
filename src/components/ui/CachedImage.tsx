import React, { useState } from 'react';
import { StyleSheet, View, StyleProp } from 'react-native';
import { Image, ImageProps, ImageStyle } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { resolveProductImage, getProductImageUrl } from '@/lib/imageResolver';

export interface CachedImageProps extends Omit<ImageProps, 'source'> {
  source?: ImageProps['source'] | null;
  imageUrl?: string | null;
  placeholderIcon?: keyof typeof Ionicons.glyphMap;
  placeholderIconSize?: number;
  placeholderColor?: string;
  style?: StyleProp<ImageStyle>;
}

/**
 * High-performance cached image component powered by expo-image.
 * Uses persistent disk + memory caching (cachePolicy="memory-disk") so images
 * are stored on the local device filesystem and load instantly without network lag.
 */
export const CachedImage = React.memo(function CachedImage({
  source,
  imageUrl,
  placeholderIcon = 'water-outline',
  placeholderIconSize = 28,
  placeholderColor,
  style,
  contentFit = 'contain',
  cachePolicy = 'memory-disk',
  priority = 'high',
  transition = 150,
  onError,
  ...rest
}: CachedImageProps) {
  const { colors } = useTheme();
  const [hasError, setHasError] = useState(false);

  // Determine final image source
  let resolvedSource: ImageProps['source'] | null = null;
  if (source) {
    resolvedSource = source;
  } else if (imageUrl) {
    resolvedSource = resolveProductImage(imageUrl);
  }

  if (!resolvedSource || hasError) {
    return (
      <View style={[styles.placeholderBox, style]}>
        <Ionicons
          name={placeholderIcon}
          size={placeholderIconSize}
          color={placeholderColor || colors.textMuted}
        />
      </View>
    );
  }

  return (
    <Image
      source={resolvedSource}
      style={style}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      priority={priority}
      transition={transition}
      onError={(event) => {
        setHasError(true);
        if (onError) onError(event);
      }}
      {...rest}
    />
  );
});

/**
 * Pre-fetches a batch of product image URLs into device disk storage.
 * Runs in the background so all inventory/catalog images are downloaded locally.
 */
export async function prefetchProductImages(
  imageUrls: (string | null | undefined)[]
): Promise<boolean> {
  try {
    const urlsToPrefetch: string[] = [];

    for (const url of imageUrls) {
      const resolved = getProductImageUrl(url);
      if (resolved && (resolved.startsWith('http://') || resolved.startsWith('https://'))) {
        urlsToPrefetch.push(resolved);
      }
    }

    if (urlsToPrefetch.length === 0) return true;

    // Deduplicate
    const uniqueUrls = Array.from(new Set(urlsToPrefetch));
    return await Image.prefetch(uniqueUrls, 'memory-disk');
  } catch (error) {
    console.warn('[CachedImage] Error prefetching images:', error);
    return false;
  }
}

/**
 * Clears cached images from memory and device disk storage.
 */
export async function clearCachedImages(): Promise<void> {
  try {
    await Promise.allSettled([
      Image.clearMemoryCache(),
      Image.clearDiskCache(),
    ]);
  } catch (error) {
    console.warn('[CachedImage] Error clearing cache:', error);
  }
}

const styles = StyleSheet.create({
  placeholderBox: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
