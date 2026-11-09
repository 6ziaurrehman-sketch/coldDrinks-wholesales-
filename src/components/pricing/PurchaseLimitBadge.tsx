import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { purchaseLimitsService } from '@/lib/purchaseLimitsService';
import { useActiveShopStore } from '@/store/activeShopStore';
import type { PurchaseAllowance } from '@/types/advancedModules.types';

interface Props {
  variantId: string;
  requestedQty?: number;
}

export function PurchaseLimitBadge({ variantId, requestedQty = 1 }: Props) {
  const { activeShopId } = useActiveShopStore();
  const [allowance, setAllowance] = useState<PurchaseAllowance | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!activeShopId || !variantId) return;

    purchaseLimitsService.checkAllowance(activeShopId, variantId, requestedQty).then((res) => {
      if (isMounted) setAllowance(res);
    });

    return () => {
      isMounted = false;
    };
  }, [activeShopId, variantId, requestedQty]);

  if (!allowance || !allowance.hasLimit) return null;

  const isBlocked = !allowance.allowed || allowance.remaining <= 0;
  const periodLabel = allowance.period ? `this ${allowance.period}` : 'this period';

  return (
    <View style={styles.container}>
      {isBlocked ? (
        <Badge
          label={`Limit reached: 0 remaining ${periodLabel}`}
          tone="error"
        />
      ) : (
        <Badge
          label={`You can buy ${allowance.remaining} more ${periodLabel}`}
          tone="warning"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
});
