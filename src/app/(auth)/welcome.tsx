import { router } from 'expo-router';
import { StyleSheet, View, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';

export default function WelcomeScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <View style={styles.heroSection}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={{ width: 104, height: 104, borderRadius: 24, marginBottom: 14 }}
            resizeMode="contain"
          />
          <View style={[styles.badgeContainer, { backgroundColor: theme.colors.surfaceMuted }]}>
            <AppText variant="caption" color={theme.colors.primary} style={{ fontWeight: '700' }}>
              WHOLESALE COLD DRINKS
            </AppText>
          </View>
          <AppText variant="display" style={styles.title}>
            Al Fajar Traders
          </AppText>
          <AppText variant="subtitle" muted style={styles.subtitle}>
            Wholesale Beverage Portal
          </AppText>
          <AppText muted style={styles.description}>
            Beverage inventory, bulk sales, retail shop orders, and loan khata ledger management.
          </AppText>
        </View>

        <Card style={styles.actionCard}>
          <Button
            label="Sign In as Admin"
            variant="primary"
            onPress={() => router.push('/(auth)/login')}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'space-between',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  heroSection: {
    marginTop: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  badgeContainer: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    textAlign: 'center',
    fontWeight: '800',
  },
  subtitle: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 13,
  },
  actionCard: {
    padding: spacing.lg,
  },
});
