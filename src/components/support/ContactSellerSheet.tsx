import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Card, Badge } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { useSupportStore } from '@/store/supportStore';
import {
  checkIsOpenNow,
  initiatePhoneCall,
  initiateWhatsApp,
} from '@/lib/supportService';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';

interface ContactSellerSheetProps {
  visible: boolean;
  onClose: () => void;
  prefillOrderId?: string;
  prefillOrderNumber?: string;
}

export function ContactSellerSheet({
  visible,
  onClose,
  prefillOrderId,
  prefillOrderNumber,
}: ContactSellerSheetProps) {
  const theme = useTheme();
  const contactInfo = useSupportStore((s) => s.contactInfo);

  const hoursStatus = useMemo(() => {
    return checkIsOpenNow(contactInfo.businessHours);
  }, [contactInfo.businessHours]);

  const handleCall = async () => {
    const res = await initiatePhoneCall(contactInfo.phone);
    if (!res.success && res.copied) {
      Alert.alert(
        'Phone Number Copied',
        `Could not open phone dialer automatically. The phone number (${contactInfo.phone}) has been copied to your clipboard.`,
        [{ text: 'OK' }],
      );
    }
    onClose();
  };

  const handleWhatsApp = async () => {
    const prefillText = prefillOrderNumber
      ? `Assalam-o-Alaikum, I need help with Order #${prefillOrderNumber}.`
      : 'Assalam-o-Alaikum, I have an inquiry regarding my wholesale order.';
    await initiateWhatsApp(contactInfo.whatsapp, prefillText);
    onClose();
  };

  const handleCreateTicket = () => {
    onClose();
    if (prefillOrderId) {
      router.push({
        pathname: '/support/create',
        params: { orderId: prefillOrderId, orderNumber: prefillOrderNumber },
      });
    } else {
      router.push('/support/create');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle indicator */}
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />

          <View style={styles.header}>
            <AppText variant="title">{t('support.contactSeller')}</AppText>
            <Badge
              label={hoursStatus.isOpen ? 'Open Now' : 'Closed'}
              tone={hoursStatus.isOpen ? 'success' : 'warning'}
            />
          </View>

          {/* Business Hours & Response Time Notice */}
          <Card
            style={[
              styles.noticeCard,
              {
                backgroundColor: hoursStatus.isOpen
                  ? theme.colors.success + '10'
                  : theme.colors.warning + '12',
                borderColor: hoursStatus.isOpen
                  ? theme.colors.success + '40'
                  : theme.colors.warning + '40',
              },
            ]}
          >
            <AppText
              variant="caption"
              color={hoursStatus.isOpen ? theme.colors.success : theme.colors.warning}
              style={{ fontWeight: '700' }}
            >
              🕒 {hoursStatus.statusText}
            </AppText>
            {!hoursStatus.isOpen && (
              <AppText
                variant="caption"
                color={theme.colors.textMuted}
                style={{ marginTop: 2 }}
              >
                {hoursStatus.nextOpenNotice}. Response time: {hoursStatus.expectedResponseTime}.
              </AppText>
            )}
          </Card>

          {prefillOrderNumber && (
            <View style={[styles.orderContext, { backgroundColor: theme.colors.surfaceMuted }]}>
              <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '600' }}>
                📦 Connected to Order #{prefillOrderNumber}
              </AppText>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              label={`📞 ${t('support.callSeller')} (${contactInfo.phone})`}
              variant="primary"
              onPress={handleCall}
            />

            <Button
              label={`💬 ${t('support.whatsapp')}`}
              variant="secondary"
              onPress={handleWhatsApp}
            />

            <Button
              label={`🎫 ${t('support.newTicket')}`}
              variant="ghost"
              onPress={handleCreateTicket}
            />

            <View style={{ marginTop: 4 }}>
              <Button
                label={t('common.cancel')}
                variant="ghost"
                onPress={onClose}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noticeCard: {
    padding: spacing.sm,
    borderWidth: 1,
    borderRadius: spacing.xs,
  },
  orderContext: {
    padding: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
