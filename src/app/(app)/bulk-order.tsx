import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ScreenState } from '@/components/ScreenState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useBulkOrderStore } from '@/store/bulkOrderStore';
import { useCatalogStore } from '@/store/catalogStore';
import { useCartStore } from '@/store/cartStore';
import { useActiveShopStore } from '@/store/activeShopStore';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/formatMoney';
import { spacing } from '@/theme/tokens';
import type { CatalogVariantRef } from '@/lib/bulkOrderService';

export default function BulkOrderScreen() {
  const theme = useTheme();

  // Atomic Zustand Selectors (no whole-store subscriptions)
  const activeShopId = useActiveShopStore((s) => s.activeShopId);
  const rawText = useBulkOrderStore((s) => s.rawText);
  const setRawText = useBulkOrderStore((s) => s.setRawText);
  const parsedLines = useBulkOrderStore((s) => s.parsedLines);
  const mergedCount = useBulkOrderStore((s) => s.mergedCount);
  const status = useBulkOrderStore((s) => s.status);
  const parseInput = useBulkOrderStore((s) => s.parseInput);
  const updateLineQuantity = useBulkOrderStore((s) => s.updateLineQuantity);
  const updateLineVariant = useBulkOrderStore((s) => s.updateLineVariant);
  const removeLine = useBulkOrderStore((s) => s.removeLine);
  const reset = useBulkOrderStore((s) => s.reset);

  const items = useCatalogStore((s) => s.items);
  const fetchCatalog = useCatalogStore((s) => s.refresh);
  const catalogStatus = useCatalogStore((s) => s.status);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const catalogVariants: CatalogVariantRef[] = (items || []).map((v) => ({
    variantId: v.variantId,
    variantName: v.name,
    productName: v.name,
    brand: v.brand,
    unitPrice: v.shopPrice,
    packSize: v.piecesPerUnit || 1,
    saleUnit: v.saleUnit,
    inStock: v.availability !== 'out_of_stock',
  }));

  const handleParse = () => {
    if (!rawText.trim()) {
      Alert.alert('Empty Input', 'Please enter or paste bulk order lines.');
      return;
    }
    parseInput(catalogVariants);
  };

  const validLines = parsedLines.filter((l) => l.status === 'ok' && l.variantId && l.parsedQty > 0);
  const flaggedCount = parsedLines.length - validLines.length;

  const handleAddToCart = async () => {
    if (!activeShopId) {
      Alert.alert('No Active Shop', 'Please select a shop first.');
      return;
    }
    if (validLines.length === 0) {
      Alert.alert('No Valid Items', 'No valid order lines available to add to cart.');
      return;
    }

    const cartStore = useCartStore.getState();
    let addedCount = 0;

    for (const l of validLines) {
      if (l.variantId) {
        try {
          await cartStore.setQty(activeShopId, l.variantId, l.parsedQty);
          addedCount++;
        } catch {
          // Gracefully continue partial add
        }
      }
    }

    Alert.alert(
      'Added to Cart',
      `Successfully added ${addedCount} item(s) to your cart.`,
      [
        { text: 'View Cart', onPress: () => router.push('/(app)/cart' as any) },
        { text: 'Done', onPress: () => reset() },
      ],
    );
  };

  const examplePlaceholder = `Paste or type lines like:\nPepsi 1.5L = 100\nCoke 1L x 50\nSprite 500ml : 25\nگورمے کولا 1.5L = ۱۰`;

  return (
    <Screen
      title="Bulk Quick Order"
      onBack={() => router.back()}
      rightAction={
        parsedLines.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear all bulk order lines"
            onPress={reset}
            hitSlop={8}
            style={styles.minTouchTarget}
          >
            <AppText variant="caption" color={theme.colors.destructive}>
              Clear
            </AppText>
          </Pressable>
        ) : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenState
          status={
            catalogStatus === 'loading'
              ? 'loading'
              : catalogStatus === 'error'
              ? 'error'
              : status === 'reviewed' && parsedLines.length === 0
              ? 'empty'
              : 'data'
          }
          errorMessage="Unable to load catalog products for matching. Check your internet connection."
          onRetry={fetchCatalog}
          data={
            <View>
              {/* Input Section */}
              <Card style={styles.inputCard}>
                <AppText variant="subtitle" style={styles.sectionTitle}>
                  Enter or Paste Order Lines
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted} style={styles.helpText}>
                  {"Supported separators: '=', 'x', ':', commas, or tabs. Urdu numbers supported."}
                </AppText>

                <TextInput
                  accessibilityRole="none"
                  accessibilityLabel="Bulk order lines input"
                  accessibilityHint="Paste product names and quantities here"
                  style={[
                    styles.textArea,
                    {
                      color: theme.colors.text,
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                    },
                  ]}
                  placeholder={examplePlaceholder}
                  placeholderTextColor={theme.colors.textMuted}
                  value={rawText}
                  onChangeText={setRawText}
                  multiline
                  numberOfLines={6}
                />

                <Button
                  label="Parse & Match Lines"
                  variant="primary"
                  onPress={handleParse}
                />
              </Card>

              {/* Results Review Table */}
              {parsedLines.length > 0 && (
                <View style={styles.resultsSection}>
                  {mergedCount > 0 && (
                    <View style={[styles.mergedBanner, { backgroundColor: theme.colors.surface }]}>
                      <AppText variant="caption" color={theme.colors.primary}>
                        ℹ {mergedCount} duplicate product line(s) merged automatically.
                      </AppText>
                    </View>
                  )}

                  <View style={styles.tableHeader}>
                    <AppText variant="subtitle">Review Parsed Lines ({parsedLines.length})</AppText>
                    {flaggedCount > 0 && (
                      <Badge label={`${flaggedCount} flagged`} tone="warning" />
                    )}
                  </View>

                  {parsedLines.map((line, idx) => {
                    const isOk = line.status === 'ok';

                    return (
                      <Card
                        key={idx}
                        style={[
                          styles.lineCard,
                          !isOk && { borderColor: theme.colors.destructive, borderWidth: 1 },
                        ]}
                      >
                        <View style={styles.lineRow}>
                          <View style={styles.lineInfo}>
                            <AppText variant="caption" color={theme.colors.textMuted}>
                              {`Raw: "${line.rawLine}"`}
                            </AppText>

                            {line.productName ? (
                              <AppText variant="body" style={styles.matchedTitle}>
                                {line.productName} ({line.variantName})
                              </AppText>
                            ) : (
                              <AppText variant="body" color={theme.colors.destructive}>
                                {line.status === 'unrecognised'
                                  ? 'Unrecognised Item'
                                  : line.status === 'invalid_qty'
                                  ? 'Invalid Quantity'
                                  : 'Review Needed'}
                              </AppText>
                            )}

                            {line.unitPrice && (
                              <AppText variant="caption" color={theme.colors.textMuted}>
                                {formatMoney(line.unitPrice)} / {line.saleUnit || 'pack'}
                              </AppText>
                            )}
                          </View>

                          {/* Quantity Edit & Status */}
                          <View style={styles.lineActions}>
                            <Badge
                              label={line.status.toUpperCase()}
                              tone={
                                isOk
                                  ? 'success'
                                  : line.status === 'ambiguous'
                                  ? 'warning'
                                  : 'error'
                              }
                            />

                            <View style={styles.qtyControl}>
                              <TextInput
                                accessibilityLabel={`Edit quantity for item ${idx + 1}`}
                                style={[
                                  styles.qtyInput,
                                  {
                                    color: theme.colors.text,
                                    backgroundColor: theme.colors.background,
                                    borderColor: theme.colors.border,
                                  },
                                ]}
                                keyboardType="numeric"
                                value={String(line.parsedQty)}
                                onChangeText={(txt) => {
                                  const num = parseInt(txt, 10);
                                  updateLineQuantity(idx, isNaN(num) ? 0 : num);
                                }}
                              />
                            </View>

                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remove line ${idx + 1}`}
                              onPress={() => removeLine(idx)}
                              hitSlop={8}
                              style={styles.minTouchTarget}
                            >
                              <AppText variant="caption" color={theme.colors.destructive}>
                                Remove
                              </AppText>
                            </Pressable>
                          </View>
                        </View>

                        {/* Ambiguous candidates picker */}
                        {line.status === 'ambiguous' && line.candidates && line.candidates.length > 0 && (
                          <View style={styles.candidatesBox}>
                            <AppText variant="caption" color={theme.colors.warning} style={styles.candidateTitle}>
                              Did you mean:
                            </AppText>
                            {line.candidates.map((cand) => (
                              <Pressable
                                key={cand.variantId}
                                accessibilityRole="button"
                                accessibilityLabel={`Select candidate ${cand.productName} ${cand.variantName}`}
                                onPress={() =>
                                  updateLineVariant(idx, {
                                    variantId: cand.variantId,
                                    variantName: cand.variantName,
                                    productName: cand.productName,
                                    unitPrice: cand.unitPrice,
                                    packSize: cand.packSize,
                                    saleUnit: 'pack',
                                    inStock: true,
                                  })
                                }
                                hitSlop={6}
                                style={styles.candidateRow}
                              >
                                <AppText variant="caption" color={theme.colors.primary}>
                                  • {cand.productName} ({cand.variantName}) - {formatMoney(cand.unitPrice)}
                                </AppText>
                              </Pressable>
                            ))}
                          </View>
                        )}
                      </Card>
                    );
                  })}

                  {/* Bottom Action Bar */}
                  <View style={styles.bottomBar}>
                    <View style={styles.summaryStats}>
                      <AppText variant="body" style={styles.boldText}>
                        Ready to add: {validLines.length} item(s)
                      </AppText>
                    </View>
                    <Button
                      label={`Add ${validLines.length} Valid to Cart`}
                      variant="primary"
                      disabled={validLines.length === 0}
                      onPress={handleAddToCart}
                    />
                  </View>
                </View>
              )}
            </View>
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  inputCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  helpText: {
    marginBottom: spacing.sm,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    height: 120,
    textAlignVertical: 'top',
    fontSize: 14,
    marginBottom: spacing.md,
  },
  resultsSection: {
    marginTop: spacing.sm,
  },
  mergedBanner: {
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  lineCard: {
    marginBottom: spacing.sm,
    padding: spacing.sm,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lineInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  matchedTitle: {
    fontWeight: '600',
    marginTop: 2,
  },
  lineActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  qtyInput: {
    width: 60,
    height: 36,
    borderWidth: 1,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  candidatesBox: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  candidateTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  candidateRow: {
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  bottomBar: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  summaryStats: {
    alignItems: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
  minTouchTarget: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
