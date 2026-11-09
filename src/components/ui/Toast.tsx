import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/AppText';
import { useUiStore } from '@/store/uiStore';
import { radius, spacing } from '@/theme/tokens';

export function ToastViewport() {
  const insets = useSafeAreaInsets();
  const toasts = useUiStore((state) => state.toasts);
  const dismissToast = useUiStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      {toasts.map((toast) => {
        const background =
          toast.tone === 'success'
            ? '#059669' // Emerald Green
            : toast.tone === 'error'
              ? '#dc2626' // Red
              : '#2563eb'; // Royal Blue

        const iconName =
          toast.tone === 'success'
            ? 'checkmark-circle'
            : toast.tone === 'error'
              ? 'alert-circle'
              : 'notifications';

        return (
          <Pressable
            key={toast.id}
            accessibilityRole="alert"
            onPress={() => {
              if (toast.onPress) {
                toast.onPress();
              }
              dismissToast(toast.id);
            }}
            style={[styles.toast, { backgroundColor: background }]}>
            <Ionicons
              name={iconName}
              size={22}
              color="#ffffff"
              style={{ marginTop: toast.title ? 2 : 0, marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              {toast.title ? (
                <AppText style={styles.titleText}>{toast.title}</AppText>
              ) : null}
              <AppText style={styles.messageText}>{toast.message}</AppText>
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => dismissToast(toast.id)}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={18} color="#ffffff" />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    start: spacing.md,
    end: spacing.md,
    gap: spacing.xs,
    zIndex: 9999,
    elevation: 20,
  },
  toast: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  titleText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  messageText: {
    color: '#ffffff',
    fontSize: 13,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
});
