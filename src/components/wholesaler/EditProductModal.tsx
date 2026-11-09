import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type * as ImagePicker from 'expo-image-picker';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/useTheme';
import { InventoryItem } from '@/types/wholesaler.types';
import { getDisplayName } from '@/utils/productUtils';
import { pickProductImage, takeProductPhoto, uploadProductImageToStorage } from '@/utils/productImageUpload';

interface EditProductModalProps {
  visible: boolean;
  item: InventoryItem | null;
  onClose: () => void;
  onSubmit: (params: {
    productId: string;
    variantId: string;
    name?: string;
    sizeLabel?: string;
    packagingType?: string;
    piecesPerCarton?: number;
    pricePerCarton?: number;
    costPrice?: number;
    unitSalePrice?: number;
    lowStockThreshold?: number;
    isActive?: boolean;
    status?: 'active' | 'out_of_stock' | 'disabled';
    imageUrl?: string;
  }) => Promise<void>;
}

function EditProductForm({
  item,
  onClose,
  onSubmit,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSubmit: EditProductModalProps['onSubmit'];
}) {
  const { colors, spacing } = useTheme();

  const [name, setName] = useState(item.product_name);
  const [sizeLabel, setSizeLabel] = useState(item.size_label);
  const [packagingType, setPackagingType] = useState(item.packaging_type || 'carton');
  const [pieces, setPieces] = useState(String(item.pieces_per_carton || 6));
  const [costPrice, setCostPrice] = useState(item.cost_per_carton ? String(item.cost_per_carton) : '');
  const [salePrice, setSalePrice] = useState(String(item.price_per_carton || ''));
  const [unitSalePrice, setUnitSalePrice] = useState(item.price_per_unit ? String(item.price_per_unit) : '');
  const [lowStockThreshold, setLowStockThreshold] = useState(String(item.low_stock_threshold || 24));

  // Status & Photo States
  const initialStatus = item.is_active === false ? 'disabled' : item.is_out_of_stock ? 'out_of_stock' : 'active';
  const [status, setStatus] = useState<'active' | 'out_of_stock' | 'disabled'>(initialStatus);
  const currentImageUrl = item.image_url;
  const [newImageAsset, setNewImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePickFromGallery = async () => {
    try {
      const asset = await pickProductImage();
      if (asset) setNewImageAsset(asset);
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Could not pick image.');
    }
  };

  const handleCaptureCamera = async () => {
    try {
      const asset = await takeProductPhoto();
      if (asset) setNewImageAsset(asset);
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Could not capture photo.');
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Product name cannot be empty.');
      return;
    }

    const price = parseFloat(salePrice);
    if (!price || price <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid wholesale selling price per carton.');
      return;
    }

    const cost = parseFloat(costPrice) || 0;
    const piecesVal = parseInt(pieces, 10) || 1;
    const uSale = unitSalePrice ? parseFloat(unitSalePrice) : Math.round((price / piecesVal) * 100) / 100;
    const thresh = parseInt(lowStockThreshold, 10) || 24;

    try {
      setLoading(true);

      let finalImageUrl = currentImageUrl || undefined;
      if (newImageAsset) {
        setIsUploadingImage(true);
        finalImageUrl = await uploadProductImageToStorage(newImageAsset);
        setIsUploadingImage(false);
      }

      await onSubmit({
        productId: item.product_id,
        variantId: item.variant_id,
        name: name.trim(),
        sizeLabel: sizeLabel.trim(),
        packagingType,
        piecesPerCarton: piecesVal,
        pricePerCarton: price,
        costPrice: cost,
        unitSalePrice: uSale,
        lowStockThreshold: thresh,
        status,
        isActive: status !== 'disabled',
        imageUrl: finalImageUrl,
      });

      Alert.alert('Product Updated', `${name} details have been saved.`);
      onClose();
    } catch (err: any) {
      Alert.alert('Failed to Update Product', err?.message || 'Unknown error');
    } finally {
      setLoading(false);
      setIsUploadingImage(false);
    }
  };

  const displayImageUri = newImageAsset ? newImageAsset.uri : currentImageUrl;

  return (
    <View style={styles.overlay}>
      <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <AppText variant="title">Edit Product Details</AppText>
            <AppText variant="caption" muted>
              {getDisplayName(item.product_name, item.size_label)}
            </AppText>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close-circle" size={26} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: spacing.lg }}>
          {/* PHOTO SECTION */}
          <AppText variant="caption" muted style={styles.sectionLabel}>
            PRODUCT IMAGE
          </AppText>
          <View style={styles.photoContainer}>
            {displayImageUri ? (
              <Image source={{ uri: displayImageUri }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <View style={styles.noPhotoBox}>
                <Ionicons name="water-outline" size={28} color="#94a3b8" />
              </View>
            )}
            <View style={styles.photoActionsCol}>
              <AppText style={styles.photoHeading}>
                {newImageAsset ? 'New Photo Selected' : currentImageUrl ? 'Current Photo' : 'No Photo Attached'}
              </AppText>
              <View style={styles.photoBtnRow}>
                <Pressable style={styles.photoBtn} onPress={handlePickFromGallery}>
                  <Ionicons name="images-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                  <AppText style={[styles.photoBtnText, { color: colors.primary }]}>Gallery</AppText>
                </Pressable>
                <Pressable style={styles.photoBtn} onPress={handleCaptureCamera}>
                  <Ionicons name="camera-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                  <AppText style={[styles.photoBtnText, { color: colors.primary }]}>Camera</AppText>
                </Pressable>
                {newImageAsset && (
                  <Pressable style={styles.photoBtn} onPress={() => setNewImageAsset(null)}>
                    <Ionicons name="close-circle" size={14} color="#dc2626" style={{ marginRight: 4 }} />
                    <AppText style={[styles.photoBtnText, { color: '#dc2626' }]}>Revert</AppText>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          {/* PRODUCT STATUS SELECTOR */}
          <AppText variant="caption" muted style={[styles.sectionLabel, { marginTop: 12 }]}>
            PRODUCT AVAILABILITY STATUS
          </AppText>
          <View style={styles.statusRow}>
            {[
              { key: 'active', label: 'Active', icon: 'checkmark-circle', color: '#059669', bg: '#ecfdf5' },
              { key: 'out_of_stock', label: 'Out of Stock', icon: 'alert-circle', color: '#dc2626', bg: '#fef2f2' },
              { key: 'disabled', label: 'Disabled', icon: 'eye-off', color: '#64748b', bg: '#f1f5f9' },
            ].map((st) => {
              const isSelected = status === st.key;
              return (
                <Pressable
                  key={st.key}
                  onPress={() => setStatus(st.key as any)}
                  style={[
                    styles.statusPill,
                    isSelected
                      ? { backgroundColor: st.bg, borderColor: st.color, borderWidth: 1.5 }
                      : { borderColor: colors.border },
                  ]}
                >
                  <Ionicons
                    name={st.icon as any}
                    size={14}
                    color={isSelected ? st.color : '#94a3b8'}
                    style={{ marginRight: 4 }}
                  />
                  <AppText
                    style={[
                      styles.statusPillText,
                      { color: isSelected ? st.color : colors.text },
                    ]}
                  >
                    {st.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 8 }}>
            <Input
              label="Product / Drink Name *"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Pepsi, Gourmet Cola"
            />
          </View>

          {/* Packaging and Size */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Input
                label="Size Label *"
                value={sizeLabel}
                onChangeText={setSizeLabel}
                placeholder="e.g. 1.5L, 500ml"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Bottles / Carton *"
                keyboardType="numeric"
                value={pieces}
                onChangeText={setPieces}
                placeholder="e.g. 6"
              />
            </View>
          </View>

          {/* Packaging Chips */}
          <AppText variant="caption" muted style={{ marginTop: 8 }}>
            Packaging Type
          </AppText>
          <View style={styles.chipsRow}>
            {['carton', 'pack', 'crate', 'box'].map((pkg) => {
              const isSel = packagingType === pkg;
              return (
                <Pressable
                  key={pkg}
                  onPress={() => setPackagingType(pkg)}
                  style={[
                    styles.chip,
                    isSel && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={isSel ? 'onPrimary' : 'text'}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {pkg}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Pricing Section */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Input
                label="Cost Price / Carton"
                keyboardType="numeric"
                value={costPrice}
                onChangeText={setCostPrice}
                placeholder="Rs. 1000"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Selling Price / Carton *"
                keyboardType="numeric"
                value={salePrice}
                onChangeText={setSalePrice}
                placeholder="Rs. 1200"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <Input
                label="Individual Bottle Price"
                keyboardType="numeric"
                value={unitSalePrice}
                onChangeText={setUnitSalePrice}
                placeholder="Auto (Price ÷ Bottles)"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Low Stock Warning (Units)"
                keyboardType="numeric"
                value={lowStockThreshold}
                onChangeText={setLowStockThreshold}
                placeholder="e.g. 24"
              />
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            label={
              isUploadingImage
                ? 'Uploading Image...'
                : loading
                ? 'Saving Changes...'
                : 'Save Changes'
            }
            variant="primary"
            onPress={handleSubmit}
            disabled={loading || isUploadingImage}
          />
        </View>
      </View>
    </View>
  );
}

export function EditProductModal({
  visible,
  item,
  onClose,
  onSubmit,
}: EditProductModalProps) {
  if (!visible || !item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <EditProductForm key={item.variant_id} item={item} onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  formScroll: {
    maxHeight: 520,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  photoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  noPhotoBox: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photoActionsCol: {
    flex: 1,
    marginLeft: 12,
  },
  photoHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  photoBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  photoBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  statusPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    marginTop: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actions: {
    marginTop: 12,
    paddingTop: 8,
  },
});
