import * as Location from 'expo-location';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Input } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';

export interface LocationPinPickerProps {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  editable?: boolean;
  onCoordinatesChange: (lat: number | null, lng: number | null) => void;
  onAddressChange: (address: string) => void;
}

export function LocationPinPicker({
  latitude,
  longitude,
  address,
  editable = true,
  onCoordinatesChange,
  onAddressChange,
}: LocationPinPickerProps) {
  const theme = useTheme();
  const [isLocating, setIsLocating] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleRequestLocation = async () => {
    if (!editable) return;
    setIsLocating(true);
    setPermissionDenied(false);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setIsLocating(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      onCoordinatesChange(loc.coords.latitude, loc.coords.longitude);
      setPermissionDenied(false);
    } catch {
      setPermissionDenied(true);
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText variant="subtitle">{t('shop.locationPicker')}</AppText>
        <AppText variant="caption" muted>
          Coordinates help delivery dispatchers pinpoint your shop gate and unloading dock.
        </AppText>
      </View>

      {/* Physical address input */}
      <Input
        label={t('shop.address')}
        placeholder="Plot / Shop #, Street, Commercial Market"
        value={address ?? ''}
        editable={editable}
        multiline
        numberOfLines={2}
        onChangeText={onAddressChange}
      />

      {/* GPS Action */}
      {editable ? (
        <View style={styles.gpsRow}>
          <Button
            label={t('shop.useCurrentLocation')}
            variant="secondary"
            loading={isLocating}
            onPress={() => {
              void handleRequestLocation();
            }}
          />
        </View>
      ) : null}

      {/* Permission Denied Fallback Alert */}
      {permissionDenied ? (
        <View style={[styles.alertBox, { backgroundColor: theme.colors.surfaceMuted }]}>
          <AppText variant="caption" color={theme.colors.error}>
            {t('shop.locationDenied')}
          </AppText>
        </View>
      ) : null}

      {/* Coordinates Display / Inputs */}
      <View style={styles.coordsRow}>
        <View style={styles.coordCol}>
          <Input
            label={t('shop.latitude')}
            placeholder="e.g. 24.8607"
            keyboardType="numeric"
            editable={editable}
            value={latitude !== null && latitude !== undefined ? String(latitude) : ''}
            onChangeText={(txt) => {
              const num = parseFloat(txt);
              onCoordinatesChange(isNaN(num) ? null : num, longitude);
            }}
          />
        </View>
        <View style={styles.coordCol}>
          <Input
            label={t('shop.longitude')}
            placeholder="e.g. 67.0011"
            keyboardType="numeric"
            editable={editable}
            value={longitude !== null && longitude !== undefined ? String(longitude) : ''}
            onChangeText={(txt) => {
              const num = parseFloat(txt);
              onCoordinatesChange(latitude, isNaN(num) ? null : num);
            }}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
  },
  header: {
    gap: spacing.xxs,
  },
  gpsRow: {
    alignSelf: 'flex-start',
  },
  alertBox: {
    padding: spacing.sm,
    borderRadius: spacing.xs,
  },
  coordsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  coordCol: {
    flex: 1,
    minWidth: 0,
  },
});
