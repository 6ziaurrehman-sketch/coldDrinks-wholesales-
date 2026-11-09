import React, { useState } from 'react';
import { View, StyleSheet, Modal, Pressable, TextInput, Alert } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useFeedbackStore } from '@/store/feedbackStore';
import { useTheme } from '@/hooks/useTheme';
import { spacing } from '@/theme/tokens';

export function OrderFeedbackModal() {
  const theme = useTheme();

  // Atomic Zustand Selectors
  const isPromptVisible = useFeedbackStore((s) => s.isPromptVisible);
  const activeOrder = useFeedbackStore((s) => s.activeOrder);
  const submitFeedback = useFeedbackStore((s) => s.submitFeedback);
  const dismissPrompt = useFeedbackStore((s) => s.dismissPrompt);
  const status = useFeedbackStore((s) => s.status);

  const [deliveryRating, setDeliveryRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [comments, setComments] = useState('');

  if (!isPromptVisible || !activeOrder) return null;

  const handleSubmit = async () => {
    try {
      await submitFeedback(deliveryRating, serviceRating, comments);
      Alert.alert('Thank You!', 'Your feedback helps improve distributor delivery and service.');
    } catch {
      Alert.alert('Feedback Submission Failed', 'Unable to submit review right now. We have safely saved your progress.');
    }
  };

  const renderStars = (category: string, selected: number, onSelect: (val: number) => void) => {
    return (
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            key={star}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${category} ${star} star${star > 1 ? 's' : ''}`}
            onPress={() => onSelect(star)}
            hitSlop={6}
            style={styles.starTouchArea}
          >
            <AppText style={[styles.star, star <= selected ? styles.starActive : styles.starInactive]}>
              ★
            </AppText>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={isPromptVisible} transparent animationType="fade" onRequestClose={dismissPrompt}>
      <View style={styles.backdrop}>
        <Card style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
          <AppText variant="title" style={styles.title}>
            Order Delivery Feedback
          </AppText>
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.subtitle}>
            Order #{activeOrder.orderNumber}
          </AppText>

          <View style={styles.ratingSection}>
            <AppText variant="body" style={styles.ratingLabel}>
              Delivery Experience (Punctuality & Handling):
            </AppText>
            {renderStars('Delivery', deliveryRating, setDeliveryRating)}
          </View>

          <View style={styles.ratingSection}>
            <AppText variant="body" style={styles.ratingLabel}>
              Service & Item Condition:
            </AppText>
            {renderStars('Service', serviceRating, setServiceRating)}
          </View>

          <TextInput
            accessibilityLabel="Optional comments input"
            accessibilityHint="Share details about delivery or bottle conditions"
            style={[
              styles.commentInput,
              {
                color: theme.colors.text,
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
              },
            ]}
            placeholder="Any suggestions or comments? (optional, max 500 chars)"
            placeholderTextColor={theme.colors.textMuted}
            value={comments}
            onChangeText={(txt) => setComments(txt.slice(0, 500))}
            multiline
            numberOfLines={3}
          />
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.charCounter}>
            {comments.length}/500
          </AppText>

          <View style={styles.buttonRow}>
            <View style={styles.btnWrapper}>
              <Button
                label="Dismiss"
                variant="secondary"
                onPress={dismissPrompt}
              />
            </View>
            <View style={styles.btnWrapper}>
              <Button
                label="Submit Feedback"
                variant="primary"
                loading={status === 'submitting'}
                onPress={handleSubmit}
              />
            </View>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: spacing.lg,
    borderRadius: 16,
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  ratingSection: {
    marginBottom: spacing.md,
  },
  ratingLabel: {
    fontWeight: '500',
    marginBottom: 4,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
  },
  starTouchArea: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  star: {
    fontSize: 32,
  },
  starActive: {
    color: '#F59E0B',
  },
  starInactive: {
    color: '#D1D5DB',
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    height: 80,
    textAlignVertical: 'top',
    marginTop: spacing.xs,
  },
  charCounter: {
    textAlign: 'right',
    marginTop: 4,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnWrapper: {
    flex: 1,
  },
});
