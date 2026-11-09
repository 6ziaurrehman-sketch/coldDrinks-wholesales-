import { type PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';

type ScreenProps = PropsWithChildren<{
  title: string;
  scroll?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}>;

export function Screen({ title, scroll = true, onBack, rightAction, children }: ScreenProps) {
  const theme = useTheme();

  const header = onBack ? (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        hitSlop={8}
        style={styles.backButton}>
        <AppText variant="subtitle" color={theme.colors.primary}>
          ← Back
        </AppText>
      </Pressable>
      <AppText variant="title" style={styles.headerTitle}>
        {title}
      </AppText>
      {rightAction}
    </View>
  ) : (
    <View style={styles.titleRow}>
      <AppText variant="title" style={styles.headerTitle}>{title}</AppText>
      {rightAction}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.body}>
            {header}
            {children}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.noScrollContainer}>
          <View style={styles.headerContainer}>
            {header}
          </View>
          <View style={styles.bodyNoScroll}>
            {children}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  body: {
    gap: spacing.md,
    minWidth: 0,
    width: '100%',
  },
  noScrollContainer: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  headerContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  bodyNoScroll: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    paddingVertical: spacing.xxs,
    paddingEnd: spacing.xs,
  },
  headerTitle: {
    flex: 1,
  },
});
