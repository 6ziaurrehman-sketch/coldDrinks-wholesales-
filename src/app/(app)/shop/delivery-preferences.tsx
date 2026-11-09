import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTheme } from '@/hooks/useTheme';
import { useAddressStore } from '@/store/addressStore';
import { useUiStore } from '@/store/uiStore';
import { t } from '@/i18n';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type DeliveryPeriod, type SubstitutionPreference } from '@/types/database.types';

export default function DeliveryPreferencesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isOnline, showToast } = useUiStore();
  const { loadPreferences, updatePreferences } = useAddressStore();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [period, setPeriod] = useState<DeliveryPeriod>('anytime');
  const [substitution, setSubstitution] = useState<SubstitutionPreference>('substitute');
  const [instructions, setInstructions] = useState<string>('');
  
  const [original, setOriginal] = useState({ period: 'anytime', substitution: 'substitute', instructions: '' });
  const [unsavedDialogVisible, setUnsavedDialogVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;
    loadPreferences().then(() => {
      const prefs = useAddressStore.getState().preferences;
      if (isMounted && prefs) {
        setPeriod(prefs.preferredDeliveryPeriod || 'anytime');
        setSubstitution(prefs.substitutionPreference || 'substitute');
        setInstructions(prefs.standingInstructions || '');
        setOriginal({
          period: prefs.preferredDeliveryPeriod || 'anytime',
          substitution: prefs.substitutionPreference || 'substitute',
          instructions: prefs.standingInstructions || ''
        });
        setLoading(false);
      } else if (isMounted) {
        setLoading(false); // In case it's null
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });
    return () => { isMounted = false; };
  }, [loadPreferences]);

  const hasChanges = () => {
    return period !== original.period ||
           substitution !== original.substitution ||
           instructions !== original.instructions;
  };

  const handleBack = () => {
    if (hasChanges()) {
      setUnsavedDialogVisible(true);
    } else {
      router.back();
    }
  };

  const handleSave = async () => {
    if (!isOnline) {
      showToast(t('shop.offlineDisabled'), 'error');
      return;
    }
    
    setSaving(true);
    try {
      await updatePreferences({
        preferredDeliveryPeriod: period,
        substitutionPreference: substitution,
        standingInstructions: instructions || null
      });
      setOriginal({ period, substitution, instructions });
      showToast(t('deliveryPreferences.preferencesSaved'), 'success');
      router.back();
    } catch {
      showToast(t('common.errorTitle'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Screen title={t('deliveryPreferences.title')} onBack={router.back} />;
  }

  const periods: { value: DeliveryPeriod; label: string }[] = [
    { value: 'morning', label: t('deliveryPreferences.morning') },
    { value: 'afternoon', label: t('deliveryPreferences.afternoon') },
    { value: 'evening', label: t('deliveryPreferences.evening') },
    { value: 'anytime', label: t('deliveryPreferences.anytime') },
  ];

  const substitutions: { value: SubstitutionPreference; title: string; desc: string }[] = [
    {
      value: 'substitute',
      title: t('deliveryPreferences.substitute'),
      desc: 'We will replace unavailable items with a similar brand or size at the same or lower price.',
    },
    {
      value: 'skip',
      title: t('deliveryPreferences.skip'),
      desc: 'Unavailable items will be removed from your order and the invoice adjusted accordingly.',
    },
    {
      value: 'call_me',
      title: t('deliveryPreferences.callMe'),
      desc: 'Our team will call your shop before dispatch to discuss alternatives for out-of-stock items.',
    },
  ];

  return (
    <Screen title={t('deliveryPreferences.title')} onBack={handleBack}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md }}>
        <AppText variant="subtitle" style={{ color: theme.colors.text, marginBottom: theme.spacing.sm }}>
          {t('deliveryPreferences.preferredPeriod')}
        </AppText>
        
        <View style={styles.chipContainer}>
          {periods.map((p) => {
            const isSelected = period === p.value;
            return (
              <Pressable
                key={p.value}
                onPress={() => setPeriod(p.value)}
                style={[
                  styles.chip,
                  { backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceMuted },
                  isSelected && { borderColor: theme.colors.primary },
                ]}
              >
                <AppText
                  variant="body"
                  style={{ color: isSelected ? '#fff' : theme.colors.text }}
                >
                  {p.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="subtitle" style={{ color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          {t('deliveryPreferences.substitution')}
        </AppText>
        
        {substitutions.map((sub) => {
          const isSelected = substitution === sub.value;
          return (
            <Card
              key={sub.value}
              style={[
                styles.subCard,
                isSelected && { borderColor: theme.colors.primary, borderWidth: 2 },
              ]}
            >
              <Pressable onPress={() => setSubstitution(sub.value)} style={styles.subCardPressable}>
                <View style={styles.subCardHeader}>
                  <AppText variant="subtitle" style={{ color: theme.colors.text }}>{sub.title}</AppText>
                  {isSelected ? (
                    <Ionicons name="radio-button-on" size={24} color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="radio-button-off" size={24} color={theme.colors.border} />
                  )}
                </View>
                <AppText variant="body" style={{ color: theme.colors.textMuted, marginTop: theme.spacing.xs }}>
                  {sub.desc}
                </AppText>
              </Pressable>
            </Card>
          );
        })}

        <AppText variant="subtitle" style={{ color: theme.colors.text, marginTop: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          {t('deliveryPreferences.standingInstructions')}
        </AppText>
        
        <TextInput
          style={[styles.input, { 
            borderColor: theme.colors.border, 
            color: theme.colors.text, 
            backgroundColor: theme.colors.surface 
          }]}
          placeholder={t('deliveryPreferences.standingInstructionsPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={instructions}
          onChangeText={setInstructions}
          maxFontSizeMultiplier={2}
        />
      </ScrollView>

      {hasChanges() && (
        <View style={[styles.stickyFooter, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Button
            label={t('deliveryPreferences.savePreferences')}
            variant="primary"
            loading={saving}
            onPress={handleSave}
          />
        </View>
      )}

      <ConfirmDialog
        visible={unsavedDialogVisible}
        title={t('shop.unsavedTitle')}
        message={t('shop.unsavedMessage')}
        confirmLabel={t('shop.discard')}
        destructive
        onConfirm={() => {
          setUnsavedDialogVisible(false);
          router.back();
        }}
        onCancel={() => setUnsavedDialogVisible(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subCard: {
    marginBottom: 12,
  },
  subCardPressable: {
    padding: 16,
  },
  subCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
  },
  stickyFooter: {
    padding: 16,
    borderTopWidth: 1,
  }
});
