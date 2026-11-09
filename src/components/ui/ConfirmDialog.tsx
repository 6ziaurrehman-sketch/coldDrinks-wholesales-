import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { radius, spacing } from '@/theme/tokens';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = t('common.confirm'),
  cancelLabel = t('common.cancel'),
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          onPress={(event) => event.stopPropagation()}>
          <AppText variant="subtitle">{title}</AppText>
          <AppText muted>{message}</AppText>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label={cancelLabel} variant="ghost" onPress={onCancel} />
            </View>
            <View style={styles.action}>
              <Button
                label={confirmLabel}
                variant={destructive ? 'destructive' : 'primary'}
                onPress={onConfirm}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  action: {
    flex: 1,
    minWidth: 0,
  },
});
