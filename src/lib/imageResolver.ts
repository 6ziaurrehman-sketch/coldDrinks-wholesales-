import { Platform, ImageSourcePropType } from 'react-native';

/**
 * Normalizes product image paths cross-platform to an absolute URL string.
 */
export function getProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  // On Web, relative paths like /images/... are served by Expo from the public directory
  if (Platform.OS === 'web') {
    return imageUrl;
  }

  // If already an absolute http/https/file URI, use directly
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('file://')) {
    return imageUrl;
  }

  // If relative path starting with /images/, map to Supabase storage CDN
  if (imageUrl.startsWith('/images/')) {
    const storagePath = imageUrl.slice(7); // remove '/images'
    return `https://qtzkuonkcfgdhxuvazha.supabase.co/storage/v1/object/public/product-images${storagePath}`;
  }

  return imageUrl;
}

/**
 * Resolves product image paths cross-platform for React Native and expo-image.
 * Supports static assets on mobile/web and web relative /images/ URLs.
 */
export function resolveProductImage(imageUrl: string | null | undefined): ImageSourcePropType | null {
  const url = getProductImageUrl(imageUrl);
  if (!url) return null;
  return { uri: url };
}
