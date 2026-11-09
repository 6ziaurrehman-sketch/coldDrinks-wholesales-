import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, radius, spacing } from '@/theme/tokens';

export type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  multiple?: number;
  disabled?: boolean;
};

function clampToRule(raw: number, min: number, max: number, multiple: number) {
  const bounded = Math.min(max, Math.max(min, raw));
  const snapped = Math.round(bounded / multiple) * multiple;
  return Math.min(max, Math.max(min, snapped));
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  multiple = 1,
  disabled = false,
}: StepperProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);

  if (prevValue !== value) {
    setPrevValue(value);
    setDraft(String(value));
  }
  const ruleMessage = useMemo(() => {
    if (value < min) return t('stepper.min', { min });
    if (value > max) return t('stepper.max', { max });
    if (value % multiple !== 0) return t('stepper.multiple', { multiple });
    return null;
  }, [max, min, multiple, value]);

  const commit = (next: number) => {
    const snapped = clampToRule(next, min, max, multiple);
    onChange(snapped);
    setDraft(String(snapped));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stepper.decrease')}
          disabled={disabled || value <= min}
          onPress={() => commit(value - multiple)}
          style={[
            styles.control,
            {
              backgroundColor: theme.colors.surfaceMuted,
              opacity: disabled || value <= min ? 0.4 : 1,
            },
          ]}>
          <AppText variant="title">−</AppText>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => commit(Number(draft) || min)}
          onSubmitEditing={() => commit(Number(draft) || min)}
          keyboardType="number-pad"
          editable={!disabled}
          accessibilityLabel={t('stepper.quantity')}
          maxFontSizeMultiplier={layout.maxFontSizeMultiplier}
          style={[
            styles.input,
            {
              color: disabled ? theme.colors.textMuted : theme.colors.text,
              borderColor: ruleMessage ? theme.colors.error : theme.colors.border,
              backgroundColor: disabled ? theme.colors.surfaceMuted : theme.colors.surface,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stepper.increase')}
          disabled={disabled || value >= max}
          onPress={() => commit(value + multiple)}
          style={[
            styles.control,
            {
              backgroundColor: theme.colors.surfaceMuted,
              opacity: disabled || value >= max ? 0.4 : 1,
            },
          ]}>
          <AppText variant="title">+</AppText>
        </Pressable>
      </View>
      {ruleMessage ? (
        <AppText variant="caption" color={theme.colors.error}>
          {ruleMessage}
        </AppText>
      ) : (
        <AppText variant="caption" muted>
          {t('stepper.min', { min })} · {t('stepper.max', { max })} ·{' '}
          {t('stepper.multiple', { multiple })}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  control: {
    minWidth: layout.minTap,
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
  },
});
