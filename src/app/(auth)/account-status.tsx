import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { spacing } from '@/theme/tokens';

const SELLER_PHONE = '03001234567';
const SELLER_WHATSAPP = '923001234567';

export default function AccountStatusScreen() {
  const theme = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const accountStatus = useAuthStore((s) => s.accountStatus) || profile?.account_status || 'pending_approval';
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProfile();
      const currentStatus = useAuthStore.getState().accountStatus;
      if (currentStatus === 'active') {
        router.replace('/(app)/(tabs)');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCall = () => {
    Linking.openURL(`tel:${SELLER_PHONE}`).catch((err) => {
      console.warn('Could not open phone dialer:', err);
    });
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Hello, I am inquiring about my wholesale cold drinks account status (${profile?.phone || profile?.email || 'my shop'}).`,
    );
    Linking.openURL(`https://wa.me/${SELLER_WHATSAPP}?text=${text}`).catch((err) => {
      console.warn('Could not open WhatsApp:', err);
    });
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  // Tone and description mapping
  const statusConfig = {
    pending_approval: {
      badge: 'Pending Verification',
      tone: 'warning' as const,
      title: t('accountStatus.pendingTitle'),
      message: t('accountStatus.pendingMessage'),
    },
    suspended: {
      badge: 'Account Suspended',
      tone: 'error' as const,
      title: t('accountStatus.suspendedTitle'),
      message:
        profile?.status_reason ||
        t('accountStatus.suspendedMessage'),
    },
    deactivated: {
      badge: 'Account Deactivated',
      tone: 'neutral' as const,
      title: t('accountStatus.deactivatedTitle'),
      message:
        profile?.status_reason ||
        t('accountStatus.deactivatedMessage'),
    },
    active: {
      badge: 'Active',
      tone: 'success' as const,
      title: 'Account Active',
      message: 'Your account is active and verified.',
    },
  }[accountStatus];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Card style={styles.card}>
            <View style={styles.badgeWrap}>
              <Badge label={statusConfig.badge} tone={statusConfig.tone} />
            </View>

            <AppText variant="title" style={styles.title}>
              {statusConfig.title}
            </AppText>

            <AppText muted style={styles.message}>
              {statusConfig.message}
            </AppText>

            {accountStatus === 'pending_approval' ? (
              <Button
                label="Check Approval Status"
                variant="secondary"
                onPress={handleRefresh}
                loading={isRefreshing}
              />
            ) : null}

            <View style={styles.divider} />

            <AppText variant="subtitle" style={styles.contactTitle}>
              {t('accountStatus.contactSeller')}
            </AppText>

            <View style={styles.actionButtons}>
              <Button
                label={t('accountStatus.whatsappSeller')}
                variant="primary"
                onPress={handleWhatsApp}
              />
              <Button
                label={t('accountStatus.callSeller')}
                variant="secondary"
                onPress={handleCall}
              />
            </View>

            <View style={styles.signOutWrap}>
              <Button
                label={t('accountStatus.switchAccount')}
                variant="ghost"
                onPress={handleSignOut}
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  card: {
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  badgeWrap: {
    marginBottom: spacing.xs,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: '#E2E8ED',
    marginVertical: spacing.xs,
  },
  contactTitle: {
    textAlign: 'center',
    fontSize: 16,
  },
  actionButtons: {
    width: '100%',
    gap: spacing.sm,
  },
  signOutWrap: {
    width: '100%',
    marginTop: spacing.xs,
  },
});
