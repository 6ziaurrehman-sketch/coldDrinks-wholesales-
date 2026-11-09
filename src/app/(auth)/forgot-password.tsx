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

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes('@')) {
      setEmailError('Please enter a valid registered email address.');
      return;
    }

    setIsSubmitting(true);
    setGeneralError(undefined);

    try {
      await requestPasswordReset(email);
      setIsSuccess(true);
    } catch (err: any) {
      setGeneralError(err.message || 'Unable to send reset instructions. Please try again.');
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
            <View style={styles.header}>
              <AppText variant="title">{t('auth.resetPasswordTitle')}</AppText>
              <AppText muted>{t('auth.resetPasswordSubtitle')}</AppText>
            </View>

            {generalError ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[styles.errorBanner, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.error }]}>
                <AppText variant="caption" color={theme.colors.error}>
                  {generalError}
                </AppText>
              </View>
            ) : null}

            <Card style={styles.card}>
              {isSuccess ? (
                <View style={styles.successBox}>
                  <AppText variant="subtitle" color={theme.colors.primary}>
                    Instructions Sent
                  </AppText>
                  <AppText muted>
                    We have dispatched password reset instructions to {email}. Please check your inbox and click the link to reset your password.
                  </AppText>
                  <Button
                    label={t('auth.backToLogin')}
                    variant="primary"
                    onPress={() => router.replace('/(auth)/login')}
                  />
                </View>
              ) : (
                <>
                  <Input
                    label={t('auth.email')}
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChangeText={(val) => {
                      setEmail(val);
                      setEmailError(undefined);
                      setGeneralError(undefined);
                    }}
                    error={emailError}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <Button
                    label={t('auth.sendResetLink')}
                    variant="primary"
                    onPress={handleSubmit}
                    loading={isSubmitting}
                    disabled={isSubmitting}
                  />
                </>
              )}
            </Card>

            {!isSuccess && (
              <View style={styles.footer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.backToLogin')}
                  onPress={() => router.back()}>
                  <AppText variant="body" color={theme.colors.primary} style={styles.footerText}>
                    {t('auth.backToLogin')}
                  </AppText>
                </Pressable>
              </View>
            )}
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
  header: {
    gap: spacing.xs,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  successBox: {
    gap: spacing.md,
    alignItems: 'center',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  footerText: {
    textAlign: 'center',
    fontWeight: '600',
  },
});
