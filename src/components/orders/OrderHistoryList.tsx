import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { OrderHistoryCard } from '@/components/orders/OrderHistoryCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import type { OrderHistoryItem } from '@/types/orderHistory.types';

interface OrderHistoryListProps {
  orders: OrderHistoryItem[];
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  hasFiltersApplied: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onReorder: (orderId: string) => Promise<void>;
  onClearFilters: () => void;
}

export function OrderHistoryList({
  orders,
  isRefreshing,
  isLoadingMore,
  hasMore,
  hasFiltersApplied,
  onRefresh,
  onLoadMore,
  onReorder,
  onClearFilters,
}: OrderHistoryListProps) {
  const theme = useTheme();

  if (orders.length === 0 && !isRefreshing) {
    if (hasFiltersApplied) {
      return (
        <View style={styles.emptyContainer}>
          <EmptyState
            title={t('orderHistory.noMatchTitle')}
            message={t('orderHistory.noMatchMessage')}
          />
          <View style={styles.emptyAction}>
            <Button
              label={t('orderHistory.clearFilters')}
              variant="secondary"
              onPress={onClearFilters}
            />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <EmptyState
          title={t('orderHistory.emptyHistoryTitle')}
          message={t('orderHistory.emptyHistoryMessage')}
        />
        <View style={styles.emptyAction}>
          <Button
            label={t('orderHistory.browseCatalog')}
            variant="primary"
            onPress={() => router.push('/(app)/(tabs)/catalog')}
          />
        </View>
      </View>
    );
  }

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        {isLoadingMore ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : null}
      </View>
    );
  };

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <OrderHistoryCard item={item} onReorder={onReorder} />
      )}
      contentContainerStyle={styles.listContent}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={renderFooter}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.primary]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAction: {
    marginTop: 16,
    width: '60%',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
