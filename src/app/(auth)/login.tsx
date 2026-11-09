import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppText, Button, Card, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { radius, spacing } from '@/theme/tokens';

export default function LoginScreen() {
  const theme = useTheme();
  const searchParams = useLocalSearchParams<{ redirect?: string }>();
  const redirectIntent = useAuthStore((s) => s.redirectIntent);
  const targetRedirect = searchParams.redirect || redirectIntent;

  // Single Wholesaler Admin Email & Password login
  const [email, setEmail] = useState('shahid123@gmail.com');
  const [password, setPassword] = useState('alFajar123*#');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (emailError) setEmailError(undefined);
    if (generalError) setGeneralError(undefined);
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (passwordError) setPasswordError(undefined);
    if (generalError) setGeneralError(undefined);
  };

  const handleEmailSubmit = async () => {
    let hasError = false;

    if (!email.trim()) {
      setEmailError('Please enter admin email.');
      hasError = true;
    }

    if (!password) {
      setPasswordError('Please enter password.');
      hasError = true;
    }

    if (hasError) return;

    setIsSubmitting(true);
    setGeneralError(undefined);

    try {
      await signInWithPassword(email.trim(), password);
      const status = useAuthStore.getState().accountStatus;

      if (status && status !== 'active') {
        router.replace('/(auth)/account-status');
      } else if (targetRedirect) {
        useAuthStore.getState().setRedirectIntent(null);
        router.replace(targetRedirect as any);
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Incorrect credentials. Please verify and try again.');
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
            {/* Header branding */}
            <View style={styles.header}>
              <View style={styles.logoWrap}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <AppText variant="title" style={styles.titleText}>
                Al Fajar Traders
              </AppText>
              <View style={styles.subtitlePill}>
                <AppText style={styles.subtitleText}>
                  Cold Drinks Wholesale Portal
                </AppText>
              </View>
            </View>

            {generalError ? (
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[
                  styles.errorBanner,
                  { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
                ]}>
                <Ionicons name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 6 }} />
                <AppText variant="caption" style={{ color: '#dc2626', fontWeight: '600', flex: 1 }}>
                  {generalError}
                </AppText>
              </View>
            ) : null}

            {/* Direct Admin Credentials Card */}
            <Card style={styles.formCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.shieldIconWrap, { backgroundColor: `${theme.colors.primary}15` }]}>
                  <Ionicons name="shield-checkmark" size={16} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={[styles.cardHeaderTitle, { color: theme.colors.text }]}>
                    Wholesaler Sign In
                  </AppText>
                  <AppText variant="caption" muted style={styles.cardHeaderSubtitle}>
                    Enter admin credentials to access inventory & orders
                  </AppText>
                </View>
              </View>

              <View style={styles.inputsWrap}>
                <Input
                  label="Admin Email"
                  placeholder="admin@alfajar.com"
                  value={email}
                  onChangeText={handleEmailChange}
                  error={emailError}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Input
                  label="Password"
                  placeholder="Enter password"
                  value={password}
                  onChangeText={handlePasswordChange}
                  error={passwordError}
                  secureTextEntry
                />
              </View>

              <Button
                label="Sign In as Admin"
                variant="primary"
                onPress={handleEmailSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            </Card>

            <View style={styles.footerNote}>
              <Ionicons name="lock-closed" size={13} color="#94a3b8" style={{ marginRight: 5 }} />
              <AppText variant="caption" style={styles.footerText}>
                Authorized Wholesaler Admin Access Only
              </AppText>
            </View>
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
    maxWidth: 420,
    alignSelf: 'center',
    gap: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  logoWrap: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#002F87',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoImage: {
    width: 82,
    height: 82,
    borderRadius: 20,
  },
  titleText: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 24,
    letterSpacing: -0.3,
  },
  subtitlePill: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
  },
  subtitleText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  formCard: {
    gap: spacing.md,
    padding: 20,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  shieldIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardHeaderSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  inputsWrap: {
    gap: 12,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
});
