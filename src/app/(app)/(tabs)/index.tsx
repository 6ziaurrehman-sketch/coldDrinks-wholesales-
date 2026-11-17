import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
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
import { WholesalerCustomer, WholesalerTopSellingItem } from '@/types/wholesaler.types';
import { wholesalerService } from '@/lib/wholesalerService';

// Operations Modals
import { AddCustomerModal } from '@/components/wholesaler/AddCustomerModal';
import { RecordPaymentModal } from '@/components/wholesaler/RecordPaymentModal';
import { CustomerLedgerModal } from '@/components/wholesaler/CustomerLedgerModal';
import { CustomerReturnModal } from '@/components/wholesaler/CustomerReturnModal';
import { ShopDetailModal } from '@/components/wholesaler/ShopDetailModal';
import { ProductSalesDetailModal } from '@/components/wholesaler/ProductSalesDetailModal';

const RANGE_OPTIONS = [
  { key: '1_day', label: '1 Day (Today)', title: "Today's Sales", cashSubtitle: 'Received today', icon: 'today-outline' },
  { key: '3_days', label: 'Last 3 Days', title: '3 Days Sales', cashSubtitle: 'Past 3 days', icon: 'time-outline' },
  { key: '7_days', label: 'This Week (7 Days)', title: 'Weekly Sales', cashSubtitle: 'Past 7 days', icon: 'calendar-outline' },
  { key: '30_days', label: 'This Month (30 Days)', title: 'Monthly Sales', cashSubtitle: 'Past 30 days', icon: 'calendar-number-outline' },
  { key: 'year', label: 'This Year (365 Days)', title: 'Yearly Sales', cashSubtitle: 'Past 365 days', icon: 'stats-chart-outline' },
  { key: 'all', label: 'All Time (Lifetime)', title: 'Total Sales', cashSubtitle: 'Lifetime cash', icon: 'infinite-outline' },
] as const;

const KHATA_PERIOD_OPTIONS = [
  { key: 'all', label: 'All Khata' },
  { key: 'today', label: 'Today' },
  { key: '3_days', label: 'Last 3 Days' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
] as const;

const CARTON_PERIOD_OPTIONS = [
  { key: 'today', label: 'Today', icon: 'today-outline' },
  { key: 'yesterday', label: 'Yesterday', icon: 'time-outline' },
  { key: 'week', label: 'This Week', icon: 'calendar' },
  { key: '3_days', label: 'Last 3 Days', icon: 'calendar-outline' },
  { key: 'month', label: 'This Month', icon: 'calendar-number-outline' },
  { key: 'all', label: 'All Time', icon: 'infinite-outline' },
] as const;

type CartonPeriodKey = 'today' | 'yesterday' | '3_days' | 'week' | 'month' | 'all';

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
  const [selectedShopForDetail, setSelectedShopForDetail] = useState<WholesalerCustomer | null>(null);
  const [paymentTargetCustomerId, setPaymentTargetCustomerId] = useState<string | undefined>(undefined);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerViewTab, setCustomerViewTab] = useState<'khata' | 'carton_sales' | 'all_shops'>('khata');
  const [khataPeriod, setKhataPeriod] = useState<'all' | 'today' | '3_days' | 'week' | 'month'>('all');

  // Carton Sales state
  const [cartonPeriod, setCartonPeriod] = useState<CartonPeriodKey>('today');
  const [topSellingItems, setTopSellingItems] = useState<WholesalerTopSellingItem[]>([]);
  const [loadingTopSelling, setLoadingTopSelling] = useState(false);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<WholesalerTopSellingItem | null>(null);
  const [selectedProductRank, setSelectedProductRank] = useState<number>(1);

  useEffect(() => {
    let ignore = false;
    wholesalerService
      .getTopSellingProducts(cartonPeriod, 100)
      .then((items) => {
        if (!ignore) {
          setTopSellingItems(items || []);
          setLoadingTopSelling(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('Error loading carton sales:', err);
          setLoadingTopSelling(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [cartonPeriod]);

  const currentOption = RANGE_OPTIONS.find((o) => o.key === metricsRange) || RANGE_OPTIONS[0];

  // Active Loan Khata: ONLY stores whose loan khata is strictly MORE THAN ZERO (> 0)
  const activeKhataCustomers = useMemo(() => {
    let list = customers.filter((c) => Number(c.current_balance || 0) > 0);

    if (khataPeriod !== 'all') {
      const now = new Date();
      const threshold = new Date();
      if (khataPeriod === 'today') {
        threshold.setHours(0, 0, 0, 0);
      } else if (khataPeriod === '3_days') {
        threshold.setDate(now.getDate() - 2);
        threshold.setHours(0, 0, 0, 0);
      } else if (khataPeriod === 'week') {
        threshold.setDate(now.getDate() - 6);
        threshold.setHours(0, 0, 0, 0);
      } else if (khataPeriod === 'month') {
        threshold.setDate(1);
        threshold.setHours(0, 0, 0, 0);
      }
      list = list.filter((c) => {
        const itemDate = new Date(c.updated_at || c.created_at || 0);
        return itemDate >= threshold;
      });
    }

    if (customerSearch.trim()) {
      list = list.filter((c) => matchCustomer(c, customerSearch));
    }

    // Newest / recently active khata appears at top
    return list.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });
  }, [customers, khataPeriod, customerSearch]);

  // All registered shops directory (regardless of balance)
  const allShopsFiltered = useMemo(() => {
    let list = [...customers];
    if (customerSearch.trim()) {
      list = list.filter((c) => matchCustomer(c, customerSearch));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, customerSearch]);

  // Ranked Carton Sales List (from most sold to least sold)
  const filteredCartonSales = useMemo(() => {
    let list = [...topSellingItems];
    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase().trim();
      list = list.filter(
        (it) =>
          it.product_name.toLowerCase().includes(q) ||
          (it.size_label && it.size_label.toLowerCase().includes(q))
      );
    }
    // Highest carton sales first (top to bottom)
    return list.sort(
      (a, b) =>
        (b.cartons_sold || 0) - (a.cartons_sold || 0) ||
        (b.total_units_sold || 0) - (a.total_units_sold || 0) ||
        (b.total_revenue || 0) - (a.total_revenue || 0)
    );
  }, [topSellingItems, customerSearch]);

  // Carton Sales KPI Summary
  const cartonSalesSummary = useMemo(() => {
    return filteredCartonSales.reduce(
      (acc, it) => {
        acc.totalCartons += Number(it.cartons_sold || 0);
        acc.totalLoose += Number(it.loose_sold || 0);
        acc.totalUnits += Number(it.total_units_sold || 0);
        acc.totalRevenue += Number(it.total_revenue || 0);
        acc.totalProfit += Number(it.total_profit || 0);
        return acc;
      },
      { totalCartons: 0, totalLoose: 0, totalUnits: 0, totalRevenue: 0, totalProfit: 0 }
    );
  }, [filteredCartonSales]);

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
    setLoadingTopSelling(true);
    await Promise.allSettled([
      initData(),
      wholesalerService
        .getTopSellingProducts(cartonPeriod, 100)
        .then((items) => {
          setTopSellingItems(items || []);
        })
        .catch((err) => {
          console.warn('Error refreshing carton sales:', err);
        })
        .finally(() => {
          setLoadingTopSelling(false);
        }),
    ]);
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

          {/* Total Profit Card */}
          <Card style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="trending-up" size={18} color="#059669" />
            </View>
            <AppText variant="caption" numberOfLines={1} style={styles.metricCardTitle}>
              {currentOption.key === 'all'
                ? 'Total Profit'
                : currentOption.key === '1_day'
                ? "Today's Profit"
                : `${currentOption.label.split('(')[0].trim()} Profit`}
            </AppText>
            <AppText
              style={[styles.boldText, styles.metricCardValue, { color: '#059669' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(
                metrics?.today_profit !== undefined
                  ? metrics.today_profit
                  : (metrics?.today_sales_amount || 0) * 0.15
              )}
            </AppText>
            <AppText variant="caption" style={[styles.metricCardSubtitle, { color: '#059669' }]}>
              Wholesale profit margin
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

        {/* OPERATIONS, CARTON SALES & DIRECTORY SECTION */}
        <View style={styles.section}>
          {/* Section Header: Title Row with Add Shop Action */}
          <View style={styles.sectionTitleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" muted style={styles.overviewTitle}>
                SALES, KHATA &amp; DIRECTORY
              </AppText>
            </View>
            <Pressable
              onPress={() => setShowAddCustomer(true)}
              style={styles.addNewShopBtn}
              accessibilityRole="button"
              accessibilityLabel="Add New Retail Shop"
            >
              <Ionicons name="add-circle" size={16} color={colors.primary} style={{ marginRight: 3 }} />
              <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                + Add Shop
              </AppText>
            </Pressable>
          </View>

          {/* Full-width Responsive 3-Tab Switcher Bar */}
          <View style={styles.tabSwitcherRow}>
            {/* Tab 1: Loan Khata */}
            <Pressable
              style={[
                styles.sectionTabBtn,
                customerViewTab === 'khata' && styles.sectionTabBtnActiveKhata,
              ]}
              onPress={() => setCustomerViewTab('khata')}
            >
              <Ionicons
                name="book"
                size={14}
                color={customerViewTab === 'khata' ? '#dc2626' : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <AppText
                variant="caption"
                numberOfLines={1}
                style={[
                  styles.sectionTabText,
                  customerViewTab === 'khata' && { color: '#dc2626', fontWeight: '700' },
                ]}
              >
                Khata
              </AppText>
              <View style={[styles.tabBadge, customerViewTab === 'khata' && { backgroundColor: '#fee2e2' }]}>
                <AppText style={[styles.tabBadgeText, customerViewTab === 'khata' && { color: '#dc2626' }]}>
                  {customers.filter((c) => Number(c.current_balance || 0) > 0).length}
                </AppText>
              </View>
            </Pressable>

            {/* Tab 2: Carton Sales */}
            <Pressable
              style={[
                styles.sectionTabBtn,
                customerViewTab === 'carton_sales' && styles.sectionTabBtnActiveCartons,
              ]}
              onPress={() => setCustomerViewTab('carton_sales')}
            >
              <Ionicons
                name="cube"
                size={14}
                color={customerViewTab === 'carton_sales' ? '#0284c7' : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <AppText
                variant="caption"
                numberOfLines={1}
                style={[
                  styles.sectionTabText,
                  customerViewTab === 'carton_sales' && { color: '#0284c7', fontWeight: '700' },
                ]}
              >
                Carton Sales
              </AppText>
              <View style={[styles.tabBadge, customerViewTab === 'carton_sales' && { backgroundColor: '#e0f2fe' }]}>
                <AppText style={[styles.tabBadgeText, customerViewTab === 'carton_sales' && { color: '#0284c7' }]}>
                  📦
                </AppText>
              </View>
            </Pressable>

            {/* Tab 3: All Shops */}
            <Pressable
              style={[
                styles.sectionTabBtn,
                customerViewTab === 'all_shops' && styles.sectionTabBtnActiveShops,
              ]}
              onPress={() => setCustomerViewTab('all_shops')}
            >
              <Ionicons
                name="storefront"
                size={14}
                color={customerViewTab === 'all_shops' ? colors.primary : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <AppText
                variant="caption"
                numberOfLines={1}
                style={[
                  styles.sectionTabText,
                  customerViewTab === 'all_shops' && { color: colors.primary, fontWeight: '700' },
                ]}
              >
                All Shops
              </AppText>
              <View style={[styles.tabBadge, customerViewTab === 'all_shops' && { backgroundColor: '#dcfce7' }]}>
                <AppText style={[styles.tabBadgeText, customerViewTab === 'all_shops' && { color: colors.primary }]}>
                  {customers.length}
                </AppText>
              </View>
            </Pressable>
          </View>

          {/* TAB 1: LOAN KHATA */}
          {customerViewTab === 'khata' && (
            <>
              {/* Subtitle / summary info */}
              <View style={styles.titleSummaryBox}>
                <View style={styles.summaryTitleRow}>
                  <AppText variant="caption" muted>
                    Total Outstanding Loan Khata:{' '}
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
                  <AppText variant="caption" muted style={{ fontSize: 11 }}>
                    Only shops with balance &gt; 0
                  </AppText>
                </View>

                {/* Khata Time Filter Pills */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.khataFilterScroll}
                >
                  {KHATA_PERIOD_OPTIONS.map((opt) => {
                    const active = khataPeriod === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        style={[
                          styles.khataFilterPill,
                          active && styles.khataFilterPillActive,
                        ]}
                        onPress={() => setKhataPeriod(opt.key)}
                      >
                        <AppText
                          style={[
                            styles.khataFilterText,
                            active && styles.khataFilterTextActive,
                          ]}
                        >
                          {opt.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Search Bar */}
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrapper}>
                  <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search khata stores by name, contact, phone..."
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

              {/* Khata Stores List */}
              {activeKhataCustomers.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Ionicons name="checkmark-done-circle" size={44} color="#10b981" />
                  <AppText variant="subtitle" style={[styles.boldText, { marginTop: 8, color: '#065f46' }]}>
                    {customerSearch ? 'No matching Khata stores' : 'No Outstanding Khata Dues!'}
                  </AppText>
                  <AppText variant="caption" muted style={{ marginTop: 4, textAlign: 'center' }}>
                    {customerSearch
                      ? `No stores with pending balance matching "${customerSearch}"`
                      : 'All retail shop accounts are completely cleared. Zero pending debt in this period.'}
                  </AppText>
                  {customerSearch ? (
                    <Pressable
                      onPress={() => setCustomerSearch('')}
                      style={{ marginTop: 10, paddingVertical: 4, paddingHorizontal: 10 }}
                    >
                      <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                        Clear Search
                      </AppText>
                    </Pressable>
                  ) : null}
                </Card>
              ) : (
                activeKhataCustomers.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setSelectedCustomerForLedger(c)}
                  >
                    <Card style={styles.responsiveCustomerCard}>
                      {/* Top Header: Shop Name & Status + Due Amount */}
                      <View style={styles.cardTopRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <AppText variant="body" style={styles.boldText} numberOfLines={1}>
                              {c.name}
                            </AppText>
                            <View style={styles.pendingBadge}>
                              <AppText style={styles.pendingBadgeText}>KHATA DUE</AppText>
                            </View>
                          </View>
                          {c.owner_name && (
                            <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
                              Contact: {c.owner_name}
                            </AppText>
                          )}
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <AppText variant="caption" muted style={{ fontSize: 10.5 }}>
                            Remaining Khata
                          </AppText>
                          <AppText
                            variant="subtitle"
                            style={[styles.boldText, { color: colors.error, fontSize: 16 }]}
                          >
                            {formatMoney(c.current_balance)}
                          </AppText>
                        </View>
                      </View>

                      {/* Middle Row: Phone & Address (if present) */}
                      {(c.phone || c.address) && (
                        <View style={styles.cardMetaRow}>
                          {c.phone && (
                            <View style={styles.metaItem}>
                              <Ionicons name="call-outline" size={11} color="#64748b" style={{ marginRight: 3 }} />
                              <AppText variant="caption" muted numberOfLines={1}>
                                {c.phone}
                              </AppText>
                            </View>
                          )}
                          {c.address && (
                            <View style={styles.metaItem}>
                              <Ionicons name="location-outline" size={11} color="#64748b" style={{ marginRight: 3 }} />
                              <AppText variant="caption" muted numberOfLines={1}>
                                {c.address}
                              </AppText>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Bottom Row: Full width action toolbar */}
                      <View style={styles.cardActionsToolbar}>
                        {/* Direct Receive Khata Button */}
                        <Pressable
                          style={styles.receiveKhataBtnResponsive}
                          onPress={() => {
                            setPaymentTargetCustomerId(c.id);
                            setShowRecordPayment(true);
                          }}
                        >
                          <Ionicons name="cash" size={14} color="#ffffff" style={{ marginRight: 4 }} />
                          <AppText style={styles.receiveKhataBtnText}>
                            Receive Khata
                          </AppText>
                        </Pressable>

                        <View style={styles.cardSecondaryActionsRow}>
                          {/* Ledger Button */}
                          <Pressable
                            style={styles.customerActionBtnResponsive}
                            onPress={() => setSelectedCustomerForLedger(c)}
                          >
                            <Ionicons name="document-text-outline" size={13} color={colors.primary} style={{ marginRight: 3 }} />
                            <AppText variant="caption" color="primary" style={{ fontWeight: '700', fontSize: 11 }}>
                              Ledger
                            </AppText>
                          </Pressable>

                          {/* 360 Shop Details */}
                          <Pressable
                            style={[styles.customerActionBtnResponsive, { backgroundColor: '#f3e8ff' }]}
                            onPress={() => setSelectedShopForDetail(c)}
                          >
                            <Ionicons name="stats-chart" size={13} color="#7c3aed" style={{ marginRight: 3 }} />
                            <AppText style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>
                              Profile
                            </AppText>
                          </Pressable>

                          {/* Message / Chat */}
                          <Pressable
                            style={styles.chatIconBtnResponsive}
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
                            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#2563eb" />
                          </Pressable>
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
          )}

          {/* TAB 2: CARTON SALES (DRINK SALES RANKING) */}
          {customerViewTab === 'carton_sales' && (
            <>
              {/* Time Period Filter Pills */}
              <View style={styles.titleSummaryBox}>
                <View style={styles.summaryTitleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AppText variant="caption" muted style={{ fontWeight: '700' }}>
                      DRINK SALES PERIOD:
                    </AppText>
                    {loadingTopSelling && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />
                    )}
                  </View>
                  <AppText variant="caption" muted style={{ fontSize: 11 }}>
                    Ranked by cartons sold (most to least)
                  </AppText>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.khataFilterScroll}
                >
                  {CARTON_PERIOD_OPTIONS.map((opt) => {
                    const active = cartonPeriod === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        style={[
                          styles.cartonFilterPill,
                          active && styles.cartonFilterPillActive,
                        ]}
                        onPress={() => {
                          setLoadingTopSelling(true);
                          setCartonPeriod(opt.key);
                        }}
                      >
                        <Ionicons
                          name={opt.icon as any}
                          size={12}
                          color={active ? '#ffffff' : '#64748b'}
                          style={{ marginRight: 4 }}
                        />
                        <AppText
                          style={[
                            styles.khataFilterText,
                            active && styles.khataFilterTextActive,
                          ]}
                        >
                          {opt.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* KPI Summary Banner Card */}
              <Card style={styles.cartonSummaryBanner}>
                <View style={styles.cartonSummaryHeader}>
                  <Ionicons name="stats-chart" size={15} color="#0284c7" style={{ marginRight: 6 }} />
                  <AppText style={styles.cartonSummaryTitle}>
                    {CARTON_PERIOD_OPTIONS.find((o) => o.key === cartonPeriod)?.label || 'Today'} Drinks Volume Summary
                  </AppText>
                </View>
                <View style={styles.cartonSummaryRow}>
                  <View style={styles.cartonSummaryCol}>
                    <AppText variant="caption" muted style={{ fontSize: 10.5 }}>Cartons Sold</AppText>
                    <AppText style={styles.cartonSummaryBigText}>
                      {cartonSalesSummary.totalCartons}{' '}
                      <AppText style={{ fontSize: 12, color: '#0284c7', fontWeight: '700' }}>ctn</AppText>
                    </AppText>
                    <AppText variant="caption" muted style={{ fontSize: 10 }}>
                      {cartonSalesSummary.totalUnits.toLocaleString()} units
                    </AppText>
                  </View>

                  <View style={styles.cartonSummaryDivider} />

                  <View style={styles.cartonSummaryCol}>
                    <AppText variant="caption" muted style={{ fontSize: 10.5 }}>Total Revenue</AppText>
                    <AppText style={[styles.cartonSummaryBigText, { color: '#0f172a' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {formatMoney(cartonSalesSummary.totalRevenue)}
                    </AppText>
                    <AppText variant="caption" muted style={{ fontSize: 10 }}>
                      Gross sales
                    </AppText>
                  </View>

                  <View style={styles.cartonSummaryDivider} />

                  <View style={styles.cartonSummaryCol}>
                    <AppText variant="caption" muted style={{ fontSize: 10.5 }}>Total Profit</AppText>
                    <AppText style={[styles.cartonSummaryBigText, { color: '#059669' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {formatMoney(cartonSalesSummary.totalProfit)}
                    </AppText>
                    <AppText variant="caption" style={{ color: '#059669', fontSize: 10, fontWeight: '600' }}>
                      Net profit
                    </AppText>
                  </View>
                </View>
              </Card>

              {/* Search Bar for Drinks */}
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrapper}>
                  <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search drink (e.g. Pepsi, 7up, Next, Gourmet)..."
                    placeholderTextColor={colors.textMuted}
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    clearButtonMode="while-editing"
                  />
                  {customerSearch.length > 0 && (
                    <Pressable
                      onPress={() => setCustomerSearch('')}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>

              {/* List of Top Selling Drinks */}
              {loadingTopSelling && filteredCartonSales.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <AppText variant="caption" muted style={{ marginTop: 8 }}>
                    Loading carton sales...
                  </AppText>
                </Card>
              ) : filteredCartonSales.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Ionicons name="cube-outline" size={38} color="#94a3b8" />
                  <AppText variant="subtitle" style={[styles.boldText, { marginTop: 8, color: '#475569' }]}>
                    {customerSearch ? 'No matching drinks found' : 'No Carton Sales in this Period'}
                  </AppText>
                  <AppText variant="caption" muted style={{ marginTop: 4, textAlign: 'center' }}>
                    {customerSearch
                      ? `No drink sales matching "${customerSearch}"`
                      : `No finalized sales slips found for ${CARTON_PERIOD_OPTIONS.find((o) => o.key === cartonPeriod)?.label || cartonPeriod}.`}
                  </AppText>
                  {customerSearch ? (
                    <Pressable
                      onPress={() => setCustomerSearch('')}
                      style={{ marginTop: 10, paddingVertical: 4, paddingHorizontal: 10 }}
                    >
                      <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                        Clear Search
                      </AppText>
                    </Pressable>
                  ) : null}
                </Card>
              ) : (
                filteredCartonSales.map((item, idx) => {
                  const rank = idx + 1;
                  const cartons = Number(item.cartons_sold || 0);
                  const loose = Number(item.loose_sold || 0);
                  const rev = Number(item.total_revenue || 0);
                  const profit = item.total_profit !== undefined && item.total_profit !== null
                    ? Number(item.total_profit)
                    : Math.round(rev * 0.15);

                  return (
                    <Pressable
                      key={`${item.product_name}_${item.size_label}_${idx}`}
                      onPress={() => {
                        setSelectedProductForDetail(item);
                        setSelectedProductRank(rank);
                      }}
                    >
                      <Card style={styles.drinkCard}>
                        <View style={styles.drinkCardTopRow}>
                          {/* Rank badge */}
                          <View
                            style={[
                              styles.drinkRankBadge,
                              rank === 1
                                ? styles.goldRank
                                : rank === 2
                                ? styles.silverRank
                                : rank === 3
                                ? styles.bronzeRank
                                : styles.defaultRank,
                            ]}
                          >
                            <AppText
                              style={[
                                styles.drinkRankText,
                                {
                                  color:
                                    rank === 1
                                      ? '#b45309'
                                      : rank === 2
                                      ? '#475569'
                                      : rank === 3
                                      ? '#c2410c'
                                      : '#64748b',
                                },
                              ]}
                            >
                              #{rank}
                            </AppText>
                          </View>

                          {/* Product Name & Packaging */}
                          <View style={{ flex: 1, marginHorizontal: 8 }}>
                            <AppText variant="body" style={styles.boldText} numberOfLines={1}>
                              {item.product_name}
                            </AppText>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap', gap: 6 }}>
                              {item.size_label && (
                                <View style={styles.sizePillSmall}>
                                  <AppText style={styles.sizePillSmallText}>{item.size_label}</AppText>
                                </View>
                              )}
                              <AppText variant="caption" muted>
                                {item.total_units_sold.toLocaleString()} units sold
                              </AppText>
                            </View>
                          </View>

                          {/* Cartons Sold Highlight Badge */}
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={styles.cartonSoldBadge}>
                              <Ionicons name="cube" size={13} color="#0369a1" style={{ marginRight: 4 }} />
                              <AppText style={styles.cartonSoldText}>
                                {cartons} CTN
                              </AppText>
                            </View>
                            {loose > 0 && (
                              <AppText variant="caption" style={styles.looseText}>
                                + {loose} pcs
                              </AppText>
                            )}
                          </View>
                        </View>

                        {/* Financial Sub-Row & Tap Prompt */}
                        <View style={styles.drinkCardBottomRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <AppText variant="caption" style={{ fontWeight: '600', color: '#1e293b' }}>
                              Rev: {formatMoney(rev)}
                            </AppText>
                            <View style={styles.profitPillSmall}>
                              <Ionicons name="trending-up" size={10} color="#059669" style={{ marginRight: 2 }} />
                              <AppText style={styles.profitPillSmallText}>
                                Profit: {formatMoney(profit)}
                              </AppText>
                            </View>
                          </View>

                          <View style={styles.detailsTapAffordance}>
                            <AppText variant="caption" style={styles.detailsTapText}>
                              Details
                            </AppText>
                            <Ionicons name="chevron-forward" size={12} color="#0284c7" />
                          </View>
                        </View>
                      </Card>
                    </Pressable>
                  );
                })
              )}
            </>
          )}

          {/* TAB 3: ALL SHOPS DIRECTORY */}
          {customerViewTab === 'all_shops' && (
            <>
              {/* Directory Subtitle */}
              <View style={styles.titleSummaryBox}>
                <View style={styles.summaryTitleRow}>
                  <AppText variant="caption" muted>
                    Complete Shop Directory â€¢ {customers.length} retail partners
                  </AppText>
                  <AppText variant="caption" muted style={{ fontSize: 11 }}>
                    Tap any shop for 360Â° Profit &amp; Sales
                  </AppText>
                </View>
              </View>

              {/* Search Bar */}
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrapper}>
                  <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search all shops by name, contact, phone..."
                    placeholderTextColor={colors.textMuted}
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    clearButtonMode="while-editing"
                  />
                  {customerSearch.length > 0 && (
                    <Pressable
                      onPress={() => setCustomerSearch('')}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>

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
              ) : allShopsFiltered.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Ionicons name="search-outline" size={36} color={colors.textMuted} />
                  <AppText variant="body" muted style={{ marginTop: 8 }}>
                    No shops matching &quot;{customerSearch}&quot;
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
                allShopsFiltered.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setSelectedShopForDetail(c)}
                  >
                    <Card style={styles.responsiveCustomerCard}>
                      <View style={styles.cardTopRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <AppText variant="body" style={styles.boldText} numberOfLines={1}>
                              {c.name}
                            </AppText>
                            {Number(c.current_balance || 0) > 0 ? (
                              <View style={styles.pendingBadge}>
                                <AppText style={styles.pendingBadgeText}>KHATA DUE</AppText>
                              </View>
                            ) : (
                              <View style={styles.clearedBadge}>
                                <AppText style={styles.clearedBadgeText}>CLEARED</AppText>
                              </View>
                            )}
                          </View>
                          {c.owner_name && (
                            <AppText variant="caption" muted numberOfLines={1} style={{ marginTop: 2 }}>
                              Contact: {c.owner_name}
                            </AppText>
                          )}
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <AppText variant="caption" muted style={{ fontSize: 10.5 }}>
                            {Number(c.current_balance || 0) > 0 ? 'Khata Balance' : 'Account Status'}
                          </AppText>
                          <AppText
                            variant="subtitle"
                            style={[
                              styles.boldText,
                              Number(c.current_balance || 0) > 0
                                ? { color: colors.error }
                                : { color: colors.success },
                            ]}
                          >
                            {Number(c.current_balance || 0) > 0 ? formatMoney(c.current_balance) : 'Rs 0 (Paid)'}
                          </AppText>
                        </View>
                      </View>

                      {(c.phone || c.address) && (
                        <View style={styles.cardMetaRow}>
                          {c.phone && (
                            <View style={styles.metaItem}>
                              <Ionicons name="call-outline" size={11} color="#64748b" style={{ marginRight: 3 }} />
                              <AppText variant="caption" muted numberOfLines={1}>
                                {c.phone}
                              </AppText>
                            </View>
                          )}
                          {c.address && (
                            <View style={styles.metaItem}>
                              <Ionicons name="location-outline" size={11} color="#64748b" style={{ marginRight: 3 }} />
                              <AppText variant="caption" muted numberOfLines={1}>
                                {c.address}
                              </AppText>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={styles.cardActionsToolbar}>
                        {/* 360 Shop Details & Profit Button */}
                        <Pressable
                          style={styles.shopInsightsBtnResponsive}
                          onPress={() => setSelectedShopForDetail(c)}
                        >
                          <Ionicons name="stats-chart" size={13} color="#7c3aed" style={{ marginRight: 4 }} />
                          <AppText style={styles.shopInsightsBtnText}>
                            Shop Insights & Profit
                          </AppText>
                        </Pressable>

                        <View style={styles.cardSecondaryActionsRow}>
                          {/* Ledger Button */}
                          <Pressable
                            style={styles.customerActionBtnResponsive}
                            onPress={() => setSelectedCustomerForLedger(c)}
                          >
                            <Ionicons name="document-text-outline" size={13} color={colors.primary} style={{ marginRight: 3 }} />
                            <AppText variant="caption" color="primary" style={{ fontWeight: '700', fontSize: 11 }}>
                              Ledger
                            </AppText>
                          </Pressable>

                          {/* Chat Button */}
                          <Pressable
                            style={styles.chatIconBtnResponsive}
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
                            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#2563eb" />
                          </Pressable>
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                ))
              )}
            </>
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
          initialCustomerId={paymentTargetCustomerId}
          onClose={() => {
            setShowRecordPayment(false);
            setPaymentTargetCustomerId(undefined);
          }}
          onSubmit={recordCustomerPayment}
        />

        {Boolean(selectedCustomerForLedger) && (
          <CustomerLedgerModal
            visible={Boolean(selectedCustomerForLedger)}
            customer={selectedCustomerForLedger}
            onClose={() => setSelectedCustomerForLedger(null)}
            onRecordPayment={(cust) => {
              setPaymentTargetCustomerId(cust.id);
              setShowRecordPayment(true);
            }}
          />
        )}

        {Boolean(selectedShopForDetail) && (
          <ShopDetailModal
            visible={Boolean(selectedShopForDetail)}
            customer={selectedShopForDetail}
            onClose={() => setSelectedShopForDetail(null)}
            onReceivePayment={(cust) => {
              setPaymentTargetCustomerId(cust.id);
              setShowRecordPayment(true);
            }}
            onViewLedger={(cust) => {
              setSelectedCustomerForLedger(cust);
            }}
          />
        )}

        <CustomerReturnModal
          visible={showCustomerReturn}
          customers={customers}
          inventory={inventory}
          onClose={() => setShowCustomerReturn(false)}
          onSubmit={recordCustomerReturn}
        />

        {/* Product Sales Detail Modal */}
        <ProductSalesDetailModal
          visible={Boolean(selectedProductForDetail)}
          item={selectedProductForDetail}
          periodLabel={CARTON_PERIOD_OPTIONS.find((o) => o.key === cartonPeriod)?.label || 'Selected Period'}
          rank={selectedProductRank}
          onClose={() => setSelectedProductForDetail(null)}
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
  customerSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    width: '100%',
    marginBottom: 8,
  },
  tabBadge: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    marginLeft: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
  },
  sectionTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    flex: 1,
  },
  sectionTabBtnActiveKhata: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  sectionTabBtnActiveShops: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    elevation: 1,
  },
  sectionTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  addNewShopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  khataFilterScroll: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    paddingBottom: 2,
  },
  khataFilterPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  khataFilterPillActive: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  khataFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  khataFilterTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  receiveKhataBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 4,
  },
  receiveKhataBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  pendingBadge: {
    backgroundColor: '#fef2f2',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 6,
    borderWidth: 0.5,
    borderColor: '#fca5a5',
  },
  pendingBadgeText: {
    color: '#dc2626',
    fontSize: 9.5,
    fontWeight: '700',
  },
  clearedBadge: {
    backgroundColor: '#f0fdf4',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 6,
    borderWidth: 0.5,
    borderColor: '#86efac',
  },
  clearedBadgeText: {
    color: '#16a34a',
    fontSize: 9.5,
    fontWeight: '700',
  },

  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTabBtnActiveCartons: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  cartonFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cartonFilterPillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0369a1',
  },
  summaryTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  cartonSummaryBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 10,
  },
  cartonSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartonSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  cartonSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartonSummaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  cartonSummaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#bae6fd',
  },
  cartonSummaryBigText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0284c7',
    marginTop: 1,
  },
  drinkCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  drinkCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drinkRankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldRank: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  silverRank: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  bronzeRank: {
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  defaultRank: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  drinkRankText: {
    fontSize: 12,
    fontWeight: '800',
  },
  sizePillSmall: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  sizePillSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  cartonSoldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#7dd3fc',
  },
  cartonSoldText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0369a1',
  },
  looseText: {
    color: '#0284c7',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  drinkCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  profitPillSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#a7f3d0',
  },
  profitPillSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  detailsTapAffordance: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsTapText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7',
    marginRight: 2,
  },
  responsiveCustomerCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardActionsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  receiveKhataBtnResponsive: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  cardSecondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chatIconBtnResponsive: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  shopInsightsBtnResponsive: {
    flex: 1.2,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  shopInsightsBtnText: {
    color: '#7c3aed',
    fontSize: 11.5,
    fontWeight: '700',
  },
  customerActionBtnResponsive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 9,
    backgroundColor: '#f0f4f8',
    borderRadius: 8,
  },
});
