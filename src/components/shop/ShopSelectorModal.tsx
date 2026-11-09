import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useActiveShopStore, type ShopSummaryItem } from '@/store/activeShopStore';
import { useCartStore } from '@/store/cartStore';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import { smartSearchMatch } from '@/utils/searchUtils';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShopSelectorModal({ visible, onClose }: Props) {
  const theme = useTheme();

  // Atomic Zustand Selectors
  const availableShops = useActiveShopStore((s) => s.availableShops);
  const activeShopId = useActiveShopStore((s) => s.activeShopId);
  const switchShop = useActiveShopStore((s) => s.switchShop);
  const isSwitching = useActiveShopStore((s) => s.isSwitching);
  const cartItemsCount = useCartStore((s) => s.items.length);

  const [search, setSearch] = useState('');

  const filteredShops = availableShops.filter((s) =>
    smartSearchMatch([s.name, s.city, s.area, (s as any).address], search)
  );

  const handleSelectShop = async (shop: ShopSummaryItem) => {
    if (shop.id === activeShopId) {
      onClose();
      return;
    }

    if (cartItemsCount > 0) {
      Alert.alert(
        'Switch Branch / Shop?',
        `You have ${cartItemsCount} item(s) in your current cart. Carts are kept per branch. Do you want to switch to ${shop.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch Branch',
            style: 'default',
            onPress: async () => {
              await switchShop(shop.id);
              onClose();
            },
          },
        ],
      );
    } else {
      await switchShop(shop.id);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="none"
        style={styles.backdrop}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <AppText variant="title" style={styles.title}>
              Select Shop Branch
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close branch selector"
              onPress={onClose}
              hitSlop={8}
              style={styles.closeTouchArea}
            >
              <AppText variant="body" color={theme.colors.textMuted}>
                ✕
              </AppText>
            </Pressable>
          </View>

          <TextInput
            accessibilityLabel="Search branch locations"
            accessibilityHint="Type to search branch by name, area, or city"
            style={[
              styles.searchInput,
              {
                color: theme.colors.text,
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Search branches by name, area, or city..."
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />

          <ScrollView style={styles.list}>
            {filteredShops.map((shop) => {
              const isActive = shop.id === activeShopId;
              return (
                <Card
                  key={shop.id}
                  style={[
                    styles.shopCard,
                    isActive && { borderColor: theme.colors.primary, borderWidth: 2 },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Switch to ${shop.name}, ${shop.city}. Role: ${shop.role}`}
                    onPress={() => handleSelectShop(shop)}
                    disabled={isSwitching}
                    style={styles.cardInner}
                  >
                    <View style={styles.shopInfo}>
                      <View style={styles.titleRow}>
                        <AppText variant="subtitle" style={styles.shopName}>
                          {shop.name}
                        </AppText>
                        {isActive && (
                          <Badge label="Active" tone="success" />
                        )}
                      </View>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {shop.area ? `${shop.area}, ` : ''}{shop.city}
                      </AppText>
                      <View style={styles.badgeRow}>
                        <Badge label={`Role: ${shop.role.toUpperCase()}`} tone="neutral" />
                        {shop.groupId && (
                          <Badge label="Group Branch" tone="info" />
                        )}
                      </View>
                    </View>
                  </Pressable>
                </Card>
              );
            })}

            {filteredShops.length === 0 && (
              <View style={styles.emptyContainer}>
                <AppText variant="body" color={theme.colors.textMuted}>
                  {`No shops found matching "${search}".`}
                </AppText>
              </View>
            )}
          </ScrollView>

          <Button
            label="Close"
            variant="secondary"
            onPress={onClose}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.md,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontWeight: '700',
  },
  closeTouchArea: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  list: {
    maxHeight: 360,
  },
  shopCard: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  cardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  shopInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  shopName: {
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 6,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
});
