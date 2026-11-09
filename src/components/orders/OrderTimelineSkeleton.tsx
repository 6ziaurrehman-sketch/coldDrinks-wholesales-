import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/hooks/useTheme';

export function OrderTimelineSkeleton() {
  const theme = useTheme();

  return (
    <View style={styles.container} accessibilityLabel="Loading order timeline">
      {[1, 2, 3, 4, 5, 6].map((step, idx) => (
        <View key={step} style={styles.stepRow}>
          <View style={styles.indicatorCol}>
            <Skeleton width={16} height={16} circle />
            {idx < 5 && (
              <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
            )}
          </View>
          <View style={styles.contentCol}>
            <View style={styles.titleRow}>
              <Skeleton width="45%" height={16} />
              <Skeleton width="20%" height={12} />
            </View>
            <View style={{ height: 6 }} />
            <Skeleton width="70%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  stepRow: {
    flexDirection: 'row',
    minHeight: 56,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  line: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  contentCol: {
    flex: 1,
    paddingStart: 12,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
