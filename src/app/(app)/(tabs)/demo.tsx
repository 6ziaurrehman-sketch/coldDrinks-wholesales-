import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ScreenState, type ScreenStatus } from '@/components/ScreenState';
import {
  AppText,
  Badge,
  BottomSheet,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  SkeletonBlock,
  Stepper,
} from '@/components/ui';
import { t } from '@/i18n';
import { useUiStore } from '@/store/uiStore';
import { spacing } from '@/theme/tokens';
import { formatDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/formatMoney';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <AppText variant="subtitle">{title}</AppText>
      <View style={styles.stack}>{children}</View>
    </Card>
  );
}

export default function DemoScreen() {
  const showToast = useUiStore((s) => s.showToast);
  const setOnline = useUiStore((s) => s.setOnline);
  const isOnline = useUiStore((s) => s.isOnline);
  const [qty, setQty] = useState(12);
  const [overMax, setOverMax] = useState(200);
  const [phone, setPhone] = useState('03001234567');
  const [secret, setSecret] = useState('secret');
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [status, setStatus] = useState<ScreenStatus>('data');

  return (
    <Screen title={t('demo.title')}>
      <AppText muted>{t('demo.subtitle')}</AppText>
      <AppText variant="caption" muted>
        {formatMoney(24850)} · {formatDate(new Date(), { style: 'datetime' })}
      </AppText>

      <Section title="Button">
        <Button label="Primary" onPress={() => undefined} />
        <Button label="Secondary" variant="secondary" onPress={() => undefined} />
        <Button label="Destructive" variant="destructive" onPress={() => undefined} />
        <Button label="Ghost" variant="ghost" onPress={() => undefined} />
        <Button label="Loading" loading onPress={() => undefined} />
        <Button label="Disabled" disabled onPress={() => undefined} />
      </Section>

      <Section title="Input">
        <Input
          label="With helper"
          value={phone}
          onChangeText={setPhone}
          helper="Registered shop number"
          keyboardType="phone-pad"
        />
        <Input label="With error" value="" onChangeText={() => undefined} error="Required" />
        <Input
          label="Secure"
          value={secret}
          onChangeText={setSecret}
          secureTextEntry
          helper="Toggle visibility"
        />
      </Section>

      <Section title="Badge">
        <View style={styles.wrapRow}>
          <Badge label="Primary" />
          <Badge label="Success" tone="success" />
          <Badge label="Warning" tone="warning" />
          <Badge label="Error" tone="error" />
          <Badge label="Neutral" tone="neutral" />
        </View>
      </Section>

      <Section title="Stepper">
        <Stepper value={qty} onChange={setQty} min={6} max={48} multiple={6} />
        <Stepper value={overMax} onChange={setOverMax} min={6} max={48} multiple={6} />
      </Section>

      <Section title="Long product name (2 lines) & Urdu Text">
        <AppText numberOfLines={2} variant="subtitle" style={styles.ellipsis}>
          {t('catalog.longName')}
        </AppText>
        <AppText variant="body" style={styles.ellipsis}>
          کولڈ ڈرنکس ہول سیل آرڈرنگ — دکان داروں اور ڈسٹری بیوٹرز کے لیے خصوصی ریٹس اور فوری ترسیل
        </AppText>
      </Section>

      <Section title="Small Screen Simulation (320px constraint)">
        <View style={styles.smallScreenBox}>
          <AppText variant="caption" muted>
            320px Width Bounds
          </AppText>
          <Button label="Full Width Button" onPress={() => undefined} />
          <Stepper value={qty} onChange={setQty} min={6} max={48} multiple={6} />
        </View>
      </Section>

      <Section title="Skeleton">
        <SkeletonBlock />
        <Skeleton height={48} />
        <Skeleton width={48} height={48} circle />
      </Section>

      <Section title="Empty / Error">
        <EmptyState />
        <ErrorState message="Could not load catalog" onRetry={() => showToast('Retried', 'info')} />
      </Section>

      <Section title="ScreenState">
        <View style={styles.wrapRow}>
          {(['loading', 'data', 'empty', 'error', 'offline'] as const).map((value) => (
            <View key={value} style={styles.chip}>
              <Button
                label={value}
                variant={status === value ? 'primary' : 'ghost'}
                onPress={() => setStatus(value)}
              />
            </View>
          ))}
        </View>
        <View style={styles.preview}>
          <ScreenState
            status={status}
            onRetry={() => setStatus('data')}
            data={<AppText>Data state — catalog rows would render here.</AppText>}
          />
        </View>
      </Section>

      <Section title="Sheets, dialogs, toasts">
        <Button label="Open bottom sheet" onPress={() => setSheet(true)} />
        <Button label="Open confirm dialog" variant="secondary" onPress={() => setDialog(true)} />
        <Button label="Toast success" variant="ghost" onPress={() => showToast('Saved', 'success')} />
        <Button
          label="Toast error"
          variant="ghost"
          onPress={() => showToast('Payment failed', 'error')}
        />
        <Button
          label={isOnline ? 'Simulate offline' : 'Back online'}
          variant="ghost"
          onPress={() => setOnline(!isOnline)}
        />
      </Section>

      <BottomSheet visible={sheet} title="Case size" onClose={() => setSheet(false)}>
        <AppText muted>Choose how many bottles per delivery case.</AppText>
        <Stepper value={qty} onChange={setQty} min={6} max={24} multiple={6} />
        <Button label={t('common.ok')} onPress={() => setSheet(false)} />
      </BottomSheet>

      <ConfirmDialog
        visible={dialog}
        title="Remove from cart?"
        message="This SKU will be dropped from the current order draft."
        destructive
        onCancel={() => setDialog(false)}
        onConfirm={() => {
          setDialog(false);
          showToast('Removed', 'success');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
    minWidth: 0,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexGrow: 1,
    minWidth: 96,
  },
  preview: {
    minHeight: 140,
  },
  ellipsis: {
    minWidth: 0,
    width: '100%',
  },
  smallScreenBox: {
    width: 320,
    maxWidth: '100%',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9AADB8',
  },
});
