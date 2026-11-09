import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useTheme } from '@/theme/useTheme';
import { useWholesalerStore } from '@/store/wholesalerStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { formatMoney } from '@/utils/formatMoney';
import { matchCustomer } from '@/utils/searchUtils';

import { WholesalerCustomer } from '@/types/wholesaler.types';

// Modals
import { AddCustomerModal } from '@/components/wholesaler/AddCustomerModal';
import { RecordPaymentModal } from '@/components/wholesaler/RecordPaymentModal';
import { CustomerLedgerModal } from '@/components/wholesaler/CustomerLedgerModal';
import { CustomerReturnModal } from '@/components/wholesaler/CustomerReturnModal';

export default function WholesalerOperationsScreen() {
  const { colors, spacing } = useTheme();
  const {
    customers,
    inventory,
    metrics,
    loadCustomers,
    loadInventory,
    loadDashboard,
    addCustomer,
    recordCustomerPayment,
    recordCustomerReturn,
  } = useWholesalerStore();

  const { signOut, profile } = useAuthStore();
  const unreadMessagesCount = useChatStore((s) => s.unreadCount);

  const [refreshing, setRefreshing] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [showCustomerReturn, setShowCustomerReturn] = useState(false);
  const [selectedCustomerForLedger, setSelectedCustomerForLedger] = useState<WholesalerCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => matchCustomer(c, customerSearch));
  }, [customers, customerSearch]);

  const initData = useCallback(async () => {
    await Promise.allSettled([
      loadCustomers(),
      loadInventory(),
      loadDashboard(),
      useChatStore.getState().fetchUnreadCount(),
    ]);
  }, [loadCustomers, loadInventory, loadDashboard]);

  useEffect(() => {
    void initData();
  }, [initData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await initData();
    setRefreshing(false);
  };

  return (
    <Screen title="Wholesaler Operations" scroll={false}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md, flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Wholesaler Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarBox}>
              <Ionicons name="storefront" size={24} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
                {profile?.full_name || 'Beverage Wholesaler'}
              </AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {profile?.email}
              </AppText>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <AppText style={styles.activeText}>Owner / Operator (Active)</AppText>
              </View>
            </View>
            <Pressable
              style={styles.signOutBtn}
              onPress={() => void signOut()}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
            >
              <Ionicons name="log-out-outline" size={16} color="#ef4444" style={{ marginRight: 4 }} />
              <AppText variant="caption" style={{ color: '#ef4444', fontWeight: '700' }}>
                Sign Out
              </AppText>
            </Pressable>
          </View>
        </Card>

        {/* CUSTOMERS & LOAN KHATA SECTION */}
        <View style={styles.sectionContainer}>
          {/* Header Title & Loan Khata Summary */}
          <View style={styles.titleSummaryBox}>
            <AppText variant="subtitle" style={styles.boldText}>
              Retail Shop Customers ({customers.length})
            </AppText>
            <AppText variant="caption" muted style={{ marginTop: 2 }}>
              Total Loan Khata Due:{' '}
              <AppText
                variant="caption"
                style={{
                  color: (metrics?.total_customer_receivables || 0) > 0 ? colors.error : colors.success,
                  fontWeight: '700',
                }}
              >
                {formatMoney(metrics?.total_customer_receivables || 0)}
              </AppText>
            </AppText>
          </View>

          {/* Action Buttons Row: Return, Receive Cash, Messages, + Customer */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}
              onPress={() => setShowCustomerReturn(true)}
            >
              <Ionicons name="arrow-undo-outline" size={14} color="#475569" style={{ marginRight: 3 }} />
              <AppText style={[styles.actionBtnText, { color: '#334155' }]}>Return</AppText>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
              onPress={() => setShowRecordPayment(true)}
            >
              <Ionicons name="cash-outline" size={14} color="#059669" style={{ marginRight: 3 }} />
              <AppText style={[styles.actionBtnText, { color: '#059669' }]}>Cash</AppText>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
              onPress={() => {
                router.push('/(app)/messages');
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="chatbubbles" size={14} color="#2563eb" style={{ marginRight: 3 }} />
                <AppText style={[styles.actionBtnText, { color: '#2563eb' }]}>Chat</AppText>
              </View>
              {unreadMessagesCount > 0 && (
                <View style={styles.actionBadge}>
                  <AppText style={styles.actionBadgeText}>
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </AppText>
                </View>
              )}
            </Pressable>

            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setShowAddCustomer(true)}
            >
              <Ionicons name="add" size={15} color="#ffffff" style={{ marginRight: 1 }} />
              <AppText style={[styles.actionBtnText, { color: '#ffffff' }]}>+ Customer</AppText>
            </Pressable>
          </View>

          {/* Customer Search Bar (when customers exist) */}
          {customers.length > 0 && (
            <View style={styles.searchRow}>
              <View style={styles.searchInputWrapper}>
                <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search customer by name, contact, phone..."
                  placeholderTextColor={colors.textMuted}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  clearButtonMode="while-editing"
                />
                {customerSearch.length > 0 && (
                  <Pressable
                    onPress={() => setCustomerSearch('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear customer search"
                  >
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Customers List */}
          {customers.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="people-outline" size={36} color={colors.textMuted} />
              <AppText variant="body" muted style={{ marginTop: 8 }}>
                No retail shops registered yet.
              </AppText>
              <AppText variant="caption" muted style={{ marginTop: 4 }}>
                Tap &apos;+ Customer&apos; above to add your first retail shop.
              </AppText>
            </Card>
          ) : filteredCustomers.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="search-outline" size={36} color={colors.textMuted} />
              <AppText variant="body" muted style={{ marginTop: 8 }}>
                No customers matching &quot;{customerSearch}&quot;
              </AppText>
              <Pressable
                onPress={() => setCustomerSearch('')}
                style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 10 }}
              >
                <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                  Clear Search
                </AppText>
              </Pressable>
            </Card>
          ) : (
            filteredCustomers.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setSelectedCustomerForLedger(c)}
              >
                <Card style={styles.itemCard}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <AppText variant="body" style={styles.boldText} numberOfLines={1}>
                      {c.name}
                    </AppText>
                    {c.owner_name && (
                      <AppText variant="caption" muted numberOfLines={1}>
                        Contact: {c.owner_name}
                      </AppText>
                    )}
                    {c.phone && (
                      <AppText variant="caption" muted numberOfLines={1}>
                        Phone: {c.phone}
                      </AppText>
                    )}
                    {c.address && (
                      <AppText variant="caption" muted numberOfLines={1}>
                        Location: {c.address}
                      </AppText>
                    )}
                  </View>

                  <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <AppText variant="caption" muted>Loan Khata Balance</AppText>
                    <AppText
                      variant="subtitle"
                      style={[
                        styles.boldText,
                        c.current_balance > 0 ? { color: colors.error } : { color: colors.success },
                      ]}
                    >
                      {formatMoney(c.current_balance)}
                    </AppText>
                    <Pressable
                      style={styles.payBtn}
                      onPress={() => setSelectedCustomerForLedger(c)}
                    >
                      <AppText variant="caption" color="primary" style={{ fontWeight: '600' }}>
                        View Ledger
                      </AppText>
                    </Pressable>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>

        {/* Modals */}
        <AddCustomerModal
          visible={showAddCustomer}
          onClose={() => setShowAddCustomer(false)}
          onSubmit={addCustomer}
        />

        <RecordPaymentModal
          visible={showRecordPayment}
          customers={customers}
          onClose={() => setShowRecordPayment(false)}
          onSubmit={recordCustomerPayment}
        />

        <CustomerLedgerModal
          visible={Boolean(selectedCustomerForLedger)}
          customer={selectedCustomerForLedger}
          onClose={() => setSelectedCustomerForLedger(null)}
          onRecordPayment={() => setShowRecordPayment(true)}
        />

        <CustomerReturnModal
          visible={showCustomerReturn}
          customers={customers}
          inventory={inventory}
          onClose={() => setShowCustomerReturn(false)}
          onSubmit={recordCustomerReturn}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 40 },
  profileCard: { padding: 14, borderRadius: 12, marginBottom: 14 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f4f8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: { flex: 1, marginHorizontal: 12 },
  boldText: { fontWeight: '700' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981', marginRight: 4 },
  activeText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  sectionContainer: { marginTop: 2 },
  titleSummaryBox: { marginBottom: 10 },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  searchRow: {
    marginBottom: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBadge: {
    backgroundColor: '#25D366',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    marginLeft: 4,
  },
  actionBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  payBtn: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: '#f0f4f8',
    borderRadius: 4,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
});
