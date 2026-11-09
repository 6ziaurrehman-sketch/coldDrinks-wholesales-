import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Pressable,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import NetInfo from '@react-native-community/netinfo';
import { Screen } from '@/components/Screen';
import { AppText, Button, Card } from '@/components/ui';
import { usePaymentStore } from '@/store/paymentStore';
import { useCreditStore } from '@/store/creditStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

const POPULAR_BANKS = ['Meezan Bank', 'HBL', 'MCB', 'UBL', 'Allied Bank', 'JazzCash', 'EasyPaisa'];

export default function UploadPaymentProofScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    orderId?: string;
    orderNumber?: string;
    amount?: string;
    resubmissionOf?: string;
  }>();

  const activeShopId = useAuthStore((s) => s.activeShopId);
  const { uploadState, submitProof, cancelUpload } = usePaymentStore();
  const creditSummary = useCreditStore((s) => s.summary);

  const [amount, setAmount] = useState(params.amount || '');
  const [bank, setBank] = useState('Meezan Bank');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [file, setFile] = useState<{ uri: string; size?: number; type?: string; name?: string } | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [successSubmitted, setSuccessSubmitted] = useState(false);

  // Monitor online status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // 1. Pick from Camera
  const handleLaunchCamera = async () => {
    setPickerModalVisible(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera access is needed to capture payment receipts. Please enable camera access in system settings.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        processSelectedAsset(result.assets[0]);
      }
    } catch {
      Alert.alert('Camera Error', 'Could not open camera.');
    }
  };

  // 2. Pick from Photo Gallery
  const handleLaunchGallery = async () => {
    setPickerModalVisible(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Gallery access is needed to select payment receipts. Please enable photo access in system settings.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        processSelectedAsset(result.assets[0]);
      }
    } catch {
      Alert.alert('Gallery Error', 'Could not open photo gallery.');
    }
  };

  // 3. Pick Document / PDF / File
  const handleLaunchDocumentPicker = async () => {
    setPickerModalVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const MAX_SIZE = 5 * 1024 * 1024;
        if (asset.size && asset.size > MAX_SIZE) {
          const mb = (asset.size / (1024 * 1024)).toFixed(1);
          Alert.alert('File Too Large', `Selected file is ${mb} MB. Maximum allowed size is 5 MB.`);
          return;
        }

        setFile({
          uri: asset.uri,
          size: asset.size,
          type: asset.mimeType || 'application/pdf',
          name: asset.name,
        });
        setRotation(0);
      }
    } catch {
      Alert.alert('Document Error', 'Could not open document picker.');
    }
  };

  const processSelectedAsset = (asset: ImagePicker.ImagePickerAsset) => {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (asset.fileSize && asset.fileSize > MAX_SIZE) {
      const mb = (asset.fileSize / (1024 * 1024)).toFixed(1);
      Alert.alert('File Too Large', `Selected photo is ${mb} MB. Maximum allowed size is 5 MB.`);
      return;
    }

    setFile({
      uri: asset.uri,
      size: asset.fileSize,
      type: asset.mimeType || 'image/jpeg',
      name: asset.fileName || 'receipt.jpg',
    });
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const executeSubmission = async (numericAmount: number) => {
    if (!activeShopId || !file) return;

    setErrorMsg(null);
    try {
      const res = await submitProof(
        activeShopId,
        params.orderId || null,
        file,
        bank.trim(),
        referenceNumber.trim(),
        numericAmount,
        params.resubmissionOf || null,
      );

      if (res.errorCode === 'DUPLICATE_REFERENCE') {
        Alert.alert(
          t('payments.duplicateWarning'),
          res.message || 'This reference number has already been submitted for your shop.',
          [{ text: 'OK' }],
        );
        return;
      }

      setSuccessSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit payment proof.');
    }
  };

  const handleSubmit = () => {
    if (isOffline) {
      Alert.alert('Offline Mode', t('payments.offlineUploadBlocked'));
      return;
    }

    if (!activeShopId) {
      setErrorMsg('No active shop detected.');
      return;
    }

    const numericAmount = Number(amount.replace(/,/g, ''));
    if (!numericAmount || numericAmount <= 0) {
      setErrorMsg('Please enter a valid payment amount.');
      return;
    }

    if (!bank.trim()) {
      setErrorMsg('Please enter or select a bank.');
      return;
    }

    if (!referenceNumber.trim()) {
      setErrorMsg('Transaction ID / Reference number is required.');
      return;
    }

    if (!file) {
      setErrorMsg('Please attach a photo or document of your payment slip.');
      return;
    }

    // Check if amount is greater than outstanding balance
    const outstanding = creditSummary ? creditSummary.outstanding : 0;
    if (outstanding > 0 && numericAmount > outstanding) {
      const excess = numericAmount - outstanding;
      Alert.alert(
        t('payments.advanceConfirmTitle'),
        `The amount (${formatMoney(numericAmount)}) exceeds your current outstanding balance (${formatMoney(outstanding)}). The excess of ${formatMoney(excess)} will be kept as account credit for future orders. Do you wish to continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm & Submit',
            onPress: () => void executeSubmission(numericAmount),
          },
        ],
      );
      return;
    }

    void executeSubmission(numericAmount);
  };

  const isUploading = uploadState.status === 'uploading' || uploadState.status === 'verifying';
  const uploadPercent = Math.round((uploadState.progress || 0) * 100);

  // Success State
  if (successSubmitted) {
    return (
      <Screen title={t('payments.uploadProof')} onBack={router.back}>
        <View style={styles.successContainer}>
          <Card style={styles.successCard}>
            <View style={[styles.successIconBadge, { backgroundColor: theme.colors.success + '20' }]}>
              <AppText variant="title" style={{ fontSize: 36 }}>✅</AppText>
            </View>
            <AppText variant="title" style={{ textAlign: 'center', marginTop: spacing.md, fontWeight: '800' }}>
              Proof Received!
            </AppText>
            <AppText
              variant="body"
              color={theme.colors.textMuted}
              style={{ textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 }}
            >
              {t('payments.sellerVerifySoon')}
            </AppText>

            <View style={{ marginTop: spacing.xl, gap: spacing.sm, width: '100%' }}>
              <Button
                label="View Payments"
                variant="primary"
                onPress={() => router.replace('/payments')}
              />
              <Button
                label="Return to Dashboard"
                variant="secondary"
                onPress={() => router.replace('/(app)/(tabs)/account')}
              />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={t('payments.uploadProof')} onBack={router.back}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Offline Notice */}
          {isOffline && (
            <Card style={[styles.offlineBanner, { backgroundColor: theme.colors.warning + '18' }]}>
              <AppText variant="body" color={theme.colors.warning} style={{ fontWeight: '600' }}>
                📡 Offline: Draft preserved. Connect to upload.
              </AppText>
            </Card>
          )}

          {/* Linked Order Banner */}
          {params.orderNumber && (
            <Card style={[styles.orderBanner, { backgroundColor: theme.colors.primary + '12' }]}>
              <AppText variant="subtitle" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                📦 Linked to Order #{params.orderNumber}
              </AppText>
              {params.amount && (
                <AppText variant="caption" color={theme.colors.textMuted}>
                  Order Total: {formatMoney(Number(params.amount))}
                </AppText>
              )}
            </Card>
          )}

          <Card style={styles.formCard}>
            {/* Amount Input */}
            <View style={styles.inputGroup}>
              <AppText variant="caption" style={styles.label}>
                {t('payments.amount')}
              </AppText>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
                keyboardType="numeric"
                placeholder="e.g. 45000"
                placeholderTextColor={theme.colors.textMuted}
                value={amount}
                onChangeText={setAmount}
                accessibilityLabel="Payment amount in Pakistani Rupees"
              />
            </View>

            {/* Bank Selection */}
            <View style={styles.inputGroup}>
              <AppText variant="caption" style={styles.label}>
                {t('payments.bank')}
              </AppText>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="Select or enter bank name"
                placeholderTextColor={theme.colors.textMuted}
                value={bank}
                onChangeText={setBank}
                accessibilityLabel="Bank name"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankChips}>
                {POPULAR_BANKS.map((b) => (
                  <Pressable
                    key={b}
                    onPress={() => setBank(b)}
                    style={[
                      styles.bankChip,
                      {
                        backgroundColor: bank === b ? theme.colors.primary : theme.colors.surfaceMuted,
                        borderColor: bank === b ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={bank === b ? '#FFF' : theme.colors.text}
                      style={{ fontWeight: bank === b ? '700' : '500' }}
                    >
                      {b}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Reference Number */}
            <View style={styles.inputGroup}>
              <AppText variant="caption" style={styles.label}>
                {t('payments.reference')}
              </AppText>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceMuted,
                    color: theme.colors.text,
                  },
                ]}
                placeholder="e.g. 20261010-0988-MEEZAN"
                placeholderTextColor={theme.colors.textMuted}
                value={referenceNumber}
                onChangeText={setReferenceNumber}
                autoCapitalize="characters"
                accessibilityLabel="Bank transfer reference number or transaction ID"
              />
            </View>

            {/* Attachment Source Picker & Preview */}
            <View style={styles.inputGroup}>
              <AppText variant="caption" style={styles.label}>
                {t('payments.attachReceipt')}
              </AppText>

              {file ? (
                <View style={styles.filePreviewWrapper}>
                  {file.type?.includes('pdf') ? (
                    <View style={[styles.pdfCard, { borderColor: theme.colors.border }]}>
                      <AppText variant="subtitle">📄 {file.name || 'Document.pdf'}</AppText>
                      {file.size && (
                        <AppText variant="caption" color={theme.colors.textMuted}>
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </AppText>
                      )}
                    </View>
                  ) : (
                    <View style={styles.imagePreviewContainer}>
                      <Image
                        source={{ uri: file.uri }}
                        style={[
                          styles.imagePreview,
                          { transform: [{ rotate: `${rotation}deg` }] },
                        ]}
                        resizeMode="contain"
                      />
                      <Pressable
                        onPress={handleRotate}
                        style={[styles.rotateButton, { backgroundColor: theme.colors.surface }]}
                        accessibilityLabel="Rotate receipt image 90 degrees"
                      >
                        <AppText variant="caption" style={{ fontWeight: '700' }}>
                          🔄 {t('payments.rotate')}
                        </AppText>
                      </Pressable>
                    </View>
                  )}

                  <View style={styles.previewActions}>
                    <Button
                      label="Change Slip"
                      variant="ghost"
                      onPress={() => setPickerModalVisible(true)}
                    />
                    <Button
                      label="Remove"
                      variant="ghost"
                      onPress={() => setFile(null)}
                    />
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setPickerModalVisible(true)}
                  style={[
                    styles.uploadDropzone,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Attach transfer slip or receipt"
                >
                  <AppText variant="title" style={{ fontSize: 28 }}>📸</AppText>
                  <AppText variant="body" style={{ fontWeight: '600', marginTop: spacing.xs }}>
                    Tap to Choose Source
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    Camera, Photo Gallery, or PDF (Max 5 MB)
                  </AppText>
                </Pressable>
              )}
            </View>

            {/* Error Message */}
            {errorMsg && (
              <AppText variant="caption" color={theme.colors.error} style={{ marginTop: spacing.xs }}>
                {errorMsg}
              </AppText>
            )}

            {/* Upload Progress Bar with Cancel */}
            {isUploading && (
              <View
                style={styles.progressContainer}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: uploadPercent }}
                accessibilityLabel={`Uploading proof: ${uploadPercent} percent`}
              >
                <View style={styles.progressHeader}>
                  <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
                    Uploading Slip... {uploadPercent}%
                  </AppText>
                  <Pressable onPress={cancelUpload} accessibilityLabel="Cancel proof upload">
                    <AppText variant="caption" color={theme.colors.error} style={{ fontWeight: '700' }}>
                      {t('payments.cancelUpload')}
                    </AppText>
                  </Pressable>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${Math.max(5, uploadPercent)}%`,
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Submit Button */}
            <View style={{ marginTop: spacing.md }}>
              <Button
                label={isUploading ? 'Submitting...' : t('payments.submitProof')}
                variant="primary"
                onPress={handleSubmit}
                disabled={isUploading}
              />
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pick Source Modal */}
      <Modal
        visible={pickerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPickerModalVisible(false)}
        >
          <Card style={styles.modalContent}>
            <AppText variant="subtitle" style={{ fontWeight: '800', marginBottom: spacing.sm }}>
              Attach Payment Receipt
            </AppText>
            <View style={styles.modalButtons}>
              <Button
                label={`📷  ${t('payments.sourceCamera')}`}
                variant="secondary"
                onPress={handleLaunchCamera}
              />
              <Button
                label={`🖼️  ${t('payments.sourceGallery')}`}
                variant="secondary"
                onPress={handleLaunchGallery}
              />
              <Button
                label={`📄  ${t('payments.sourceFile')}`}
                variant="secondary"
                onPress={handleLaunchDocumentPicker}
              />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setPickerModalVisible(false)}
              />
            </View>
          </Card>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  offlineBanner: {
    padding: spacing.sm,
    alignItems: 'center',
  },
  orderBanner: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  formCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  label: {
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  bankChips: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  bankChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: spacing.xs,
  },
  uploadDropzone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filePreviewWrapper: {
    gap: spacing.xs,
  },
  imagePreviewContainer: {
    position: 'relative',
    height: 220,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0000000D',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  rotateButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pdfCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  progressContainer: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successCard: {
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  successIconBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  modalContent: {
    padding: spacing.lg,
    borderRadius: 16,
  },
  modalButtons: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
