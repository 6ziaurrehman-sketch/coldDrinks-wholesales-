import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';

export async function pickProductImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Gallery permission is required to select photos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return result.assets[0];
}

export async function takeProductPhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required to capture photos.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  return result.assets[0];
}

export async function uploadProductImageToStorage(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const rawExt = (asset.mimeType?.split('/')[1] || asset.uri.split('.').pop() || 'png').toLowerCase();
  const cleanExt = rawExt === 'jpg' ? 'jpeg' : rawExt === 'jpeg' ? 'jpeg' : rawExt === 'webp' ? 'webp' : 'png';
  const filename = `custom/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${cleanExt}`;

  let body: any;
  if (asset.base64) {
    body = decode(asset.base64);
  } else if (Platform.OS === 'web') {
    const res = await fetch(asset.uri);
    body = await res.blob();
  } else {
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: filename,
      type: `image/${cleanExt}`,
    } as any);
    body = formData;
  }

  const { data, error } = await supabase.storage
    .from('product-images')
    .upload(filename, body, {
      contentType: `image/${cleanExt}`,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || 'Failed to upload drink image.');
  }

  const { data: pubUrl } = supabase.storage.from('product-images').getPublicUrl(data.path);
  return pubUrl.publicUrl;
}
