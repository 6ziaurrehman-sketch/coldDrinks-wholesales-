import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CachedImage } from '@/components/ui/CachedImage';
import { usePromotionsStore } from '@/store/promotionsStore';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';
import type { Promotion } from '@/types/advancedModules.types';

export function PromoBanner() {
  const theme = useTheme();
  const { promotions, serverClockOffsetMs } = usePromotionsStore();
  const [timeLeftStr, setTimeLeftStr] = useState<Record<string, string>>({});

  useEffect(() => {
    const updateCountdowns = () => {
      const now = Date.now() + serverClockOffsetMs;
      const newMap: Record<string, string> = {};

      promotions.forEach((p) => {
        if (p.type === 'limited_time' || p.endsAt) {
          const diffMs = new Date(p.endsAt).getTime() - now;
          if (diffMs <= 0) {
            newMap[p.id] = 'Expired';
          } else {
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            newMap[p.id] = `${hours}h ${minutes}m ${seconds}s`;
          }
        }
      });

      setTimeLeftStr(newMap);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);
    return () => clearInterval(interval);
  }, [promotions, serverClockOffsetMs]);

  if (promotions.length === 0) return null;

  const handleBannerPress = (promo: Promotion) => {
    if (promo.deepLinkRoute) {
      try {
        router.push(promo.deepLinkRoute as any);
      } catch {
        router.push('/(app)/explore' as any);
      }
    } else {
      router.push('/(app)/explore' as any);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {promotions.map((promo) => {
          const countdown = timeLeftStr[promo.id];
          const discountLabel =
            promo.discountType === 'percent'
              ? `${promo.discountValue}% OFF`
              : `Rs. ${promo.discountValue} OFF`;

          return (
            <Card key={promo.id} style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Pressable onPress={() => handleBannerPress(promo)} style={styles.cardInner}>
                {promo.bannerImageUrl && (
                  <CachedImage imageUrl={promo.bannerImageUrl} style={styles.image} contentFit="cover" />
                )}
                <View style={styles.content}>
                  <View style={styles.badgeRow}>
                    <Badge label={discountLabel} tone="primary" />
                    {countdown && (
                      <Badge
                        label={`⏳ ${countdown}`}
                        tone={countdown === 'Expired' ? 'error' : 'warning'}
                      />
                    )}
                  </View>

                  <AppText variant="subtitle" style={styles.title}>
                    {promo.title}
                  </AppText>

                  {promo.description && (
                    <AppText variant="caption" color={theme.colors.textMuted} numberOfLines={2}>
                      {promo.description}
                    </AppText>
                  )}

                  {promo.minOrderAmount > 0 && (
                    <AppText variant="caption" color={theme.colors.primary} style={styles.minSpend}>
                      Min order: Rs. {promo.minOrderAmount}
                    </AppText>
                  )}
                </View>
              </Pressable>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  card: {
    width: 280,
    padding: 0,
    overflow: 'hidden',
  },
  cardInner: {
    width: '100%',
  },
  image: {
    width: '100%',
    height: 100,
  },
  content: {
    padding: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontWeight: '700',
    marginBottom: 4,
  },
  minSpend: {
    marginTop: 4,
    fontWeight: '500',
  },
});
