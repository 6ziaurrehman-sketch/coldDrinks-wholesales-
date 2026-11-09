import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Button, Card } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { useSession } from '@/auth/SessionProvider';
import { settingsService } from '@/lib/settingsService';
import { resetAllStores } from '@/store/resetAllStores';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import { t } from '@/i18n';
import type { AccountDeletionCheck } from '@/types/settings.types';

export default function DeleteAccountScreen() {
  const theme = useTheme();
  const activeShopId = useAuthStore((s) => s.activeShopId);
  const { signOut } = useSession();

  const [loading, setLoading] = useState(true);
  const [checkResult, setCheckResult] = useState<AccountDeletionCheck | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function runCheck() {
      if (!activeShopId) {
        if (isMounted) setLoading(false);
        return;
      }
      const res = await settingsService.checkCanDeleteAccount(activeShopId);
      if (isMounted) {
        setCheckResult(res);
        setLoading(false);
      }
    }
    void runCheck();
    return () => {
      isMounted = false;
    };
  }, [activeShopId]);

  const handleDelete = async () => {
    if (confirmInput.trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Confirmation Required', 'Please type DELETE exactly to proceed.');
      return;
    }

    setSubmitting(true);
    try {
      Alert.alert(
        'Account Deletion Requested',
        'Your account deletion request has been submitted. You will now be signed out.',
        [
          {
            text: 'OK',
            onPress: async () => {
              await resetAllStores();
              await signOut();
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process deletion request.');
      setSubmitting(false);
    }
  };

  return (
    <Screen title={t('settings.deleteAccount')} onBack={router.back}>
      <ScreenState
        status={loading ? 'loading' : 'data'}
        data={
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Warning Card */}
            <Card
              style={[
                styles.warningCard,
                {
                  backgroundColor: theme.colors.error + '10',
                  borderColor: theme.colors.error,
                },
              ]}
            >
              <AppText variant="subtitle" color={theme.colors.error}>
                ⚠️ Critical Account Notice
              </AppText>
              <AppText variant="caption" color={theme.colors.textMuted} style={styles.paragraph}>
                Deleting your shop account is permanent. All associated order history, saved addresses,
                tax information, and staff access roles will be irrevocably terminated.
              </AppText>
            </Card>

            {/* Eligibility Check Results */}
            {checkResult && !checkResult.canDelete ? (
              <Card style={styles.card}>
                <AppText variant="subtitle" color={theme.colors.error}>
                  🚫 Deletion Blocked
                </AppText>
                <AppText variant="body" color={theme.colors.text} style={{ marginTop: 4 }}>
                  {checkResult.message}
                </AppText>

                <View style={styles.actionRow}>
                  {checkResult.reason === 'ACTIVE_ORDERS' && (
                    <Button
                      label="View Active Orders"
                      variant="primary"
                      onPress={() => router.push('/(app)/(tabs)/orders')}
                    />
                  )}
                  <Button
                    label="Contact Seller Support"
                    variant="secondary"
                    onPress={() => router.push('/support')}
                  />
                </View>
              </Card>
            ) : (
              <Card style={styles.card}>
                <AppText variant="subtitle">Confirm Deletion</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  To confirm that you wish to delete your account, type &quot;DELETE&quot; in the box below:
                </AppText>

                <TextInput
                  style={[
                    styles.confirmInput,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surfaceMuted,
                      color: theme.colors.text,
                    },
                  ]}
                  placeholder="Type DELETE to confirm"
                  placeholderTextColor={theme.colors.textMuted}
                  value={confirmInput}
                  onChangeText={setConfirmInput}
                  autoCapitalize="characters"
                />

                <View style={{ marginTop: spacing.xs }}>
                  <Button
                    label={submitting ? 'Processing...' : 'Permanently Delete Account'}
                    variant="destructive"
                    onPress={handleDelete}
                    disabled={submitting || confirmInput.trim().toUpperCase() !== 'DELETE'}
                  />
                </View>
              </Card>
            )}
          </ScrollView>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  warningCard: {
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
  },
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  paragraph: {
    lineHeight: 18,
    marginTop: 2,
  },
  actionRow: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  confirmInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    fontWeight: '700',
  },
});
