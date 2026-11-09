import React from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useCheckoutStore } from '@/store/checkoutStore';
import { useAuthStore } from '@/store/authStore';
import { placeOrder } from '@/lib/checkoutService';
import { router } from 'expo-router';
import { useTheme } from '@/theme/useTheme';

export default function CheckoutScreen() {
  const { step, setStep } = useCheckoutStore();
  const { activeShopId } = useAuthStore();
  const { spacing } = useTheme();

  const handleNext = async () => {
    if (step === 'address') setStep('delivery');
    else if (step === 'delivery') setStep('payment');
    else if (step === 'payment') setStep('review');
    else if (step === 'review') {
      const orderId = await placeOrder(activeShopId!, {});
      router.push(`/checkout/success?orderId=${orderId}`);
    }
  };

  return (
    <Screen title={`Checkout: ${step.toUpperCase()}`}>
      <View style={{ padding: spacing.md, flex: 1 }}>
        <AppText variant="title">Step: {step}</AppText>
        {/* Simplified for demonstration */}
        <AppText variant="body">Please select your preferences and continue.</AppText>
      </View>
      <View style={{ padding: spacing.md }}>
        <Button label={step === 'review' ? 'Place Order' : 'Next'} onPress={handleNext} />
      </View>
    </Screen>
  );
}
