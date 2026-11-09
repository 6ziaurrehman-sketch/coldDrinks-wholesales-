import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText, Card } from '@/components/ui';
import { t } from '@/i18n';
import { formatMoney } from '@/utils/formatMoney';

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<'/payments/[id]'>();
  const idStr = Array.isArray(id) ? id[0] : (id ?? '');

  return (
    <Screen title={t('payments.detail', { id: idStr })}>
      <ScreenState
        status="data"
        data={
          <Card>
            <AppText>{t('payments.detail', { id: idStr })}</AppText>
            <AppText variant="subtitle">{formatMoney(5000)}</AppText>
          </Card>
        }
      />
    </Screen>
  );
}
