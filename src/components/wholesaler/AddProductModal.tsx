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
import { WholesalerProductInput } from '@/types/wholesaler.types';
import { pickProductImage, takeProductPhoto, uploadProductImageToStorage } from '@/utils/productImageUpload';

interface AddProductModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: WholesalerProductInput) => Promise<any>;
}

export function AddProductModal({ visible, onClose, onSubmit }: AddProductModalProps) {
  const { colors, spacing } = useTheme();

  const [name, setName] = useState('');
  const [sizeLabel, setSizeLabel] = useState('1.5L');
  const [packagingType, setPackagingType] = useState('carton');
  const [pieces, setPieces] = useState('6');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [unitSalePrice, setUnitSalePrice] = useState('');
  const [barcode, setBarcode] = useState('');

  // Status & Image States
  const [status, setStatus] = useState<'active' | 'out_of_stock' | 'disabled'>('active');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePickFromGallery = async () => {
    try {
      const asset = await pickProductImage();
      if (asset) setSelectedImage(asset);
    } catch (err: any) {
      Alert.alert('Gallery Error', err?.message || 'Could not pick image from gallery.');
    }
  };

  const handleCaptureCamera = async () => {
    try {
      const asset = await takeProductPhoto();
      if (asset) setSelectedImage(asset);
    } catch (err: any) {
      Alert.alert('Camera Error', err?.message || 'Could not capture photo.');
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter a product name (e.g. Pepsi, Coke, Gourmet Cola).');
      return;
    }
    const cost = parseFloat(costPrice) || 0;
    const price = parseFloat(salePrice) || 0;
    if (price <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid wholesale selling price per carton/pack.');
      return;
    }
    const piecesVal = parseInt(pieces, 10) || 1;
    const uSale = unitSalePrice ? parseFloat(unitSalePrice) : Math.round((price / piecesVal) * 100) / 100;

    try {
      setLoading(true);

      // Upload image to Supabase storage if selected
      let uploadedImageUrl: string | undefined = undefined;
      if (selectedImage) {
        setIsUploadingImage(true);
        uploadedImageUrl = await uploadProductImageToStorage(selectedImage);
        setIsUploadingImage(false);
      }

      await onSubmit({
        name: name.trim(),
        size_label: sizeLabel.trim(),
        packaging_type: packagingType,
        pieces_per_carton: piecesVal,
        cost_price: cost,
        price,
        unit_sale_price: uSale,
        barcode: barcode.trim() || undefined,
        image_url: uploadedImageUrl,
        status,
        is_active: status !== 'disabled',
      });

      // Reset Form
      setName('');
      setCostPrice('');
      setSalePrice('');
      setUnitSalePrice('');
      setBarcode('');
      setStatus('active');
      setSelectedImage(null);
      onClose();
    } catch (err: any) {
      Alert.alert('Failed to Add Product', err?.message || 'Unknown error occurred.');
    } finally {
      setLoading(false);
      setIsUploadingImage(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View>
              <AppText variant="title">Add Wholesale Product</AppText>
              <AppText variant="caption" muted>Configure new drink & packaging</AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={26} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            {/* IMAGE SELECTOR SECTION */}
            <AppText variant="caption" muted style={styles.sectionLabel}>
              PRODUCT PHOTO
            </AppText>

            {selectedImage ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} />
                <View style={styles.imagePreviewInfo}>
                  <AppText style={styles.imageReadyText}>Image Ready to Upload</AppText>
                  <AppText variant="caption" muted>
                    Will be stored in catalog upon save
                  </AppText>
                  <View style={styles.imageButtonsRow}>
                    <Pressable style={styles.changeImageBtn} onPress={handlePickFromGallery}>
                      <Ionicons name="images-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                      <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                        Change
                      </AppText>
                    </Pressable>
                    <Pressable style={styles.removeImageBtn} onPress={() => setSelectedImage(null)}>
                      <Ionicons name="trash-outline" size={14} color="#dc2626" style={{ marginRight: 4 }} />
                      <AppText variant="caption" style={{ color: '#dc2626', fontWeight: '700' }}>
                        Remove
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.imagePickerCard}>
                <View style={styles.imagePickerLeft}>
                  <View style={styles.photoIconCircle}>
                    <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  </View>
                  <View>
                    <AppText style={styles.imagePickerTitle}>Attach Drink Photo</AppText>
                    <AppText variant="caption" muted>
                      Visible in retail catalog & customer orders
                    </AppText>
                  </View>
                </View>
                <View style={styles.imagePickerActions}>
                  <Pressable style={styles.pickerActionBtn} onPress={handlePickFromGallery}>
                    <Ionicons name="images-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                    <AppText style={[styles.pickerActionBtnText, { color: colors.primary }]}>Gallery</AppText>
                  </Pressable>
                  <Pressable style={styles.pickerActionBtn} onPress={handleCaptureCamera}>
                    <Ionicons name="camera-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                    <AppText style={[styles.pickerActionBtnText, { color: colors.primary }]}>Camera</AppText>
                  </Pressable>
                </View>
              </View>
            )}

            {/* PRODUCT STATUS SELECTOR */}
            <AppText variant="caption" muted style={[styles.sectionLabel, { marginTop: 12 }]}>
              PRODUCT STATUS (DEFAULT: ACTIVE)
            </AppText>
            <View style={styles.statusRow}>
              {[
                { key: 'active', label: 'Active', icon: 'checkmark-circle', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
                { key: 'out_of_stock', label: 'Out of Stock', icon: 'alert-circle', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                { key: 'disabled', label: 'Disabled', icon: 'eye-off', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
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

            <Input
              label="Product Name *"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Pepsi, 7Up, Gourmet Cola, Slice"
            />

            {/* Common Size Selector */}
            <AppText variant="caption" muted style={{ marginTop: 10 }}>Size / Variant</AppText>
            <View style={styles.chipsRow}>
              {['250ml', '300ml Can', '500ml', '1L', '1.5L', '2.5L'].map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSizeLabel(s)}
                  style={[
                    styles.chip,
                    sizeLabel === s ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border },
                  ]}
                >
                  <AppText variant="caption" color={sizeLabel === s ? 'onPrimary' : 'text'}>{s}</AppText>
                </Pressable>
              ))}
            </View>

            {/* Packaging Type */}
            <AppText variant="caption" muted style={{ marginTop: 10 }}>Packaging Type</AppText>
            <View style={styles.chipsRow}>
              {['carton', 'crate', 'pack', 'tray'].map((pkg) => (
                <Pressable
                  key={pkg}
                  onPress={() => setPackagingType(pkg)}
                  style={[
                    styles.chip,
                    packagingType === pkg ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border },
                  ]}
                >
                  <AppText variant="caption" color={packagingType === pkg ? 'onPrimary' : 'text'}>
                    {pkg.toUpperCase()}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Input
                  label="Bottles / Cans per Carton"
                  keyboardType="numeric"
                  value={pieces}
                  onChangeText={setPieces}
                  placeholder="e.g. 6, 12, 24"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Purchase Cost (Carton)"
                  keyboardType="numeric"
                  value={costPrice}
                  onChangeText={setCostPrice}
                  placeholder="Rs. 1000"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Input
                  label="Selling Price (Carton) *"
                  keyboardType="numeric"
                  value={salePrice}
                  onChangeText={setSalePrice}
                  placeholder="Rs. 1200"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Price per Bottle (Optional)"
                  keyboardType="numeric"
                  value={unitSalePrice}
                  onChangeText={setUnitSalePrice}
                  placeholder="Rs. 200"
                />
              </View>
            </View>

            <Input
              label="SKU / Barcode (Optional)"
              value={barcode}
              onChangeText={setBarcode}
              placeholder="e.g. 8964000123"
            />
          </ScrollView>

          <View style={styles.actions}>
            <Button
              label={
                isUploadingImage
                  ? 'Uploading Image...'
                  : loading
                  ? 'Saving Product...'
                  : 'Save Product'
              }
              variant="primary"
              onPress={handleSubmit}
              disabled={loading || isUploadingImage}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  formScroll: { maxHeight: 520 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  imagePreviewWrap: {
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
    width: 68,
    height: 68,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  imagePreviewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  imageReadyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  imageButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  changeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imagePickerCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
    marginBottom: 10,
  },
  imagePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  photoIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  imagePickerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  imagePickerActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  pickerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  pickerActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  statusPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1 },
  row: { flexDirection: 'row', marginTop: 10 },
  actions: { marginTop: 14, paddingTop: 6 },
});
