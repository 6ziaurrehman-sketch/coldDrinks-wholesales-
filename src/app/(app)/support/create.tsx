import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '@/components/Screen';
import { AppText, Button, Card } from '@/components/ui';
import { useSupportStore } from '@/store/supportStore';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/hooks/useTheme';
import {
  checkIsOpenNow,
  validateAttachment,
} from '@/lib/supportService';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

export default function CreateSupportTicketScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ orderId?: string; orderNumber?: string }>();
  const activeShopId = useAuthStore((s) => s.activeShopId);

  const {
    contactInfo,
    draftTicket,
    createTicket,
    saveDraft,
  } = useSupportStore();

  const [subject, setSubject] = useState(
    draftTicket?.subject || (params.orderNumber ? `Inquiry regarding Order #${params.orderNumber}` : ''),
  );
  const [body, setBody] = useState(draftTicket?.body || '');
  const [attachments, setAttachments] = useState<string[]>(draftTicket?.attachments || []);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hoursStatus = useMemo(() => {
    return checkIsOpenNow(contactInfo.businessHours);
  }, [contactInfo.businessHours]);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const validation = validateAttachment({
          uri: asset.uri,
          size: asset.fileSize,
          type: asset.mimeType,
        });

        if (!validation.valid) {
          Alert.alert('Invalid Photo', validation.error || 'Please choose a valid photo under 5MB.');
          return;
        }

        setAttachments((prev) => [...prev, asset.uri]);
      }
    } catch {
      Alert.alert('Permission Error', 'Could not open photo library.');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!activeShopId) {
      setErrorMsg('No active shop found.');
      return;
    }

    if (subject.trim().length < 3) {
      setErrorMsg('Subject must be at least 3 characters.');
      return;
    }

    if (body.trim().length < 5) {
      setErrorMsg('Please explain your issue in more detail (at least 5 characters).');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    const idempotencyKey = `ticket_${activeShopId}_${Date.now()}`;

    try {
      const res = await createTicket(
        activeShopId,
        params.orderId || null,
        subject.trim(),
        body.trim(),
        attachments,
        idempotencyKey,
      );

      Alert.alert(
        'Ticket Created',
        'Your support ticket has been registered. Our wholesale desk will review it promptly.',
        [
          {
            text: 'View Ticket',
            onPress: () => router.replace(`/support/${res.ticketId}`),
          },
        ],
      );
    } catch (err: any) {
      // Save offline draft on failure
      saveDraft({
        shopId: activeShopId,
        orderId: params.orderId || null,
        orderNumber: params.orderNumber || null,
        subject: subject.trim(),
        body: body.trim(),
        attachments,
        isDraft: true,
        savedAt: new Date().toISOString(),
      });

      setErrorMsg(
        err.message || 'Network issue. Your ticket has been saved as a draft. You can submit when back online.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t('support.newTicket')} onBack={router.back}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Order Pre-fill Banner */}
        {params.orderNumber && (
          <Card style={[styles.orderBanner, { backgroundColor: theme.colors.primary + '12' }]}>
            <AppText variant="subtitle" color={theme.colors.primary}>
              📦 {t('support.helpWithOrder', { orderNumber: params.orderNumber })}
            </AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>
              This ticket is linked directly to your order for faster investigation.
            </AppText>
          </Card>
        )}

        {/* Business Hours Note */}
        <Card
          style={[
            styles.hoursNotice,
            {
              backgroundColor: hoursStatus.isOpen
                ? theme.colors.success + '10'
                : theme.colors.warning + '12',
            },
          ]}
        >
          <AppText
            variant="caption"
            color={hoursStatus.isOpen ? theme.colors.success : theme.colors.warning}
            style={{ fontWeight: '700' }}
          >
            {hoursStatus.isOpen ? '🟢 Support Desk is Online' : '🌙 Support Desk is Currently Closed'}
          </AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
            {t('support.outOfHoursNotice')}
          </AppText>
        </Card>

        {/* Form */}
        <Card style={styles.formCard}>
          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.inputLabel}>
              Subject
            </AppText>
            <TextInput
              style={[
                styles.textInput,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                  color: theme.colors.text,
                },
              ]}
              placeholder={t('support.subjectPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              value={subject}
              onChangeText={setSubject}
            />
          </View>

          <View style={styles.inputGroup}>
            <AppText variant="caption" style={styles.inputLabel}>
              Message
            </AppText>
            <TextInput
              style={[
                styles.textArea,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceMuted,
                  color: theme.colors.text,
                },
              ]}
              placeholder={t('support.bodyPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              value={body}
              onChangeText={setBody}
            />
          </View>

          {/* Photo Attachments */}
          <View style={styles.attachmentSection}>
            <View style={styles.attachmentHeader}>
              <AppText variant="caption" style={styles.inputLabel}>
                Photo Evidence (Optional, max 5MB)
              </AppText>
              <Button
                label={`📷 ${t('support.attachPhoto')}`}
                variant="ghost"
                onPress={handlePickImage}
              />
            </View>

            {attachments.length > 0 && (
              <View style={styles.previewRow}>
                {attachments.map((uri, idx) => (
                  <View key={idx} style={styles.thumbnailContainer}>
                    <Image source={{ uri }} style={styles.thumbnail} />
                    <Pressable
                      style={styles.removeBadge}
                      onPress={() => handleRemoveAttachment(idx)}
                    >
                      <AppText color="#FFFFFF" style={{ fontSize: 10, fontWeight: '700' }}>
                        ✕
                      </AppText>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {errorMsg && (
            <AppText variant="caption" color={theme.colors.error} style={{ marginTop: 4 }}>
              ⚠️ {errorMsg}
            </AppText>
          )}

          <View style={{ marginTop: spacing.sm }}>
            <Button
              label={submitting ? 'Submitting...' : t('support.submitTicket')}
              variant="primary"
              onPress={handleSubmit}
              disabled={submitting}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  orderBanner: {
    padding: spacing.md,
    gap: 4,
  },
  hoursNotice: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
  },
  formCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontWeight: '700',
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  textArea: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 14,
  },
  attachmentSection: {
    gap: spacing.xs,
  },
  attachmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  removeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
