import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';
import { Ionicons } from '@expo/vector-icons';

export default function OrderSuccessScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors, spacing } = useTheme();

  return (
    <Screen title="Order Confirmed">
      <View style={[styles.container, { padding: spacing.md }]}>
        <Ionicons name="checkmark-circle" size={80} color={colors.success} />
        <AppText variant="title" style={{ marginTop: spacing.md }}>Order Placed!</AppText>
        <AppText variant="body" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          Your order #{orderId} has been successfully placed.
        </AppText>
        <View style={{ marginTop: spacing.xl, width: '100%' }}>
          <Button 
            label="Back to Home" 
            onPress={() => router.navigate('/(app)/(tabs)')} 
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
