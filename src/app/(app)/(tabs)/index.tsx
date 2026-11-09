import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Modal, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Badge } from '@/components/ui/Badge';
import { useTheme } from '@/theme/useTheme';
import { useWholesalerStore } from '@/store/wholesalerStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { formatMoney } from '@/utils/formatMoney';
import { getDisplayName, formatStockDisplay } from '@/utils/productUtils';
import { matchCustomer } from '@/utils/searchUtils';
import { WholesalerCustomer } from '@/types/wholesaler.types';

// Operations Modals
import { AddCustomerModal } from '@/components/wholesaler/AddCustomerModal';
import { RecordPaymentModal } from '@/components/wholesaler/RecordPaymentModal';
import { CustomerLedgerModal } from '@/components/wholesaler/CustomerLedgerModal';
import { CustomerReturnModal } from '@/components/wholesaler/CustomerReturnModal';

const RANGE_OPTIONS = [
  { key: '1_day', label: '1 Day (Today)', title: "Today's Sales", cashSubtitle: 'Received today', icon: 'today-outline' },
  { key: '3_days', label: 'Last 3 Days', title: '3 Days Sales', cashSubtitle: 'Past 3 days', icon: 'time-outline' },
  { key: '7_days', label: 'This Week (7 Days)', title: 'Weekly Sales', cashSubtitle: 'Past 7 days', icon: 'calendar-outline' },
  { key: '30_days', label: 'This Month (30 Days)', title: 'Monthly Sales', cashSubtitle: 'Past 30 days', icon: 'calendar-number-outline' },
  { key: 'year', label: 'This Year (365 Days)', title: 'Yearly Sales', cashSubtitle: 'Past 365 days', icon: 'stats-chart-outline' },
  { key: 'all', label: 'All Time (Lifetime)', title: 'Total Sales', cashSubtitle: 'Lifetime cash', icon: 'infinite-outline' },
] as const;

export default function WholesalerDashboardScreen() {
  const { colors, spacing } = useTheme();
  const {
    customers,
    metrics,
    inventory,
    metricsRange,
    loadDashboard,
    loadInventory,
    loadCustomers,
    addCustomer,
    recordCustomerPayment,
    recordCustomerReturn,
  } = useWholesalerStore();

  const { signOut, profile } = useAuthStore();
  const unreadMessagesCount = useChatStore((s) => s.unreadCount);

  const [refreshing, setRefreshing] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // Operations state
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [showCustomerReturn, setShowCustomerReturn] = useState(false);
  const [selectedCustomerForLedger, setSelectedCustomerForLedger] = useState<WholesalerCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  const currentOption = RANGE_OPTIONS.find((o) => o.key === metricsRange) || RANGE_OPTIONS[0];

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => matchCustomer(c, customerSearch));
  }, [customers, customerSearch]);

  const initData = useCallback(async () => {
    await Promise.allSettled([
      loadDashboard(),
      loadInventory(),
      loadCustomers(),
      useChatStore.getState().fetchUnreadCount(),
    ]);
  }, [loadDashboard, loadInventory, loadCustomers]);

  useEffect(() => {
    void initData();
  }, [initData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await initData();
    setRefreshing(false);
  };

  const lowStockItems = useMemo(() => {
    return inventory.filter((i) => i.is_low_stock || i.is_out_of_stock).slice(0, 5);
  }, [inventory]);

  return (
    <Screen
      title="Al Fajar Traders"
      scroll={false}
      rightAction={
        <Pressable
          style={styles.headerSettingsBtn}
          onPress={() => router.push('/(app)/admin/management')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Admin Settings & Analytics"
        >
          <Ionicons name="settings-outline" size={20} color={colors.primary} />
        </Pressable>
      }
    >
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
        {/* Wholesaler Profile & Status Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarBox}>
              <Ionicons name="storefront" size={24} color={colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
                {profile?.full_name || 'Al Fajar Traders'}
              </AppText>
              <AppText variant="caption" muted numberOfLines={1}>
                {profile?.email || 'admin@alfajar.com'}
              </AppText>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <AppText style={styles.activeText} numberOfLines={1}>Admin • Active</AppText>
              </View>
            </View>
            <View style={styles.profileRightActions}>
              <Pressable
                style={styles.settingsPillBtn}
                onPress={() => router.push('/(app)/admin/management')}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Admin Controls"
              >
                <Ionicons name="settings-outline" size={16} color={colors.primary} />
              </Pressable>
              <Pressable
                style={styles.signOutBtn}
                onPress={() => void signOut()}
                accessibilityRole="button"
                accessibilityLabel="Sign Out"
              >
                <Ionicons name="log-out-outline" size={14} color="#ef4444" style={{ marginRight: 3 }} />
                <AppText variant="caption" style={{ color: '#ef4444', fontWeight: '700', fontSize: 11 }}>
                  Sign Out
                </AppText>
              </Pressable>
            </View>
          </View>
        </Card>

        {/* Overview Header & Filter Dropdown */}
        <View style={styles.overviewHeaderRow}>
          <AppText variant="caption" muted style={styles.overviewTitle}>
            BUSINESS OVERVIEW
          </AppText>
          <Pressable
            style={({ pressed }) => [
              styles.dropdownBtn,
              { borderColor: colors.border, backgroundColor: colors.surface },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setShowDropdown(true)}
          >
            <Ionicons name="calendar-outline" size={13} color={colors.primary} style={{ marginRight: 5 }} />
            <AppText variant="caption" style={[styles.boldText, { color: colors.primary, fontSize: 12 }]}>
              {currentOption.label}
            </AppText>
            <Ionicons name="chevron-down" size={13} color={colors.textMuted} style={{ marginLeft: 4 }} />
          </Pressable>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          {/* Sales Card */}
          <Card style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <Ionicons name="cart" size={18} color={colors.primary} />
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.metricCardTitle}>
              {currentOption.title}
            </AppText>
            <AppText
              style={[styles.boldText, styles.metricCardValue]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(metrics?.today_sales_amount || 0)}
            </AppText>
            <AppText variant="caption" style={styles.metricCardSubtitle}>
              {metrics?.today_sales_count || 0} sales slips
            </AppText>
          </Card>

          {/* Cash Collected Card */}
          <Card style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#e6f9f0' }]}>
              <Ionicons name="cash" size={18} color="#10b981" />
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.metricCardTitle}>
              Cash Collected
            </AppText>
            <AppText
              style={[styles.boldText, styles.metricCardValue, { color: '#10b981' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(metrics?.today_cash_collected || 0)}
            </AppText>
            <AppText variant="caption" style={styles.metricCardSubtitle}>
              {currentOption.cashSubtitle}
            </AppText>
          </Card>

          {/* Customer Loan Khata Card */}
          <Card style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="book" size={18} color="#d97706" />
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.metricCardTitle}>
              Loan Khata
            </AppText>
            <AppText
              style={[styles.boldText, styles.metricCardValue, { color: '#d97706' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(metrics?.total_customer_receivables || 0)}
            </AppText>
            <AppText variant="caption" style={styles.metricCardSubtitle}>
              Outstanding debt
            </AppText>
          </Card>

          {/* Total Stock Value Card */}
          <Card style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="layers" size={18} color="#8b5cf6" />
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.metricCardTitle}>
              Stock Valuation
            </AppText>
            <AppText
              style={[styles.boldText, styles.metricCardValue]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(metrics?.total_stock_value || 0)}
            </AppText>
            <AppText variant="caption" style={styles.metricCardSubtitle}>
              {metrics?.total_active_products || 72} products
            </AppText>
          </Card>
        </View>

        {/* OPERATIONS QUICK ACTIONS BAR */}
        <View style={styles.sectionHeader}>
          <AppText variant="caption" muted style={styles.overviewTitle}>
            QUICK OPERATIONS
          </AppText>
        </View>
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setShowAddCustomer(true)}
          >
            <Ionicons name="person-add" size={15} color="#ffffff" style={{ marginRight: 4 }} />
            <AppText style={[styles.actionBtnText, { color: '#ffffff' }]}>+ Customer</AppText>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
            onPress={() => setShowRecordPayment(true)}
          >
            <Ionicons name="cash-outline" size={15} color="#059669" style={{ marginRight: 4 }} />
            <AppText style={[styles.actionBtnText, { color: '#059669' }]}>Receive Cash</AppText>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}
            onPress={() => setShowCustomerReturn(true)}
          >
            <Ionicons name="arrow-undo-outline" size={15} color="#475569" style={{ marginRight: 4 }} />
            <AppText style={[styles.actionBtnText, { color: '#334155' }]}>Return</AppText>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
            onPress={() => {
              router.push('/(app)/messages');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="chatbubbles" size={15} color="#2563eb" style={{ marginRight: 4 }} />
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
        </View>

        {/* Low Stock Alerts */}
        {lowStockItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="subtitle" style={styles.boldText}>
                ⚠️ Attention: Low & Out of Stock ({lowStockItems.length})
              </AppText>
              <Pressable onPress={() => router.push('/(app)/(tabs)/catalog')}>
                <AppText variant="caption" color={colors.primary}>View All</AppText>
              </Pressable>
            </View>
            {lowStockItems.map((item) => (
              <Card key={item.variant_id} style={styles.alertCard}>
                <View style={{ flex: 1 }}>
                  <AppText variant="body" style={styles.boldText}>
                    {getDisplayName(item.product_name, item.size_label)}
                  </AppText>
                  <AppText variant="caption" muted>
                    Remaining: {formatStockDisplay(item.available_cartons, item.available_loose_units)}
                  </AppText>
                </View>
                <Badge
                  label={item.is_out_of_stock ? 'OUT OF STOCK' : 'LOW STOCK'}
                  tone={item.is_out_of_stock ? 'error' : 'warning'}
                />
              </Card>
            ))}
          </View>
        )}

        {/* CUSTOMERS & LOAN KHATA SECTION */}
        <View style={styles.section}>
          <View style={styles.titleSummaryBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="subtitle" style={styles.boldText}>
                Retail Shop Customers ({customers.length})
              </AppText>
              <Pressable
                onPress={() => setShowAddCustomer(true)}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Ionicons name="add-circle" size={18} color={colors.primary} style={{ marginRight: 3 }} />
                <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                  Add New
                </AppText>
              </Pressable>
            </View>
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
              <Pressable
                style={[styles.addFirstBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddCustomer(true)}
              >
                <Ionicons name="add" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                <AppText style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                  Add First Customer
                </AppText>
              </Pressable>
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
                <Card style={styles.customerCard}>
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
                    <View style={styles.customerActionsRow}>
                      <Pressable
                        style={styles.customerActionBtn}
                        onPress={() => setSelectedCustomerForLedger(c)}
                      >
                        <Ionicons name="document-text-outline" size={13} color={colors.primary} style={{ marginRight: 3 }} />
                        <AppText variant="caption" color="primary" style={{ fontWeight: '600', fontSize: 11 }}>
                          Ledger
                        </AppText>
                      </Pressable>
                      <Pressable
                        style={[styles.customerActionBtn, { backgroundColor: '#eff6ff', marginLeft: 6 }]}
                        onPress={() => {
                          router.push({
                            pathname: '/(app)/messages/[id]',
                            params: {
                              id: c.id,
                              shopId: c.id,
                              shopName: c.name || c.owner_name,
                            },
                          } as any);
                        }}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={13} color="#2563eb" />
                      </Pressable>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>

        {/* Time Range Dropdown Modal */}
        <Modal
          visible={showDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDropdown(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowDropdown(false)}>
            <View style={[styles.dropdownSheet, { backgroundColor: colors.surface }]}>
              <View style={styles.dropdownHeader}>
                <AppText variant="subtitle" style={styles.boldText}>
                  Select Overview Period
                </AppText>
                <Pressable onPress={() => setShowDropdown(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>

              {RANGE_OPTIONS.map((opt) => {
                const isSelected = metricsRange === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={({ pressed }) => [
                      styles.rangeOption,
                      isSelected && { backgroundColor: '#f0fdf4' },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => {
                      setShowDropdown(false);
                      void loadDashboard(opt.key);
                    }}
                  >
                    <View style={styles.optionLeft}>
                      <Ionicons
                        name={opt.icon as any}
                        size={18}
                        color={isSelected ? colors.primary : colors.textMuted}
                        style={{ marginRight: 12 }}
                      />
                      <AppText
                        variant="body"
                        style={[
                          styles.optionLabel,
                          isSelected && { color: colors.primary, fontWeight: '700' },
                        ]}
                      >
                        {opt.label}
                      </AppText>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>

        {/* Operations Modals */}
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
  profileRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSettingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  settingsPillBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  overviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  overviewTitle: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  metricCard: { width: '48%', padding: 11, borderRadius: 12, marginBottom: 8 },
  metricIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f4f8', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  metricCardTitle: { fontSize: 11, fontWeight: '500', color: '#64748b', marginBottom: 2 },
  metricCardValue: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  metricCardSubtitle: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  section: { marginTop: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 4,
  },
  actionBtn: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  actionBadge: {
    backgroundColor: '#25D366',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 6,
  },
  actionBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  alertCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, marginBottom: 8, borderColor: '#fed7aa', backgroundColor: '#fffaf5' },
  titleSummaryBox: { marginBottom: 10 },
  searchRow: {
    marginBottom: 10,
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
  customerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
  },
  customerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  customerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 7,
    backgroundColor: '#f0f4f8',
    borderRadius: 4,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 14,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rangeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 14,
  },
});
