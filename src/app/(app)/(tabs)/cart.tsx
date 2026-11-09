import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useTheme } from '@/theme/useTheme';
import { useWholesalerStore } from '@/store/wholesalerStore';
import { formatMoney } from '@/utils/formatMoney';
import { InventoryItem, WholesalerCustomer, WholesalerSaleItemInput } from '@/types/wholesaler.types';
import { matchInventoryItem, matchCustomer } from '@/utils/searchUtils';

// Modals
import { AddCustomerModal } from '@/components/wholesaler/AddCustomerModal';
import { SalesSlipModal } from '@/components/wholesaler/SalesSlipModal';

interface CartLineItem {
  item: InventoryItem;
  cartons: number;
  loose: number;
  pricePerCarton: number;
  pricePerUnit: number;
}

// Helper to avoid duplicate sizes like "Pepsi 2.5L (2.5L)"
function getDisplayName(productName: string, sizeLabel?: string): string {
  if (!sizeLabel) return productName;
  const pLower = productName.toLowerCase();
  const sLower = sizeLabel.toLowerCase().trim();
  if (pLower.includes(sLower)) {
    return productName;
  }
  return `${productName} (${sizeLabel})`;
}

export default function NewSaleScreen() {
  const { colors, spacing } = useTheme();
  const {
    customers,
    inventory,
    loadCustomers,
    loadInventory,
    finalizeSale,
    addCustomer,
  } = useWholesalerStore();

  const [selectedCustomer, setSelectedCustomer] = useState<WholesalerCustomer | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // YouTube-style Shop Search State
  const [shopQuery, setShopQuery] = useState('');
  const [isShopFocused, setIsShopFocused] = useState(false);
  const [recentShopSearches, setRecentShopSearches] = useState<string[]>([]);

  // YouTube-style Drink Search State
  const [drinkQuery, setDrinkQuery] = useState('');
  const [isDrinkFocused, setIsDrinkFocused] = useState(false);
  const [recentDrinkSearches, setRecentDrinkSearches] = useState<string[]>([]);

  const [cartLines, setCartLines] = useState<CartLineItem[]>([]);
  const [discount, setDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod] = useState<'cash' | 'bank_transfer' | 'credit' | 'partial'>('cash');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [lastReceiptItems, setLastReceiptItems] = useState<any[]>([]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([loadCustomers(), loadInventory()]);
    setRefreshing(false);
  }, [loadCustomers, loadInventory]);

  useEffect(() => {
    void loadCustomers();
    void loadInventory();
  }, [loadCustomers, loadInventory]);

  // Active customer derived from selectedCustomer or first available customer
  const activeCustomer = selectedCustomer ?? (customers.length > 0 ? customers[0] : null);

  // Filter shops for YouTube-style dropdown
  const filteredShops = useMemo(() => {
    return customers.filter((c) => matchCustomer(c, shopQuery));
  }, [customers, shopQuery]);

  // Filter drinks for YouTube-style dropdown (supports "7Up 1.5L", "7Up1.5L", "cartoons", etc.)
  const filteredDrinks = useMemo(() => {
    return inventory.filter(
      (i) => i.is_active !== false && i.status !== 'disabled' && matchInventoryItem(i, drinkQuery)
    );
  }, [inventory, drinkQuery]);

  const handleSelectShop = (customer: WholesalerCustomer) => {
    setSelectedCustomer(customer);
    setShopQuery('');
    setIsShopFocused(false);
    if (!recentShopSearches.includes(customer.name)) {
      setRecentShopSearches([customer.name, ...recentShopSearches.slice(0, 4)]);
    }
  };

  const handleAddProductToSale = (item: InventoryItem) => {
    if (item.is_active === false || item.status === 'disabled') {
      Alert.alert('Disabled Product', `${item.product_name} is currently disabled.`);
      return;
    }

    if (item.total_units <= 0) {
      Alert.alert('Out of Stock', `${item.product_name} is currently out of stock.`);
      return;
    }

    const existingIndex = cartLines.findIndex((l) => l.item.variant_id === item.variant_id);
    if (existingIndex >= 0) {
      const updated = [...cartLines];
      const pieces = Math.max(1, item.pieces_per_carton || 1);
      const newTotalUnits = ((updated[existingIndex].cartons + 1) * pieces) + updated[existingIndex].loose;
      if (newTotalUnits > item.total_units) {
        Alert.alert('Stock Limit', `Cannot exceed available stock of ${item.total_units} units.`);
        return;
      }
      updated[existingIndex].cartons += 1;
      setCartLines(updated);
    } else {
      setCartLines([
        ...cartLines,
        {
          item,
          cartons: 1,
          loose: 0,
          pricePerCarton: item.price_per_carton,
          pricePerUnit: item.price_per_unit,
        },
      ]);
    }

    // Save to recent searches
    const cleanName = getDisplayName(item.product_name, item.size_label);
    if (!recentDrinkSearches.includes(cleanName)) {
      setRecentDrinkSearches([cleanName, ...recentDrinkSearches.slice(0, 4)]);
    }
    setDrinkQuery('');
    setIsDrinkFocused(false);
  };

  const handleUpdateLineQty = (variantId: string, cartonsVal: number, looseVal: number) => {
    const updated = cartLines.map((l) => {
      if (l.item.variant_id === variantId) {
        const pieces = Math.max(1, l.item.pieces_per_carton || 1);
        const totalUnits = (cartonsVal * pieces) + looseVal;
        if (totalUnits > l.item.total_units) {
          Alert.alert(
            'Insufficient Stock',
            `Only ${l.item.total_units} units available (${l.item.available_cartons} ctn${l.item.available_loose_units > 0 ? ` + ${l.item.available_loose_units} bottles` : ''}).`
          );
          return l;
        }
        return { ...l, cartons: Math.max(0, cartonsVal), loose: Math.max(0, looseVal) };
      }
      return l;
    }).filter((l) => l.cartons > 0 || l.loose > 0);

    setCartLines(updated);
  };

  const handleRemoveLine = (variantId: string) => {
    setCartLines(cartLines.filter((l) => l.item.variant_id !== variantId));
  };

  // Calculations
  const subtotal = cartLines.reduce((sum, l) => {
    return sum + (l.cartons * l.pricePerCarton) + (l.loose * l.pricePerUnit);
  }, 0);

  const discountVal = Math.min(parseFloat(discount) || 0, subtotal);
  const finalTotal = Math.max(0, subtotal - discountVal);
  const paidVal = paidAmount !== '' ? parseFloat(paidAmount) || 0 : finalTotal;
  const balanceDue = Math.max(0, finalTotal - paidVal);

  const handleConfirmSale = async () => {
    if (cartLines.length === 0) {
      Alert.alert('Empty Sale', 'Please add at least one product to the sale.');
      return;
    }

    const saleItemsPayload: WholesalerSaleItemInput[] = cartLines.map((l) => ({
      variant_id: l.item.variant_id,
      cartons_qty: l.cartons,
      loose_units_qty: l.loose,
      price_per_carton: l.pricePerCarton,
      price_per_unit: l.pricePerUnit,
    }));

    try {
      setLoading(true);
      const receipt = await finalizeSale({
        customer_id: activeCustomer?.id,
        discount: discountVal,
        paid_amount: paidVal,
        payment_method: balanceDue > 0 && paidVal > 0 ? 'partial' : balanceDue > 0 ? 'credit' : paymentMethod,
        items: saleItemsPayload,
      });

      const snapshotItems = cartLines.map((l) => ({
        product_name_snapshot: l.item.product_name,
        size_label_snapshot: l.item.size_label,
        cartons_qty: l.cartons,
        loose_units_qty: l.loose,
        line_total: (l.cartons * l.pricePerCarton) + (l.loose * l.pricePerUnit),
      }));

      setLastReceiptItems(snapshotItems);
      setActiveReceipt({
        ...receipt,
        customer_name: activeCustomer?.name || receipt.customer_name || 'Retail Shop Customer',
        customer_phone: activeCustomer?.phone || receipt.customer_phone || null,
        sale_date: receipt.sale_date || new Date().toISOString(),
        payment_method: balanceDue > 0 && paidVal > 0 ? 'partial' : balanceDue > 0 ? 'credit' : paymentMethod,
        current_total_balance: (receipt as any).new_balance ?? activeCustomer?.current_balance ?? 0,
      });

      // Clear cart
      setCartLines([]);
      setDiscount('0');
      setPaidAmount('');
    } catch (err: any) {
      Alert.alert('Sale Confirmation Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen title="New Sale (POS)" scroll={false}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md, flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ========================================================================= */}
        {/* STEP 1: SELECT CUSTOMER */}
        {/* ========================================================================= */}
        <View style={styles.sectionHeader}>
          <AppText variant="subtitle" style={styles.boldText}>Select Customer</AppText>
          <Pressable onPress={() => setShowAddCustomer(true)} style={styles.inlineAddBtn}>
            <Ionicons name="add" size={16} color={colors.primary} />
            <AppText variant="caption" color={colors.primary}>New Shop</AppText>
          </Pressable>
        </View>

        {/* Selected Shop Preview */}
        {activeCustomer && !isShopFocused ? (
          <View style={styles.selectedShopCard}>
            <View style={{ flex: 1 }}>
              <AppText variant="body" style={styles.boldText}>
                {activeCustomer.name}
              </AppText>
              {activeCustomer.address && (
                <AppText variant="caption" muted>{activeCustomer.address}</AppText>
              )}
              {activeCustomer.current_balance > 0 ? (
                <AppText variant="caption" style={{ color: colors.error, fontWeight: '600', marginTop: 2 }}>
                  Loan Khata Due: {formatMoney(activeCustomer.current_balance)}
                </AppText>
              ) : (
                <AppText variant="caption" style={{ color: colors.success, marginTop: 2 }}>
                  Loan Khata Clear (Rs. 0)
                </AppText>
              )}
            </View>
            <Pressable
              onPress={() => {
                setIsShopFocused(true);
              }}
              style={styles.changeShopBtn}
            >
              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                Change
              </AppText>
            </Pressable>
          </View>
        ) : (
          <View style={{ position: 'relative', zIndex: 20 }}>
            <Input
              placeholder="Search shop by name..."
              value={shopQuery}
              onChangeText={setShopQuery}
              onFocus={() => setIsShopFocused(true)}
            />

            {/* YouTube-style Shop Suggestions Dropdown */}
            {isShopFocused && (
              <View style={styles.dropdownContainer}>
                {/* Recent Searches */}
                {!shopQuery.trim() && recentShopSearches.length > 0 && (
                  <View style={styles.recentSection}>
                    <AppText variant="caption" muted style={styles.recentHeader}>
                      Recent Searches
                    </AppText>
                    {recentShopSearches.map((name, idx) => {
                      const matched = customers.find((c) => c.name.toLowerCase() === name.toLowerCase());
                      return (
                        <Pressable
                          key={`recent-shop-${idx}`}
                          style={styles.dropdownRow}
                          onPress={() => {
                            if (matched) {
                              handleSelectShop(matched);
                            } else {
                              setShopQuery(name);
                            }
                          }}
                        >
                          <Ionicons name="time-outline" size={17} color="#64748b" style={{ marginRight: 10 }} />
                          <AppText variant="body" style={{ flex: 1, fontSize: 14 }}>{name}</AppText>
                          <Ionicons name="arrow-forward-outline" size={14} color="#94a3b8" />
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {/* Filtered Search Results */}
                {filteredShops.slice(0, 6).map((shop) => (
                  <Pressable
                    key={shop.id}
                    style={styles.dropdownRow}
                    onPress={() => handleSelectShop(shop)}
                  >
                    <Ionicons name="storefront-outline" size={17} color={colors.primary} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="body" style={[styles.boldText, { fontSize: 14 }]}>
                        {shop.name}
                      </AppText>
                      {shop.current_balance > 0 && (
                        <AppText variant="caption" style={{ color: colors.error }}>
                          Loan Khata: {formatMoney(shop.current_balance)}
                        </AppText>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                  </Pressable>
                ))}

                {filteredShops.length === 0 && (
                  <View style={{ padding: 12, alignItems: 'center' }}>
                    <AppText variant="caption" muted>No matching shop found.</AppText>
                  </View>
                )}

                <Pressable
                  style={styles.closeDropdownBtn}
                  onPress={() => setIsShopFocused(false)}
                >
                  <AppText variant="caption" color="primary" style={{ fontWeight: '600' }}>Done / Close</AppText>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: SELECT COLD DRINKS */}
        {/* ========================================================================= */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <AppText variant="subtitle" style={styles.boldText}>Select Cold Drinks</AppText>
        </View>

        <View style={{ position: 'relative', zIndex: 10 }}>
          <Input
            placeholder="Search cold drink (Pepsi, Coke, 1.5L, Sting)..."
            value={drinkQuery}
            onChangeText={setDrinkQuery}
            onFocus={() => setIsDrinkFocused(true)}
          />

          {/* YouTube-style Drink Suggestions Dropdown */}
          {isDrinkFocused && (
            <View style={styles.dropdownContainer}>
              {/* Recent Searches Header */}
              {!drinkQuery.trim() && recentDrinkSearches.length > 0 && (
                <View style={styles.recentSection}>
                  <AppText variant="caption" muted style={styles.recentHeader}>
                    Recent Searches
                  </AppText>
                  {recentDrinkSearches.map((term, idx) => (
                    <Pressable
                      key={`recent-drink-${idx}`}
                      style={styles.dropdownRow}
                      onPress={() => setDrinkQuery(term)}
                    >
                      <Ionicons name="time-outline" size={17} color="#64748b" style={{ marginRight: 10 }} />
                      <AppText variant="body" style={{ flex: 1, fontSize: 14 }}>{term}</AppText>
                      <Ionicons name="arrow-forward-outline" size={14} color="#94a3b8" />
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Matching Drinks */}
              {filteredDrinks.slice(0, 8).map((drink) => (
                <Pressable
                  key={drink.variant_id}
                  style={styles.dropdownRow}
                  onPress={() => handleAddProductToSale(drink)}
                >
                  <Ionicons name="beer-outline" size={18} color={colors.primary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" style={[styles.boldText, { fontSize: 14 }]}>
                      {getDisplayName(drink.product_name, drink.size_label)}
                    </AppText>
                    <AppText variant="caption" muted>
                      {formatMoney(drink.price_per_carton)}/ctn • {drink.available_cartons} ctn in stock
                    </AppText>
                  </View>
                  <View style={styles.addPill}>
                    <Ionicons name="add" size={14} color="#fff" />
                    <AppText style={styles.addPillText}>Add</AppText>
                  </View>
                </Pressable>
              ))}

              {filteredDrinks.length === 0 && (
                <View style={{ padding: 12, alignItems: 'center' }}>
                  <AppText variant="caption" muted>No matching drink found.</AppText>
                </View>
              )}

              <Pressable
                style={styles.closeDropdownBtn}
                onPress={() => setIsDrinkFocused(false)}
              >
                <AppText variant="caption" color="primary" style={{ fontWeight: '600' }}>Done / Close</AppText>
              </Pressable>
            </View>
          )}
        </View>

        {/* ========================================================================= */}
        {/* STEP 3: TOTAL DRINKS */}
        {/* ========================================================================= */}
        <View style={[styles.sectionHeader, { marginTop: 18 }]}>
          <AppText variant="subtitle" style={styles.boldText}>Total Drinks</AppText>
        </View>

        {cartLines.length === 0 ? (
          <Card style={styles.emptyCartCard}>
            <Ionicons name="cart-outline" size={32} color={colors.textMuted} />
            <AppText variant="caption" muted style={{ marginTop: 6 }}>
              Search and select cold drinks above to add them to this sale.
            </AppText>
          </Card>
        ) : (
          cartLines.map((line) => {
            const lineTotal = (line.cartons * line.pricePerCarton) + (line.loose * line.pricePerUnit);
            const cleanTitle = getDisplayName(line.item.product_name, line.item.size_label);

            return (
              <Card key={line.item.variant_id} style={styles.cartLineCard}>
                {/* Header: Name, Selling Price, and Delete */}
                <View style={styles.cartLineHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <AppText variant="body" style={styles.boldText}>
                      {cleanTitle}
                    </AppText>
                    <AppText variant="caption" muted style={{ fontSize: 11, marginTop: 1 }}>
                      Selling Price:{' '}
                      <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
                        {formatMoney(line.pricePerCarton)} / ctn
                      </AppText>
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => handleRemoveLine(line.item.variant_id)}
                    hitSlop={8}
                    style={styles.deleteIconBtn}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.error} />
                  </Pressable>
                </View>

                {/* Separate Row 1: Cartons */}
                <View style={styles.singleItemRow}>
                  <AppText variant="caption" muted style={styles.rowLabelText}>Cartons</AppText>
                  <View style={styles.stepperInline}>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => handleUpdateLineQty(line.item.variant_id, line.cartons - 1, line.loose)}
                    >
                      <Ionicons name="remove" size={15} color="#334155" />
                    </Pressable>
                    <AppText variant="body" style={[styles.boldText, styles.stepValue]}>
                      {line.cartons}
                    </AppText>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => handleUpdateLineQty(line.item.variant_id, line.cartons + 1, line.loose)}
                    >
                      <Ionicons name="add" size={15} color="#334155" />
                    </Pressable>
                  </View>
                </View>

                {/* Separate Row 2: Bottles */}
                <View style={styles.singleItemRow}>
                  <AppText variant="caption" muted style={styles.rowLabelText}>Loose Bottles</AppText>
                  <View style={styles.stepperInline}>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => handleUpdateLineQty(line.item.variant_id, line.cartons, line.loose - 1)}
                    >
                      <Ionicons name="remove" size={15} color="#334155" />
                    </Pressable>
                    <AppText variant="body" style={[styles.boldText, styles.stepValue]}>
                      {line.loose}
                    </AppText>
                    <Pressable
                      style={styles.stepBtn}
                      onPress={() => handleUpdateLineQty(line.item.variant_id, line.cartons, line.loose + 1)}
                    >
                      <Ionicons name="add" size={15} color="#334155" />
                    </Pressable>
                  </View>
                </View>

                {/* Separate Row 3: Total */}
                <View style={[styles.singleItemRow, styles.totalRowBorder]}>
                  <AppText variant="caption" muted style={[styles.rowLabelText, { fontWeight: '600' }]}>Item Total</AppText>
                  <AppText variant="body" style={[styles.boldText, { color: colors.primary, fontSize: 14 }]}>
                    {formatMoney(lineTotal)}
                  </AppText>
                </View>
              </Card>
            );
          })
        )}

        {/* ========================================================================= */}
        {/* STEP 4: TOTALS & SUMMARY */}
        {/* ========================================================================= */}
        {cartLines.length > 0 && (
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <AppText variant="caption" muted style={{ fontSize: 13 }}>Subtotal:</AppText>
              <AppText variant="body" style={[styles.boldText, { fontSize: 14 }]}>{formatMoney(subtotal)}</AppText>
            </View>

            <View style={styles.discountRow}>
              <AppText variant="caption" muted style={{ fontSize: 13 }}>Discount (Rs.):</AppText>
              <Input
                value={discount}
                onChangeText={setDiscount}
                keyboardType="numeric"
                style={{ width: 100 }}
                placeholder="0"
              />
            </View>

            {/* Decreased Payable Total Text & Price */}
            <View style={styles.payableRow}>
              <AppText variant="body" style={styles.boldText}>
                Payable Total:
              </AppText>
              <AppText variant="body" style={[styles.boldText, { color: colors.primary, fontSize: 15 }]}>
                {formatMoney(finalTotal)}
              </AppText>
            </View>

            <View style={styles.discountRow}>
              <AppText variant="body" style={[styles.boldText, { fontSize: 13 }]}>Cash / Paid (Rs.):</AppText>
              <Input
                value={paidAmount}
                onChangeText={setPaidAmount}
                keyboardType="numeric"
                style={{ width: 110 }}
                placeholder={String(finalTotal)}
              />
            </View>

            <View style={styles.summaryRow}>
              <AppText variant="caption" muted style={{ fontSize: 12 }}>Loan Khata Balance Due:</AppText>
              <AppText
                variant="body"
                style={[styles.boldText, { fontSize: 13 }, balanceDue > 0 ? { color: colors.error } : { color: colors.success }]}
              >
                {formatMoney(balanceDue)}
              </AppText>
            </View>

            <View style={{ marginTop: 14 }}>
              <Button
                label={loading ? 'Generating Slip...' : 'Confirm Sale & Print Slip'}
                variant="primary"
                onPress={handleConfirmSale}
                disabled={loading}
              />
            </View>
          </Card>
        )}

        {/* Modals */}
        <AddCustomerModal
          visible={showAddCustomer}
          onClose={() => setShowAddCustomer(false)}
          onSubmit={addCustomer}
          onCustomerAdded={(c) => setSelectedCustomer(c)}
        />

        <SalesSlipModal
          visible={Boolean(activeReceipt)}
          receipt={activeReceipt}
          items={lastReceiptItems}
          onClose={() => setActiveReceipt(null)}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  boldText: { fontWeight: '700' },
  inlineAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Selected Shop Card
  selectedShopCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  changeShopBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },

  // YouTube-style Dropdown
  dropdownContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
  },
  recentSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  recentHeader: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 2,
  },
  addPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  closeDropdownBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },

  // Items in Sale (Total Drinks)
  emptyCartCard: { padding: 24, alignItems: 'center', justifyContent: 'center' },
  cartLineCard: {
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cartLineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  deleteIconBtn: {
    padding: 4,
  },

  // Separate Rows for Cartons, Bottles, and Total
  singleItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabelText: {
    fontSize: 14,
    color: '#334155',
  },
  stepperInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 15,
  },
  totalRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 4,
    paddingTop: 8,
  },

  // Summary
  summaryCard: { padding: 14, marginTop: 12, borderRadius: 12 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  payableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
});
