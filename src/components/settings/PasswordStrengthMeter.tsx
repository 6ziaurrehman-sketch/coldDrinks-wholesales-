import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui';
import { calculatePasswordStrength } from '@/lib/settingsService';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const theme = useTheme();

  const strength = useMemo(() => {
    return calculatePasswordStrength(password);
  }, [password]);

  if (!password) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* 4 Segment Bars */}
      <View style={styles.barRow}>
        {[1, 2, 3, 4].map((step) => {
          const filled = strength.score >= step;
          return (
            <View
              key={step}
              style={[
                styles.segment,
                {
                  backgroundColor: filled ? strength.color : theme.colors.border,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.labelRow}>
        <AppText variant="caption" color={theme.colors.textMuted}>
          Strength:{' '}
        </AppText>
        <AppText variant="caption" color={strength.color} style={{ fontWeight: '700' }}>
          {strength.label}
        </AppText>
      </View>

      {strength.score < 3 && strength.feedback.length > 0 && (
        <View style={styles.feedbackContainer}>
          {strength.feedback.map((tip, idx) => (
            <AppText key={idx} variant="caption" color={theme.colors.textMuted}>
              • {tip}
            </AppText>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  barRow: {
    flexDirection: 'row',
    gap: 4,
    height: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  feedbackContainer: {
    marginTop: 2,
    gap: 2,
  },
});
