import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { radius, spacing } from '@/theme/tokens';

export default function DeleteAccountScreen() {
  const theme = useTheme();
  const requestAccountDeletion = useAuthStore((s) => s.requestAccountDeletion);

  const [reason, setReason] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isConfirmed = confirmInput.trim().toUpperCase() === t('deleteAccount.confirmWord');

  const handleSubmit = async () => {
    if (!isConfirmed) {
      setError(`Please type ${t('deleteAccount.confirmWord')} to confirm.`);
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      await requestAccountDeletion(reason.trim());
      router.replace('/(auth)/account-status');
    } catch (err: any) {
      setError(err.message || 'Unable to submit deletion request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Account"
              onPress={() => router.back()}
              style={styles.backButton}>
              <AppText variant="caption" color={theme.colors.primary}>
                ← Cancel & Return
              </AppText>
            </Pressable>

            <View style={styles.header}>
              <AppText variant="title" color={theme.colors.destructive}>
                {t('deleteAccount.title')}
              </AppText>
              <AppText muted>Permanent account deactivation</AppText>
            </View>

            <View style={[styles.warningBox, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.warning }]}>
              <AppText variant="caption" color={theme.colors.text}>
                {t('deleteAccount.warning')}
              </AppText>
            </View>

            {error ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[styles.errorBox, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.error }]}>
                <AppText variant="caption" color={theme.colors.error}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <Card style={styles.card}>
              <Input
                label={t('deleteAccount.reasonLabel')}
                placeholder={t('deleteAccount.reasonPlaceholder')}
                value={reason}
                onChangeText={setReason}
              />

              <Input
                label={t('deleteAccount.confirmPrompt')}
                placeholder={`Type "${t('deleteAccount.confirmWord')}"`}
                value={confirmInput}
                onChangeText={(val) => {
                  setConfirmInput(val);
                  setError(undefined);
                }}
                autoCapitalize="characters"
              />

              <Button
                label={t('deleteAccount.submit')}
                variant="destructive"
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={!isConfirmed || isSubmitting}
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
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
    gap: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
  },
  header: {
    gap: spacing.xs,
  },
  warningBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
