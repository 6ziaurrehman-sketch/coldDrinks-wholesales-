import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTemplatesStore } from '@/store/templatesStore';
import { useActiveShopStore } from '@/store/activeShopStore';
import { useCartStore } from '@/store/cartStore';
import { useTheme } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatDate';
import { spacing } from '@/theme/tokens';
import type { OrderTemplate } from '@/types/advancedModules.types';

export default function OrderTemplatesScreen() {
  const theme = useTheme();

  // Atomic Zustand Selectors
  const activeShopId = useActiveShopStore((s) => s.activeShopId);
  const templates = useTemplatesStore((s) => s.templates);
  const status = useTemplatesStore((s) => s.status);
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates);
  const deleteTemplate = useTemplatesStore((s) => s.deleteTemplate);
  const createTemplate = useTemplatesStore((s) => s.createTemplate);
  const cartItems = useCartStore((s) => s.items);

  const [modalVisible, setModalVisible] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  useEffect(() => {
    if (activeShopId) {
      void loadTemplates(activeShopId);
    }
  }, [activeShopId, loadTemplates]);

  const handleSaveFromCart = async () => {
    if (!newTemplateName.trim() || !activeShopId) return;

    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Add items to your cart first to save as a template.');
      return;
    }

    try {
      await createTemplate(
        activeShopId,
        newTemplateName.trim(),
        cartItems.map((ci) => ({ variantId: ci.variantId, quantity: ci.qty })),
      );
      setModalVisible(false);
      setNewTemplateName('');
      Alert.alert('Success', 'Template saved successfully.');
    } catch (err: any) {
      const friendlyError =
        err.message?.includes('duplicate key') || err.message?.includes('unique')
          ? 'A template with this name already exists in this shop. Please choose another name.'
          : 'Unable to save template. Please try again.';
      Alert.alert('Save Template Failed', friendlyError);
    }
  };

  const handleDelete = (template: OrderTemplate) => {
    Alert.alert('Delete Template', `Are you sure you want to delete "${template.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTemplate(template.id);
          } catch {
            Alert.alert('Error', 'Unable to delete template. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <Screen
      title="Order Templates"
      onBack={() => router.back()}
      rightAction={
        <Button
          label="+ New"
          variant="secondary"
          onPress={() => setModalVisible(true)}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenState
          status={
            status === 'loading'
              ? 'loading'
              : status === 'error'
              ? 'error'
              : templates.length === 0
              ? 'empty'
              : 'data'
          }
          errorMessage="Failed to load templates. Please check your internet connection."
          onRetry={() => activeShopId && loadTemplates(activeShopId)}
          data={
            <View>
              {templates.map((tpl) => (
                <Card key={tpl.id} style={styles.tplCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.titleInfo}>
                      <AppText variant="subtitle" style={styles.tplName}>
                        {tpl.name}
                      </AppText>
                      <AppText variant="caption" color={theme.colors.textMuted}>
                        {tpl.itemCount} item(s) • Updated {formatDate(tpl.updatedAt, { timeZone: 'Asia/Karachi' })}
                      </AppText>
                    </View>

                    {tpl.isShared && (
                      <Badge label="Shared" tone="neutral" />
                    )}
                  </View>

                  <View style={styles.cardActions}>
                    <View style={styles.actionBtn}>
                      <Button
                        label="Apply to Cart"
                        variant="primary"
                        onPress={() => router.push('/(app)/cart' as any)}
                      />
                    </View>
                    <View style={styles.actionBtn}>
                      <Button
                        label="Delete"
                        variant="destructive"
                        onPress={() => handleDelete(tpl)}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          }
        />
      </ScrollView>

      {/* Save Template Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <AppText variant="title" style={styles.modalTitle}>
              Save Cart as Template
            </AppText>
            <AppText variant="caption" color={theme.colors.textMuted} style={styles.modalSubtitle}>
              Current cart items ({cartItems.length}) will be saved for fast reordering.
            </AppText>

            <TextInput
              accessibilityLabel="Template name input"
              accessibilityHint="Enter name for your order template"
              style={[
                styles.modalInput,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="Template name (e.g. Weekly Restock)"
              placeholderTextColor={theme.colors.textMuted}
              value={newTemplateName}
              onChangeText={setNewTemplateName}
            />

            <View style={styles.modalButtons}>
              <View style={styles.btnFlex}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setModalVisible(false)}
                />
              </View>
              <View style={styles.btnFlex}>
                <Button
                  label="Save Template"
                  variant="primary"
                  disabled={!newTemplateName.trim()}
                  onPress={handleSaveFromCart}
                />
              </View>
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  tplCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  titleInfo: {
    flex: 1,
  },
  tplName: {
    fontWeight: '700',
    marginBottom: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  modalTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnFlex: {
    flex: 1,
  },
});
