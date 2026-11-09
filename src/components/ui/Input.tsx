import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { layout, radius, spacing } from '@/theme/tokens';

import type { StyleProp, ViewStyle } from 'react-native';

export type InputProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  helper?: string;
  error?: string;
  secureTextEntry?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function Input({
  label,
  value,
  onChangeText,
  helper,
  error,
  secureTextEntry,
  placeholder,
  keyboardType,
  autoCapitalize,
  editable = true,
  multiline,
  numberOfLines,
  autoFocus,
  onFocus,
  onBlur,
  style,
}: InputProps) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const describedBy = error ?? helper;

  return (
    <View style={[styles.wrap, style]} accessibilityRole="none">
      {label ? (
        <AppText variant="caption" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            borderColor: error ? theme.colors.error : theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
          autoFocus={autoFocus}
          onFocus={onFocus}
          onBlur={onBlur}
          accessibilityLabel={label}
          accessibilityHint={describedBy}
          aria-invalid={Boolean(error)}
          maxFontSizeMultiplier={layout.maxFontSizeMultiplier}
          style={[
            styles.input,
            { color: theme.colors.text },
            !editable && { color: theme.colors.textMuted },
          ]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('common.showPassword') : t('common.hidePassword')}
            onPress={() => setHidden((prev) => !prev)}
            hitSlop={8}
            style={styles.toggle}>
            <AppText variant="caption" color={theme.colors.primary}>
              {hidden ? t('common.showPassword') : t('common.hidePassword')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color={theme.colors.error}>
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" muted>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: spacing.xxs,
  },
  label: {
    minWidth: 0,
  },
  field: {
    minHeight: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    textAlign: 'auto',
    textAlignVertical: 'center',
    paddingVertical: Platform.OS === 'android' ? 0 : 4,
  },
  toggle: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
