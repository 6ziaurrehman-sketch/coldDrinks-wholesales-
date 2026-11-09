import type { PropsWithChildren } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';

export function ForceUpdateGate({ children }: PropsWithChildren) {
  const theme = useTheme();
  const { isUpdateRequired, currentVersion, minimumVersion, forceUpdateMessage, storeUrl } =
    useAppVersionCheck();

  if (!isUpdateRequired) {
    return <>{children}</>;
  }

  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl).catch((err: unknown) => {
        console.warn('Failed to open store URL:', err);
      });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.content}>
        <Card style={styles.card}>
          <AppText variant="title" style={styles.title}>
            Update Required
          </AppText>
          <AppText style={styles.message}>
            {forceUpdateMessage || 'A mandatory update is required to continue using this application.'}
          </AppText>

          <View style={styles.versionContainer}>
            <AppText variant="caption" muted>
              Current Version: {currentVersion}
            </AppText>
            <AppText variant="caption" muted>
              Required Version: {minimumVersion}
            </AppText>
          </View>

          <Button
            label="Update Now"
            variant="primary"
            onPress={handleUpdate}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
  },
  versionContainer: {
    alignItems: 'center',
    gap: spacing.xxs,
    marginVertical: spacing.sm,
  },
});
