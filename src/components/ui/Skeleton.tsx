import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { radius } from '@/theme/tokens';

export type SkeletonProps = {
  width?: ViewStyle['width'];
  height?: number;
  circle?: boolean;
};

export function Skeleton({ width = '100%', height = 16, circle }: SkeletonProps) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityLabel={undefined}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        {
          width,
          height: circle ? (typeof width === 'number' ? width : height) : height,
          borderRadius: circle ? radius.full : radius.sm,
          backgroundColor: theme.colors.skeleton,
          opacity: pulse,
        },
      ]}
    />
  );
}

export type SkeletonBlockProps = {
  width?: ViewStyle['width'];
  height?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
};

export function SkeletonBlock({ width, height, style, children }: SkeletonBlockProps = {}) {
  if (width || height) {
    return <Skeleton width={width} height={height} />;
  }
  return (
    <View style={[styles.stack, style]} accessibilityLabel="Loading">
      {children ?? (
        <>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    minWidth: 0,
  },
  stack: {
    gap: 8,
    width: '100%',
  },
});
