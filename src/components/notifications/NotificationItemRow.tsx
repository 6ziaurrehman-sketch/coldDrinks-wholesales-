import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatDate';
import type { NotificationItem, NotificationCategory } from '@/types/notifications.types';

interface NotificationItemRowProps {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  onMarkRead?: (id: string) => void;
}

const CATEGORY_ICONS: Record<NotificationCategory, string> = {
  orders: '📦',
  delivery: '🚚',
  payments: '💳',
  discounts: '🏷️',
  messages: '💬',
  offers: '🎉',
};

export function NotificationItemRow({
  item,
  onPress,
  onMarkRead,
}: NotificationItemRowProps) {
  const theme = useTheme();
  const isUnread = !item.readAt;
  const icon = CATEGORY_ICONS[item.category] || '🔔';

  const accessibilityLabel = `${isUnread ? 'Unread notification: ' : 'Notification: '} ${
    item.title
  }, ${item.body}`;

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: isUnread ? theme.colors.surface : theme.colors.surfaceMuted,
          borderColor: isUnread ? theme.colors.primary + '40' : theme.colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => onPress(item)}
        style={styles.innerPressable}
      >
        {/* Left: Category Icon */}
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: isUnread
                ? theme.colors.primary + '15'
                : theme.colors.border + '30',
            },
          ]}
        >
          <AppText variant="title">{icon}</AppText>
        </View>

        {/* Center: Content */}
        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <AppText
              variant="subtitle"
              color={theme.colors.text}
              style={{ fontWeight: isUnread ? '700' : '500', flex: 1 }}
              numberOfLines={1}
            >
              {item.title}
            </AppText>

            {isUnread && (
              <View
                style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]}
                accessibilityLabel="Unread"
              />
            )}
          </View>

          <AppText
            variant="body"
            color={isUnread ? theme.colors.text : theme.colors.textMuted}
            numberOfLines={2}
            style={{ marginTop: 2 }}
          >
            {item.body}
          </AppText>

          <View style={styles.footerRow}>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {formatDate(item.createdAt, { style: 'datetime' })}
            </AppText>

            {isUnread && onMarkRead && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark notification as read"
                onPress={(e) => {
                  e.stopPropagation();
                  onMarkRead(item.id);
                }}
                style={styles.markReadBtn}
              >
                <AppText variant="caption" color={theme.colors.primary}>
                  Mark read
                </AppText>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  innerPressable: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  markReadBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
});
