import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useTheme } from '@/theme/useTheme';
import { useWholesalerStore } from '@/store/wholesalerStore';
import { useChatStore } from '@/store/chatStore';
import { wholesalerService } from '@/lib/wholesalerService';
import { formatMoney } from '@/utils/formatMoney';
import { WholesalerSaleSummary } from '@/types/wholesaler.types';
import { matchSalesSlip } from '@/utils/searchUtils';
import { supabase } from '@/lib/supabase';
import {
  getKarachiDateKey,
  getTodayAndYesterdayKeys,
  shareSalesSlipsPdf,
  type PdfSalesSlipData,
  type SlipsPerPageOption,
} from '@/utils/salesSlipPdf';

// Modals
import { SalesSlipModal } from '@/components/wholesaler/SalesSlipModal';
import { RecordPaymentModal } from '@/components/wholesaler/RecordPaymentModal';
import {
  IncomingOrderDetailModal,
  IncomingOrderData,
} from '@/components/wholesaler/IncomingOrderDetailModal';
import { DispatchDeliveryModal } from '@/components/wholesaler/DispatchDeliveryModal';

type MainSectionTab = 'incoming_orders' | 'sales_slips';
type StatusFilter = 'all' | 'due' | 'paid' | 'partial';
type DateFilter = 'all' | 'today' | 'week' | 'month';

interface SalesSlipCardProps {
  item: WholesalerSaleSummary;
  primaryColor: string;
  successColor: string;
  errorColor: string;
  selectionMode: boolean;
  isSelected: boolean;
  onOpenReceipt: (item: WholesalerSaleSummary) => void;
  onToggleSelect: (id: string) => void;
  onLongPressSelect: (id: string) => void;
}

const SalesSlipCard = React.memo(function SalesSlipCard({
  item,
  primaryColor,
  successColor,
  errorColor,
  selectionMode,
  isSelected,
  onOpenReceipt,
  onToggleSelect,
  onLongPressSelect,
}: SalesSlipCardProps) {
  const parsed = item.sale_date ? new Date(item.sale_date) : new Date();
  const valid = isNaN(parsed.getTime()) ? new Date() : parsed;
  const formattedTime = valid.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const isFullyPaid = item.balance_due === 0;
  const isPartial = item.paid_amount > 0 && item.balance_due > 0;

  return (
    <Pressable
      onPress={() => (selectionMode ? onToggleSelect(item.id) : onOpenReceipt(item))}
      onLongPress={() => {
        if (!selectionMode) {
          onLongPressSelect(item.id);
        }
      }}
    >
      <Card
        style={[
          styles.card,
          selectionMode && isSelected && {
            borderColor: primaryColor,
            borderWidth: 1.5,
            backgroundColor: '#eff6ff',
          },
        ]}
      >
        <View style={styles.cardHeader}>
          {selectionMode && (
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={22}
              color={isSelected ? primaryColor : '#94a3b8'}
              style={{ marginRight: 8 }}
            />
          )}
          <AppText variant="body" style={styles.shopNameText} numberOfLines={1}>
            {item.customer_name_snapshot}
          </AppText>
          <View
            style={[
              styles.smallBadge,
              {
                backgroundColor: isFullyPaid
                  ? '#ecfdf5'
                  : isPartial
                  ? '#fef3c7'
                  : '#fee2e2',
              },
            ]}
          >
            <AppText
              style={[
                styles.smallBadgeText,
                {
                  color: isFullyPaid
                    ? '#059669'
                    : isPartial
                    ? '#d97706'
                    : '#dc2626',
                },
              ]}
            >
              {isFullyPaid ? 'PAID' : isPartial ? 'PARTIAL' : 'CREDIT'}
            </AppText>
          </View>
        </View>

        <View style={styles.referenceRow}>
          <AppText variant="caption" style={[styles.boldText, { color: primaryColor }]}>
            {item.receipt_no}
          </AppText>
          <AppText variant="caption" muted style={styles.timeText}>
            • {formattedTime}
          </AppText>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <AppText style={styles.miniLabel}>
              Sales Total
            </AppText>
            <AppText style={[styles.boldText, styles.metricValue, { color: primaryColor }]} numberOfLines={1}>
              {formatMoney(item.total_amount)}
            </AppText>
          </View>

          <View style={styles.metricCol}>
            <AppText style={styles.miniLabel}>
              Paid
            </AppText>
            <AppText style={[styles.boldText, styles.metricValue, { color: successColor }]} numberOfLines={1}>
              {formatMoney(item.paid_amount)}
            </AppText>
          </View>

          <View style={[styles.metricCol, { alignItems: 'flex-end' }]}>
            <AppText style={styles.miniLabel}>
              Remaining Due
            </AppText>
            <AppText
              style={[
                styles.boldText,
                styles.metricValue,
                item.balance_due > 0 ? { color: errorColor } : { color: '#94a3b8' },
              ]}
              numberOfLines={1}
            >
              {formatMoney(item.balance_due)}
            </AppText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
});

export default function OrdersAndSlipsScreen() {
  const { colors, spacing } = useTheme();
  const {
    salesHistory,
    customers,
    loadSalesHistory,
    loadCustomers,
    loadInventory,
    recordCustomerPayment,
  } = useWholesalerStore();

  const unreadMessagesCount = useChatStore((s) => s.unreadCount);

  const [activeTab, setActiveTab] = useState<MainSectionTab>('incoming_orders');

  // Incoming Orders State
  const [incomingOrders, setIncomingOrders] = useState<IncomingOrderData[]>([]);
  const [selectedIncomingOrder, setSelectedIncomingOrder] = useState<IncomingOrderData | null>(null);
  const [dispatchingOrder, setDispatchingOrder] = useState<IncomingOrderData | null>(null);

  // Sales Slips State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [receiptItems, setReceiptItems] = useState<any[]>([]);
  const [paymentCustomer, setPaymentCustomer] = useState<any | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Batch PDF Selection & A4 Layout State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(() => new Set());
  const [slipsPerPage, setSlipsPerPage] = useState<SlipsPerPageOption>(4);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectionLabel, setSelectionLabel] = useState<string>('Selected');

  // Fetch Incoming Orders from User Site
  const fetchIncomingOrders = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('orders')
        .select(`
          id,
          order_number,
          shop_id,
          status,
          payment_method,
          payment_status,
          subtotal,
          grand_total,
          notes,
          created_at,
          shop:shops(id, name, owner_name, phone, address),
          items:order_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIncomingOrders(data || []);
    } catch (e) {
      console.warn('Error fetching incoming orders:', e);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([
      loadSalesHistory(undefined, true),
      loadCustomers(true),
      fetchIncomingOrders(),
      loadInventory(undefined, true),
      useChatStore.getState().fetchUnreadCount(),
    ]);
    setRefreshing(false);
  }, [loadSalesHistory, loadCustomers, fetchIncomingOrders, loadInventory]);

  // Auto-reload data when Orders & Slips tab is opened / focused
  useFocusEffect(
    useCallback(() => {
      void loadSalesHistory(undefined, true);
      void fetchIncomingOrders();
      void useChatStore.getState().fetchUnreadCount();
    }, [loadSalesHistory, fetchIncomingOrders])
  );

  useEffect(() => {
    let ignore = false;
    void loadSalesHistory(undefined, true);
    (async () => {
      await Promise.resolve();
      if (!ignore) {
        void fetchIncomingOrders();
      }
    })();

    // Subscribe to real-time incoming orders from user site
    const ordersChannel = supabase
      .channel('wholesaler_realtime_orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          void fetchIncomingOrders();
        }
      )
      .subscribe();

    // Subscribe to real-time sales slip creations and updates
    const salesChannel = supabase
      .channel('wholesaler_realtime_sales')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
        },
        () => {
          void loadSalesHistory(undefined, true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(salesChannel);
    };
  }, [loadSalesHistory, fetchIncomingOrders]);

  // Handle Order Status Update (Accept, Dispatch, Deliver, Reject)
  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: 'processing' | 'out_for_delivery' | 'delivered' | 'cancelled'
  ) => {
    try {
      // 1. Try atomic RPC
      const { error: rpcErr } = await (supabase.rpc as any)('wholesaler_update_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus,
        p_notes: `Status changed to ${newStatus} by Wholesaler`,
      });

      if (rpcErr) {
        console.warn('RPC status update error, attempting direct update:', rpcErr);
        // Fallback direct update to orders table
        const { error: directErr } = await (supabase as any)
          .from('orders')
          .update({
            status: newStatus,
            order_status: newStatus === 'cancelled' ? 'cancelled' : newStatus === 'processing' ? 'confirmed' : 'delivered',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        if (directErr) {
          throw new Error(directErr.message || rpcErr.message || 'Failed to update order status');
        }
      }

      await fetchIncomingOrders();
      await loadSalesHistory(undefined, true);
      await loadInventory(undefined, true);
    } catch (err: any) {
      console.error('Error updating order status:', err);
      const msg = err?.message || 'Could not update order status';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Status Error', msg);
      }
      throw err;
    }
  };

  const handleCardAcceptOrder = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      await handleUpdateOrderStatus(orderId, 'processing');
    } catch {
      // handled in handleUpdateOrderStatus
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleCardRejectOrder = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      await handleUpdateOrderStatus(orderId, 'cancelled');
    } catch {
      // handled in handleUpdateOrderStatus
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleOpenReceipt = useCallback(async (sale: WholesalerSaleSummary) => {
    try {
      const detail = await wholesalerService.getSaleDetail(sale.id);
      setReceiptItems(detail.items || []);
      setSelectedReceipt({
        sale_id: detail.id,
        receipt_no: detail.receipt_no,
        customer_name: detail.customer_name_snapshot,
        customer_phone: detail.customer_phone_snapshot,
        sale_date: detail.sale_date,
        subtotal: detail.subtotal,
        discount: detail.discount,
        total_amount: detail.total_amount,
        paid_amount: detail.paid_amount,
        balance_due: detail.balance_due,
        previous_balance: detail.previous_balance_snapshot,
        current_total_balance: detail.balance_due,
        payment_method: detail.payment_method,
        notes: detail.notes,
      });
    } catch {
      setSelectedReceipt(sale as any);
      setReceiptItems([]);
    }
  }, []);

  // Filtered incoming orders count
  const newOrdersCount = useMemo(() => {
    return incomingOrders.filter((o) => o.status === 'confirmed').length;
  }, [incomingOrders]);

  // Status counts across all sales history
  const counts = useMemo(() => {
    let due = 0;
    let paid = 0;
    let partial = 0;
    for (const item of salesHistory) {
      if (item.balance_due > 0) due++;
      if (item.balance_due === 0) paid++;
      if (item.paid_amount > 0 && item.balance_due > 0) partial++;
    }
    return {
      all: salesHistory.length,
      due,
      paid,
      partial,
    };
  }, [salesHistory]);

  // Filtered sales slips matching search + status + date
  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return salesHistory.filter((item) => {
      if (q && !matchSalesSlip(item, search)) {
        return false;
      }
      if (statusFilter === 'due' && item.balance_due <= 0) return false;
      if (statusFilter === 'paid' && item.balance_due !== 0) return false;
      if (statusFilter === 'partial' && !(item.paid_amount > 0 && item.balance_due > 0)) return false;

      if (dateFilter !== 'all') {
        const itemDate = item.sale_date ? new Date(item.sale_date) : null;
        if (!itemDate || isNaN(itemDate.getTime())) return false;

        if (dateFilter === 'today') {
          const isToday =
            itemDate.getFullYear() === now.getFullYear() &&
            itemDate.getMonth() === now.getMonth() &&
            itemDate.getDate() === now.getDate();
          if (!isToday) return false;
        } else if (dateFilter === 'week') {
          const diffMs = now.getTime() - itemDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays < 0 || diffDays > 7) return false;
        } else if (dateFilter === 'month') {
          const isSameMonth =
            itemDate.getFullYear() === now.getFullYear() &&
            itemDate.getMonth() === now.getMonth();
          if (!isSameMonth) return false;
        }
      }

      return true;
    });
  }, [salesHistory, search, statusFilter, dateFilter]);

  const totals = useMemo(() => {
    let sales = 0;
    let paid = 0;
    let due = 0;
    for (const item of filteredSales) {
      sales += item.total_amount || 0;
      paid += item.paid_amount || 0;
      due += item.balance_due || 0;
    }
    return { sales, paid, due };
  }, [filteredSales]);

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== 'all' || dateFilter !== 'all';

  // Quick Date Counts (Today & Yesterday in Asia/Karachi) for Batch PDF Selection
  const { todayIds, yesterdayIds } = useMemo(() => {
    const { todayKey, yesterdayKey } = getTodayAndYesterdayKeys();
    const tIds: string[] = [];
    const yIds: string[] = [];
    for (const s of salesHistory) {
      const k = s.sale_date ? getKarachiDateKey(s.sale_date) : null;
      if (!k) continue;
      if (k === todayKey) tIds.push(s.id);
      else if (k === yesterdayKey) yIds.push(s.id);
    }
    return { todayIds: tIds, yesterdayIds: yIds };
  }, [salesHistory]);

  const handleEnterSelectionMode = useCallback((initialId?: string) => {
    setIsSelectionMode(true);
    setSelectionLabel('Manual');
    if (initialId) {
      setSelectedSaleIds(new Set([initialId]));
    }
  }, []);

  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedSaleIds(new Set());
  }, []);

  const handleToggleSaleSelect = useCallback((id: string) => {
    setSelectionLabel('Selected');
    setSelectedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectToday = useCallback(() => {
    if (todayIds.length === 0) {
      const msg = 'No sales slips recorded for Today.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('No Slips Today', msg);
      return;
    }
    setSearch('');
    setStatusFilter('all');
    setDateFilter('all');
    setSelectionLabel('Today');
    setSelectedSaleIds(new Set(todayIds));
  }, [todayIds]);

  const handleSelectYesterday = useCallback(() => {
    if (yesterdayIds.length === 0) {
      const msg = 'No sales slips recorded for Yesterday.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('No Slips Yesterday', msg);
      return;
    }
    setSearch('');
    setStatusFilter('all');
    setDateFilter('all');
    setSelectionLabel('Yesterday');
    setSelectedSaleIds(new Set(yesterdayIds));
  }, [yesterdayIds]);

  const handleSelectAllVisible = useCallback(() => {
    if (filteredSales.length === 0) return;
    setSelectionLabel('All');
    setSelectedSaleIds(new Set(filteredSales.map((s) => s.id)));
  }, [filteredSales]);

  const handleClearSelection = useCallback(() => {
    setSelectionLabel('Selected');
    setSelectedSaleIds(new Set());
  }, []);

  const handleShareSelectedPdf = useCallback(async () => {
    if (selectedSaleIds.size === 0) {
      const msg = 'Please select at least one sales slip first.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('No Slips Selected', msg);
      return;
    }

    // Preserve visible/chronological list order
    const orderedIds = salesHistory
      .filter((s) => selectedSaleIds.has(s.id))
      .map((s) => s.id);

    if (orderedIds.length === 0) return;

    setExportingPdf(true);
    try {
      const fullSales = await wholesalerService.getSalesDetailsBatch(orderedIds);
      const summaryById = new Map(salesHistory.map((s) => [s.id, s]));

      const pdfSlips: PdfSalesSlipData[] =
        fullSales.length > 0
          ? fullSales.map((detail) => ({
              id: detail.id,
              receipt_no: detail.receipt_no,
              customer_name_snapshot: detail.customer_name_snapshot || 'Walk-in Customer',
              customer_phone_snapshot: detail.customer_phone_snapshot || null,
              sale_date: detail.sale_date,
              subtotal: Number(detail.subtotal || 0),
              discount: Number(detail.discount || 0),
              total_amount: Number(detail.total_amount || 0),
              paid_amount: Number(detail.paid_amount || 0),
              balance_due: Number(detail.balance_due || 0),
              payment_method: detail.payment_method || 'cash',
              items: detail.items || [],
            }))
          : orderedIds
              .map((id) => summaryById.get(id))
              .filter((s): s is WholesalerSaleSummary => Boolean(s))
              .map((s) => ({
                id: s.id,
                receipt_no: s.receipt_no,
                customer_name_snapshot: s.customer_name_snapshot || 'Walk-in Customer',
                customer_phone_snapshot: s.customer_phone_snapshot || null,
                sale_date: s.sale_date,
                subtotal: Number(s.total_amount || 0),
                discount: 0,
                total_amount: Number(s.total_amount || 0),
                paid_amount: Number(s.paid_amount || 0),
                balance_due: Number(s.balance_due || 0),
                payment_method: s.payment_method || 'cash',
                items: [],
              }));

      await shareSalesSlipsPdf({
        slips: pdfSlips,
        slipsPerPage,
        label: selectionLabel,
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate or share PDF.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('PDF Export Failed', msg);
    } finally {
      setExportingPdf(false);
    }
  }, [selectedSaleIds, salesHistory, slipsPerPage, selectionLabel]);

  const selectedCount = selectedSaleIds.size;
  const estimatedPages = selectedCount > 0 ? Math.ceil(selectedCount / slipsPerPage) : 0;

  return (
    <Screen title="Orders & Invoices" scroll={false}>
      <View style={[styles.container, { paddingHorizontal: spacing.md, paddingTop: 4 }]}>
        {/* Top Header Switcher: Incoming Direct Orders vs Sales Slips + Chat Button */}
        <View style={styles.topBarRow}>
          <View style={styles.tabsSwitcher}>
            <Pressable
              style={[
                styles.tabBtn,
                activeTab === 'incoming_orders' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveTab('incoming_orders')}
            >
              <View style={{ position: 'relative', marginRight: 4 }}>
                <Ionicons
                  name="notifications"
                  size={14}
                  color={activeTab === 'incoming_orders' ? '#ffffff' : colors.text}
                />
                {newOrdersCount > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -3,
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                      backgroundColor: activeTab === 'incoming_orders' ? '#fde047' : '#ef4444',
                    }}
                  />
                )}
              </View>
              <AppText
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'incoming_orders' ? '#ffffff' : colors.text },
                ]}
              >
                Incoming
              </AppText>
            </Pressable>

            <Pressable
              style={[
                styles.tabBtn,
                activeTab === 'sales_slips' && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveTab('sales_slips')}
            >
              <Ionicons
                name="receipt"
                size={14}
                color={activeTab === 'sales_slips' ? '#ffffff' : colors.text}
                style={{ marginRight: 4 }}
              />
              <AppText
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'sales_slips' ? '#ffffff' : colors.text },
                ]}
              >
                Sales
              </AppText>
            </Pressable>
          </View>

          {/* Direct Messages Quick Action */}
          <Pressable
            style={[styles.chatLauncherBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
            onPress={() => {
              router.push('/(app)/messages');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="chatbubbles" size={16} color="#2563eb" style={{ marginRight: 4 }} />
              <AppText style={styles.chatLauncherText}>Messages</AppText>
            </View>
            {unreadMessagesCount > 0 && (
              <View style={styles.chatLauncherBadge}>
                <AppText style={styles.chatLauncherBadgeText}>
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </AppText>
              </View>
            )}
          </Pressable>
        </View>

        {/* SECTION 1: INCOMING USER SITE ORDERS */}
        {activeTab === 'incoming_orders' ? (
          <FlatList
            data={incomingOrders}
            keyExtractor={(item) => item.id}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item }) => {
              const isNew = item.status === 'confirmed';
              const isProcessing = item.status === 'processing';
              const isOut = item.status === 'out_for_delivery';
              const isDelivered = item.status === 'delivered';
              const isCancelled = item.status === 'cancelled';
              const isBusy = updatingOrderId === item.id;

              return (
                <Pressable onPress={() => setSelectedIncomingOrder(item)}>
                  <Card style={[styles.orderCard, isNew && styles.orderCardNew]}>
                    {/* SHOP OWNER */}
                    <View style={styles.orderCardHeader}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" muted style={styles.shopOwnerLabel}>
                          Shop Owner
                        </AppText>
                        <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
                          {item.shop?.owner_name || item.shop?.name || 'Customer'}
                        </AppText>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: isNew
                              ? '#ecfdf5'
                              : isProcessing
                              ? '#e0f2fe'
                              : isOut
                              ? '#ede9fe'
                              : isDelivered
                              ? '#ecfdf5'
                              : '#fee2e2',
                          },
                        ]}
                      >
                        <AppText
                          style={[
                            styles.statusBadgeText,
                            {
                              color: isNew
                                ? '#059669'
                                : isProcessing
                                ? '#0284c7'
                                : isOut
                                ? '#7c3aed'
                                : isDelivered
                                ? '#059669'
                                : '#dc2626',
                            },
                          ]}
                        >
                          {isNew ? 'CONFIRMED ✓' : isProcessing ? 'PREPARING' : isCancelled ? 'REJECTED' : isOut ? 'ON THE WAY' : 'DELIVERED'}
                        </AppText>
                      </View>
                    </View>

                    {/* COLD DRINKS NAME & QUANTITY */}
                    <View style={styles.drinkItemsList}>
                      {item.items && item.items.length > 0 ? (
                        item.items.map((it: any, idx: number) => (
                          <View key={it.id || idx} style={styles.drinkItemRow}>
                            <View style={styles.drinkNameCol}>
                              <Ionicons name="wine-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                              <AppText variant="body" style={styles.drinkNameText} numberOfLines={1}>
                                {it.product_name}
                              </AppText>
                            </View>
                            <View style={styles.drinkQtyBadge}>
                              <AppText variant="body" style={[styles.boldText, { color: colors.primary }]}>
                                Qty: {it.qty} {it.sale_unit || 'carton'}
                              </AppText>
                            </View>
                          </View>
                        ))
                      ) : (
                        <AppText variant="caption" muted>
                          No cold drinks items recorded
                        </AppText>
                      )}
                    </View>

                    {/* Cartons and Total Row */}
                    <View style={styles.orderFooterRow}>
                      <View>
                        <AppText variant="caption" muted>Cartons Ordered</AppText>
                        <AppText variant="caption" style={styles.boldText}>
                          {item.items?.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || item.items?.length || 0} Cartons
                        </AppText>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText variant="caption" muted>Grand Total</AppText>
                        <AppText variant="body" style={[styles.boldText, { color: colors.primary }]}>
                          {formatMoney(item.grand_total)}
                        </AppText>
                      </View>
                    </View>

                    {/* 1-TAP ACCEPT, DISPATCH, CANCEL ORDER BUTTONS */}
                    {isNew ? (
                      <View style={styles.orderDecisionRow}>
                        <Pressable
                          disabled={isBusy}
                          style={[styles.decisionBtn, styles.rejectOrderBtn, isBusy && { opacity: 0.6 }, { flex: 0.85 }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            void handleCardRejectOrder(item.id);
                          }}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color="#dc2626" />
                          ) : (
                            <>
                              <Ionicons name="close-circle-outline" size={16} color="#dc2626" style={{ marginRight: 4 }} />
                              <AppText style={styles.rejectOrderBtnText}>Cancel</AppText>
                            </>
                          )}
                        </Pressable>

                        <Pressable
                          disabled={isBusy}
                          style={[styles.decisionBtn, styles.acceptOrderBtn, { backgroundColor: colors.primary }, isBusy && { opacity: 0.6 }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            void handleCardAcceptOrder(item.id);
                          }}
                        >
                          {isBusy ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                              <AppText style={styles.acceptOrderBtnText}>Accept</AppText>
                            </>
                          )}
                        </Pressable>

                        <Pressable
                          disabled={isBusy}
                          style={[styles.decisionBtn, { backgroundColor: '#7c3aed', flex: 1.2 }, isBusy && { opacity: 0.6 }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            setDispatchingOrder(item);
                          }}
                        >
                          <Ionicons name="bicycle-outline" size={16} color="#ffffff" style={{ marginRight: 4 }} />
                          <AppText style={styles.acceptOrderBtnText}>Dispatch</AppText>
                        </Pressable>
                      </View>
                    ) : isProcessing ? (
                      <View style={styles.quickActionRow}>
                        <Pressable
                          style={[styles.chatWithShopBtn, { borderColor: '#cbd5e1' }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            router.push({
                              pathname: '/(app)/messages/[id]',
                              params: {
                                id: item.shop_id,
                                shopId: item.shop_id,
                                shopName: item.shop?.name || item.shop?.owner_name || 'Customer Shop',
                                orderId: item.id,
                              },
                            } as any);
                          }}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#475569" style={{ marginRight: 4 }} />
                          <AppText variant="caption" style={{ color: '#475569', fontWeight: '600' }}>
                            Chat
                          </AppText>
                        </Pressable>

                        <Pressable
                          style={[styles.manageOrderBtn, { backgroundColor: '#7c3aed' }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            setDispatchingOrder(item);
                          }}
                        >
                          <Ionicons name="bicycle-outline" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                          <AppText variant="caption" style={{ color: '#ffffff', fontWeight: '700' }}>
                            Mark Out for Delivery
                          </AppText>
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.quickActionRow}>
                        <Pressable
                          style={[styles.chatWithShopBtn, { borderColor: '#cbd5e1' }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            router.push({
                              pathname: '/(app)/messages/[id]',
                              params: {
                                id: item.shop_id,
                                shopId: item.shop_id,
                                shopName: item.shop?.name || item.shop?.owner_name || 'Customer Shop',
                                orderId: item.id,
                              },
                            } as any);
                          }}
                        >
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#475569" style={{ marginRight: 4 }} />
                          <AppText variant="caption" style={{ color: '#475569', fontWeight: '600' }}>
                            Chat with Shop
                          </AppText>
                        </Pressable>

                        <Pressable
                          style={[styles.manageOrderBtn, { backgroundColor: colors.primary }]}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            setSelectedIncomingOrder(item);
                          }}
                        >
                          <AppText variant="caption" style={{ color: '#ffffff', fontWeight: '700' }}>
                            Manage Order →
                          </AppText>
                        </Pressable>
                      </View>
                    )}
                  </Card>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Card style={styles.emptyCard}>
                <Ionicons name="cart-outline" size={42} color={colors.textMuted} />
                <AppText variant="body" style={[styles.boldText, { marginTop: 12 }]}>
                  No direct user orders yet
                </AppText>
                <AppText variant="caption" muted style={{ marginTop: 4, textAlign: 'center' }}>
                  When retail customers or shops place orders from the user site, they will appear here live in real-time.
                </AppText>
              </Card>
            }
          />
        ) : (
          // SECTION 2: SALES SLIPS & INVOICES
          <View style={{ flex: 1 }}>
            {isSelectionMode && (
              <View style={styles.selectionHeaderBar}>
                <View style={styles.selectionHeaderTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="documents-outline" size={17} color={colors.primary} style={{ marginRight: 6 }} />
                    <AppText style={[styles.boldText, { fontSize: 13, color: '#0f172a' }]}>
                      Select Slips for PDF
                    </AppText>
                    <View style={[styles.selectedCountPill, { backgroundColor: colors.primary }]}>
                      <AppText style={styles.selectedCountPillText}>{selectedCount}</AppText>
                    </View>
                  </View>
                  <Pressable onPress={handleExitSelectionMode} hitSlop={8} style={styles.cancelSelectBtn}>
                    <AppText style={styles.cancelSelectBtnText}>Done</AppText>
                  </Pressable>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.presetRow}
                >
                  <Pressable
                    onPress={handleSelectToday}
                    style={[
                      styles.presetChip,
                      selectionLabel === 'Today' && selectedCount > 0 && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.presetChipText,
                        selectionLabel === 'Today' && selectedCount > 0 && { color: '#ffffff' },
                      ]}
                    >
                      Today ({todayIds.length})
                    </AppText>
                  </Pressable>

                  <Pressable
                    onPress={handleSelectYesterday}
                    style={[
                      styles.presetChip,
                      selectionLabel === 'Yesterday' && selectedCount > 0 && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.presetChipText,
                        selectionLabel === 'Yesterday' && selectedCount > 0 && { color: '#ffffff' },
                      ]}
                    >
                      Yesterday ({yesterdayIds.length})
                    </AppText>
                  </Pressable>

                  <Pressable
                    onPress={handleSelectAllVisible}
                    style={[
                      styles.presetChip,
                      selectionLabel === 'All' && selectedCount > 0 && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.presetChipText,
                        selectionLabel === 'All' && selectedCount > 0 && { color: '#ffffff' },
                      ]}
                    >
                      Select All ({filteredSales.length})
                    </AppText>
                  </Pressable>

                  {selectedCount > 0 && (
                    <Pressable onPress={handleClearSelection} style={styles.clearPresetChip}>
                      <AppText style={styles.clearPresetChipText}>Clear</AppText>
                    </Pressable>
                  )}
                </ScrollView>
              </View>
            )}

            <FlatList
              data={filteredSales}
              keyExtractor={(item) => item.id}
              extraData={{ isSelectionMode, selectedSaleIds }}
              renderItem={({ item }) => (
                <SalesSlipCard
                  item={item}
                  primaryColor={colors.primary}
                  successColor={colors.success}
                  errorColor={colors.error}
                  selectionMode={isSelectionMode}
                  isSelected={selectedSaleIds.has(item.id)}
                  onOpenReceipt={handleOpenReceipt}
                  onToggleSelect={handleToggleSaleSelect}
                  onLongPressSelect={handleEnterSelectionMode}
                />
              )}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS !== 'web'}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: isSelectionMode ? 120 : 60 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[colors.primary]}
                  tintColor={colors.primary}
                />
              }
              ListHeaderComponent={
                <View style={{ marginBottom: 4 }}>
                  {/* Search Bar */}
                  <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="Search slip # or shop..."
                      placeholderTextColor={colors.textMuted}
                      value={search}
                      onChangeText={setSearch}
                      style={[styles.searchInput, { color: colors.text }]}
                    />
                    {search.length > 0 && (
                      <Pressable onPress={() => setSearch('')} hitSlop={10}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>

                  {/* Status Filter Chips */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScroll}
                    style={{ maxHeight: 38, marginBottom: 6 }}
                  >
                    {[
                      { key: 'all', label: `All (${counts.all})` },
                      { key: 'due', label: `Credit / Due (${counts.due})`, highlight: counts.due > 0 },
                      { key: 'paid', label: `Paid (${counts.paid})` },
                      { key: 'partial', label: `Partial (${counts.partial})` },
                    ].map((f) => {
                      const isSel = statusFilter === f.key;
                      return (
                        <Pressable
                          key={f.key}
                          onPress={() => setStatusFilter(f.key as StatusFilter)}
                          style={[
                            styles.chip,
                            isSel
                              ? { backgroundColor: colors.primary, borderColor: colors.primary }
                              : { borderColor: colors.border, backgroundColor: colors.surface },
                          ]}
                        >
                          <AppText
                            variant="caption"
                            style={[
                              styles.chipText,
                              isSel ? { color: '#ffffff' } : { color: f.highlight ? colors.error : colors.text },
                            ]}
                          >
                            {f.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Date Range Filter Pills */}
                  <View style={styles.dateRow}>
                    {[
                      { key: 'all', label: 'All Dates' },
                      { key: 'today', label: 'Today' },
                      { key: 'week', label: 'This Week' },
                      { key: 'month', label: 'This Month' },
                    ].map((d) => {
                      const isSel = dateFilter === d.key;
                      return (
                        <Pressable
                          key={d.key}
                          onPress={() => setDateFilter(d.key as DateFilter)}
                          style={[
                            styles.datePill,
                            isSel
                              ? { backgroundColor: colors.primary, borderColor: colors.primary }
                              : { borderColor: colors.border, backgroundColor: '#f8fafc' },
                          ]}
                        >
                          <AppText
                            style={[
                              styles.datePillText,
                              isSel ? { color: '#ffffff', fontWeight: '700' } : { color: colors.textMuted },
                            ]}
                          >
                            {d.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Summary Strip */}
                  <View style={[styles.summaryStrip, { backgroundColor: '#f1f5f9' }]}>
                    <View style={styles.summaryCol}>
                      <AppText style={styles.miniLabel}>Slips</AppText>
                      <AppText style={[styles.boldText, { fontSize: 13 }]}>{filteredSales.length}</AppText>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryCol}>
                      <AppText style={styles.miniLabel}>Total Value</AppText>
                      <AppText style={[styles.boldText, { color: colors.primary, fontSize: 13 }]} numberOfLines={1}>
                        {formatMoney(totals.sales)}
                      </AppText>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={[styles.summaryCol, { alignItems: 'flex-end' }]}>
                      <AppText style={styles.miniLabel}>Total Due</AppText>
                      <AppText
                        style={[
                          styles.boldText,
                          { fontSize: 13, color: totals.due > 0 ? colors.error : colors.success },
                        ]}
                        numberOfLines={1}
                      >
                        {formatMoney(totals.due)}
                      </AppText>
                    </View>
                  </View>

                  {/* Multi-Slip PDF Share Bar Trigger */}
                  {!isSelectionMode && salesHistory.length > 0 && (
                    <View style={styles.batchLaunchRow}>
                      <AppText variant="caption" muted style={{ flex: 1, fontSize: 11 }}>
                        Tap any slip to view, or select multiple for A4 PDF
                      </AppText>
                      <Pressable
                        onPress={() => handleEnterSelectionMode()}
                        style={({ pressed }) => [styles.batchShareLaunchBtn, pressed && { opacity: 0.85 }]}
                      >
                        <Ionicons name="document-text-outline" size={14} color="#ffffff" style={{ marginRight: 5 }} />
                        <AppText style={styles.batchShareLaunchText}>Select & Share PDF</AppText>
                      </Pressable>
                    </View>
                  )}
                </View>
              }
              ListEmptyComponent={
                <Card style={styles.emptyCard}>
                  <Ionicons name="receipt-outline" size={42} color={colors.textMuted} />
                  <AppText variant="body" style={[styles.boldText, { marginTop: 12 }]}>
                    {salesHistory.length === 0 ? 'No sales slips recorded yet' : 'No matching sales slips found'}
                  </AppText>
                  {hasActiveFilters && (
                    <Pressable
                      style={[styles.resetBtn, { borderColor: colors.primary }]}
                      onPress={() => {
                        setSearch('');
                        setStatusFilter('all');
                        setDateFilter('all');
                      }}
                    >
                      <AppText variant="caption" style={[styles.boldText, { color: colors.primary }]}>
                        Reset All Filters
                      </AppText>
                    </Pressable>
                  )}
                </Card>
              }
            />

            {/* Sticky Bottom Bar for A4 Layout Config & Batch PDF Export */}
            {isSelectionMode && (
              <View style={styles.pdfBottomBar}>
                <View style={styles.a4LayoutRow}>
                  <AppText style={styles.a4LayoutLabel}>Slips per A4 Paper:</AppText>
                  <View style={styles.a4PillsGroup}>
                    {([2, 4, 6] as SlipsPerPageOption[]).map((opt) => {
                      const active = slipsPerPage === opt;
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setSlipsPerPage(opt)}
                          style={[
                            styles.a4OptionPill,
                            active && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                        >
                          <AppText
                            style={[
                              styles.a4OptionPillText,
                              active && { color: '#ffffff', fontWeight: '700' },
                            ]}
                          >
                            {opt} / A4
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.pdfShareActionRow}>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.pdfCountTitle}>
                      {selectedCount} Slip{selectedCount === 1 ? '' : 's'} Selected
                    </AppText>
                    <AppText variant="caption" muted style={{ fontSize: 11 }}>
                      {estimatedPages > 0
                        ? `${estimatedPages} A4 page${estimatedPages === 1 ? '' : 's'} (${slipsPerPage} slips/sheet)`
                        : 'Select Today, Yesterday, All, or tap slips'}
                    </AppText>
                  </View>

                  <Pressable
                    disabled={selectedCount === 0 || exportingPdf}
                    onPress={handleShareSelectedPdf}
                    style={({ pressed }) => [
                      styles.sharePdfBtn,
                      (selectedCount === 0 || exportingPdf) && { opacity: 0.55 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {exportingPdf ? (
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 6 }} />
                    ) : (
                      <Ionicons name="share-social-outline" size={17} color="#ffffff" style={{ marginRight: 6 }} />
                    )}
                    <AppText style={styles.sharePdfBtnText}>
                      {exportingPdf ? 'Creating PDF...' : 'Share PDF'}
                    </AppText>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Incoming Order Detail Modal */}
        <IncomingOrderDetailModal
          visible={Boolean(selectedIncomingOrder)}
          order={selectedIncomingOrder}
          onClose={() => setSelectedIncomingOrder(null)}
          onUpdateStatus={handleUpdateOrderStatus}
        />

        {/* Dispatch Delivery Modal */}
        <DispatchDeliveryModal
          visible={Boolean(dispatchingOrder)}
          order={dispatchingOrder}
          onClose={() => setDispatchingOrder(null)}
          onConfirm={async (orderId) => {
            await handleUpdateOrderStatus(orderId, 'out_for_delivery');
            setDispatchingOrder(null);
          }}
        />

        {/* Sales Slip Receipt Modal */}
        <SalesSlipModal
          visible={Boolean(selectedReceipt)}
          receipt={selectedReceipt}
          items={receiptItems}
          onClose={() => setSelectedReceipt(null)}
        />

        {/* Record Payment Modal */}
        <RecordPaymentModal
          visible={Boolean(paymentCustomer)}
          customers={customers}
          onClose={() => setPaymentCustomer(null)}
          onSubmit={recordCustomerPayment}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  tabsSwitcher: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 6,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chatLauncherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  chatLauncherText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  chatLauncherBadge: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 6,
  },
  chatLauncherBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  orderCard: {
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
  },
  orderCardNew: {
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  shopOwnerLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
    fontWeight: '600',
  },
  drinkItemsList: {
    marginVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  drinkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  drinkNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  drinkNameText: {
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
  drinkQtyBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  orderDecisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  decisionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  rejectOrderBtn: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  rejectOrderBtnText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
  acceptOrderBtn: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  acceptOrderBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  orderNotesText: {
    marginTop: 6,
    color: '#64748b',
    fontStyle: 'italic',
  },
  orderFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  chatWithShopBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  manageOrderBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  datePill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePillText: {
    fontSize: 11,
  },
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  summaryCol: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 8,
  },
  card: { padding: 12, marginBottom: 8, borderRadius: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shopNameText: { fontWeight: '700', fontSize: 15, flex: 1, marginRight: 8, textTransform: 'capitalize' },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  timeText: { marginLeft: 4, fontSize: 11, color: '#64748b' },
  smallBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignSelf: 'center',
  },
  smallBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metricCol: {
    flex: 1,
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  boldText: {
    fontWeight: '700',
  },
  emptyCard: { padding: 32, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  resetBtn: {
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
  },
  batchLaunchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  batchShareLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
  },
  batchShareLaunchText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  selectionHeaderBar: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  selectionHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectedCountPill: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  selectedCountPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  cancelSelectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelSelectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1e293b',
  },
  clearPresetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  clearPresetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#dc2626',
  },
  pdfBottomBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 6,
  },
  a4LayoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  a4LayoutLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  a4PillsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  a4OptionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  a4OptionPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  pdfShareActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pdfCountTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  sharePdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  sharePdfBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
