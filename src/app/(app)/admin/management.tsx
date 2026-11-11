import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/useTheme';
import { useWholesalerStore } from '@/store/wholesalerStore';
import { formatMoney } from '@/utils/formatMoney';
import { supabase } from '@/lib/supabase';
import { wholesalerService } from '@/lib/wholesalerService';

type MainTab = 'analytics' | 'danger_zone';
type AnalyticsPeriod = 'week' | 'month' | 'all';
type DangerCategory = 'stores' | 'orders' | 'inventory' | 'sales' | 'users';

interface CustomerStoreItem {
  id: string;
  name: string;
  owner_name?: string | null;
  phone?: string | null;
  address?: string | null;
  current_balance?: number;
  created_at?: string;
  is_active?: boolean;
}

interface OrderItem {
  id: string;
  order_number: number;
  shop_name: string;
  shop_id?: string;
  user_id?: string;
  grand_total: number;
  status: string;
  created_at: string;
}

interface ProductItem {
  id: string;
  name: string;
  sku?: string | null;
  packaging_type?: string | null;
  category_name?: string;
  size_label?: string;
  variants_count?: number;
  stock_units?: number;
  price?: number;
}

interface SaleItem {
  id: string;
  receipt_no: string;
  customer_name: string;
  total_amount: number;
  sale_date: string;
  status: string;
}

interface UserProfileItem {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  role: string | null;
  created_at: string;
}

export interface DetailedEntity {
  type: 'shop' | 'user';
  id: string;
  name: string;
  ownerName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  role?: string | null;
  createdAt?: string | null;
  isActive?: boolean;
  currentBalance?: number;
  ordersCount: number;
  totalSpent: number;
  recentOrders: {
    id: string;
    orderNumber: number;
    grandTotal: number;
    status: string;
    createdAt: string;
  }[];
}

export default function AdminManagementScreen() {
  const { colors } = useTheme();
  const {
    loadInventory,
    loadSalesHistory,
    loadCustomers,
    loadDashboard,
  } = useWholesalerStore();

  const [activeTab, setActiveTab] = useState<MainTab>('analytics');
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [dangerCategory, setDangerCategory] = useState<DangerCategory>('stores');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Raw Database Data
  const [stores, setStores] = useState<CustomerStoreItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [users, setUsers] = useState<UserProfileItem[]>([]);
  const [topSelling, setTopSelling] = useState<any[]>([]);

  // User/Shop Directory in Business Analytics
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'shops' | 'users'>('all');
  const [directorySearch, setDirectorySearch] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<DetailedEntity | null>(null);

  // Deletion Modal State
  const [itemToDelete, setItemToDelete] = useState<{
    type: DangerCategory;
    id: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch all administrative data
  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch Customers & Shops
      const [custRes, shopsRes] = await Promise.all([
        (supabase as any).from('customers').select('*').order('name'),
        (supabase as any).from('shops').select('id, name, owner_name, phone, address, created_at, is_active').order('name'),
      ]);

      const mergedStoresMap = new Map<string, CustomerStoreItem>();
      if (custRes.data) {
        custRes.data.forEach((c: any) => {
          mergedStoresMap.set(c.id, {
            id: c.id,
            name: c.name,
            owner_name: c.owner_name,
            phone: c.phone,
            address: c.address,
            current_balance: Number(c.current_balance || 0),
            created_at: c.created_at,
            is_active: c.is_active !== false,
          });
        });
      }
      if (shopsRes.data) {
        shopsRes.data.forEach((s: any) => {
          if (!mergedStoresMap.has(s.id)) {
            mergedStoresMap.set(s.id, {
              id: s.id,
              name: s.name,
              owner_name: s.owner_name,
              phone: s.phone,
              address: s.address,
              current_balance: 0,
              created_at: s.created_at,
              is_active: s.is_active !== false,
            });
          }
        });
      }
      setStores(Array.from(mergedStoresMap.values()));

      // 2. Fetch Orders
      const { data: ordersData } = await (supabase as any)
        .from('orders')
        .select('id, order_number, grand_total, status, created_at, shop_id, user_id, shop:shops(id, name)')
        .order('created_at', { ascending: false });

      if (ordersData) {
        setOrders(
          ordersData.map((o: any) => ({
            id: o.id,
            order_number: o.order_number,
            shop_id: o.shop_id || o.shop?.id,
            user_id: o.user_id,
            shop_name: o.shop?.name || 'Retail Customer',
            grand_total: Number(o.grand_total || 0),
            status: o.status || 'confirmed',
            created_at: o.created_at,
          }))
        );
      }

      // 3. Fetch Products (use explicit category FK & join inventory.total_units instead of non-existent stock_quantity)
      let prodsRes = await (supabase as any)
        .from('products')
        .select(`
          id,
          name,
          sku,
          packaging_type,
          category:categories!products_category_id_fkey(name),
          variants:product_variants(
            id,
            size_label,
            price,
            inventory(total_units)
          )
        `)
        .order('name');

      if (prodsRes.error) {
        console.warn('Products inventory join failed, falling back to basic query:', prodsRes.error.message);
        prodsRes = await (supabase as any)
          .from('products')
          .select(`
            id,
            name,
            sku,
            packaging_type,
            variants:product_variants(id, size_label, price)
          `)
          .order('name');
      }

      if (prodsRes.data && prodsRes.data.length > 0) {
        setProducts(
          prodsRes.data.map((p: any) => {
            const totalStock = (p.variants || []).reduce((acc: number, v: any) => {
              const invRecord = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
              return acc + (Number(invRecord?.total_units) || 0);
            }, 0);
            const firstPrice = Number(p.variants?.[0]?.price || 0);
            const sizeLabel = (p.variants || [])
              .map((v: any) => v.size_label)
              .filter(Boolean)
              .join(', ');
            return {
              id: p.id,
              name: p.name,
              sku: p.sku,
              packaging_type: p.packaging_type,
              category_name: p.category?.name || 'General',
              size_label: sizeLabel || undefined,
              variants_count: p.variants?.length || 0,
              stock_units: totalStock,
              price: firstPrice,
            };
          })
        );
      } else {
        // Fallback to SECURITY DEFINER inventory RPC (guaranteed to match Inventory tab on mobile)
        try {
          const invItems = await wholesalerService.getInventory();
          const grouped = new Map<string, ProductItem>();
          invItems.forEach((item) => {
            const existing = grouped.get(item.product_id);
            if (existing) {
              existing.variants_count = (existing.variants_count || 1) + 1;
              existing.stock_units = (existing.stock_units || 0) + (item.total_units || 0);
              if (item.size_label && !existing.size_label?.includes(item.size_label)) {
                existing.size_label = existing.size_label
                  ? `${existing.size_label}, ${item.size_label}`
                  : item.size_label;
              }
            } else {
              grouped.set(item.product_id, {
                id: item.product_id,
                name: item.product_name,
                sku: null,
                packaging_type: item.packaging_type,
                category_name: item.category_name || 'General',
                size_label: item.size_label || undefined,
                variants_count: 1,
                stock_units: item.total_units || 0,
                price: item.price_per_carton || 0,
              });
            }
          });
          setProducts(Array.from(grouped.values()));
        } catch {
          // Leave products empty if both table and RPC fail
        }
      }

      // 4. Fetch Sales History
      const { data: salesData } = await (supabase as any)
        .from('sales')
        .select('id, receipt_no, customer_name_snapshot, total_amount, sale_date, status')
        .order('sale_date', { ascending: false });

      if (salesData) {
        setSales(
          salesData.map((s: any) => ({
            id: s.id,
            receipt_no: s.receipt_no,
            customer_name: s.customer_name_snapshot || 'Walk-in Customer',
            total_amount: Number(s.total_amount || 0),
            sale_date: s.sale_date,
            status: s.status || 'finalized',
          }))
        );
      }

      // 5. Fetch Profiles (Users)
      const { data: profilesData } = await (supabase as any)
        .from('profiles')
        .select('id, email, full_name, phone, role, created_at')
        .order('created_at', { ascending: false });

      if (profilesData) {
        setUsers(
          profilesData.map((u: any) => ({
            id: u.id,
            email: u.email,
            full_name: u.full_name,
            phone: u.phone,
            role: u.role || 'retail_user',
            created_at: u.created_at,
          }))
        );
      }

      // 6. Top Selling RPC
      try {
        const { data: topData } = await (supabase.rpc as any)('wholesaler_get_top_selling_products');
        if (topData) setTopSelling(topData);
      } catch {
        // Fallback gracefully
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      await fetchData();
    };
    if (mounted) {
      void init();
    }
    return () => {
      mounted = false;
    };
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    await Promise.allSettled([
      loadDashboard(undefined, true),
      loadInventory(undefined, true),
      loadSalesHistory(undefined, true),
      loadCustomers(true),
    ]);
    setRefreshing(false);
  };

  // -------------------------------------------------------------
  // ANALYTICS CALCULATIONS (Week / Month / All Time)
  // -------------------------------------------------------------
  const analyticsData = useMemo(() => {
    const now = new Date();
    const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : 9999;
    const cutoffDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevCutoffDate = new Date(now.getTime() - periodDays * 2 * 24 * 60 * 60 * 1000);

    // Filter sales in current window
    const currentSales = sales.filter((s) => new Date(s.sale_date) >= cutoffDate);
    const previousSales = sales.filter((s) => {
      const d = new Date(s.sale_date);
      return d >= prevCutoffDate && d < cutoffDate;
    });

    const currentTotalRev = currentSales.reduce((acc, s) => acc + s.total_amount, 0);
    const prevTotalRev = previousSales.reduce((acc, s) => acc + s.total_amount, 0);

    // % Sales Trend (Increase or Decrease)
    let salesTrendPct = 0;
    if (prevTotalRev > 0) {
      salesTrendPct = Math.round(((currentTotalRev - prevTotalRev) / prevTotalRev) * 100);
    } else if (currentTotalRev > 0) {
      salesTrendPct = 100;
    }

    // Orders in period
    const currentOrders = orders.filter((o) => new Date(o.created_at) >= cutoffDate);
    const prevOrders = orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= prevCutoffDate && d < cutoffDate;
    });

    let ordersTrendPct = 0;
    if (prevOrders.length > 0) {
      ordersTrendPct = Math.round(((currentOrders.length - prevOrders.length) / prevOrders.length) * 100);
    } else if (currentOrders.length > 0) {
      ordersTrendPct = 100;
    }

    // New users in period
    const newUsers = users.filter((u) => new Date(u.created_at) >= cutoffDate);
    const newStores = stores.filter((s) => s.created_at && new Date(s.created_at) >= cutoffDate);

    // Orders status breakdown
    const pendingOrders = orders.filter((o) => o.status === 'placed' || o.status === 'confirmed').length;
    const processingOrders = orders.filter((o) => o.status === 'processing' || o.status === 'out_for_delivery').length;
    const deliveredOrders = orders.filter((o) => o.status === 'delivered').length;
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;

    // Total receivables
    const totalReceivables = stores.reduce((acc, s) => acc + (s.current_balance || 0), 0);

    return {
      currentTotalRev: period === 'all' ? sales.reduce((a, s) => a + s.total_amount, 0) : currentTotalRev,
      salesTrendPct,
      totalOrdersCount: period === 'all' ? orders.length : currentOrders.length,
      ordersTrendPct,
      totalCustomersCount: stores.length,
      newCustomersCount: newStores.length,
      totalUsersCount: users.length,
      newUsersCount: newUsers.length,
      pendingOrders,
      processingOrders,
      deliveredOrders,
      cancelledOrders,
      totalReceivables,
    };
  }, [sales, orders, users, stores, period]);

  // -------------------------------------------------------------
  // USER & SHOP 360° DETAILS HANDLER
  // -------------------------------------------------------------
  const openEntityDetail = useCallback(
    (item: CustomerStoreItem | UserProfileItem, type: 'shop' | 'user') => {
      let matchingOrders: OrderItem[] = [];
      let totalSpent = 0;

      if (type === 'shop') {
        const s = item as CustomerStoreItem;
        matchingOrders = orders.filter(
          (o) =>
            o.shop_id === s.id ||
            o.shop_name.toLowerCase().trim() === s.name.toLowerCase().trim()
        );
        totalSpent = matchingOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0);

        setSelectedEntity({
          type: 'shop',
          id: s.id,
          name: s.name,
          ownerName: s.owner_name,
          email: null,
          phone: s.phone,
          address: s.address,
          role: 'Retail Store',
          createdAt: s.created_at,
          isActive: s.is_active,
          currentBalance: s.current_balance || 0,
          ordersCount: matchingOrders.length,
          totalSpent,
          recentOrders: matchingOrders.slice(0, 5).map((o) => ({
            id: o.id,
            orderNumber: o.order_number,
            grandTotal: o.grand_total,
            status: o.status,
            createdAt: o.created_at,
          })),
        });
      } else {
        const u = item as UserProfileItem;
        matchingOrders = orders.filter((o) => o.user_id === u.id);
        totalSpent = matchingOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0);

        const matchedShop = stores.find(
          (s) =>
            (u.phone && s.phone === u.phone) ||
            (u.full_name && s.owner_name?.toLowerCase().trim() === u.full_name.toLowerCase().trim())
        );

        setSelectedEntity({
          type: 'user',
          id: u.id,
          name: u.full_name || u.email || 'Registered User',
          ownerName: u.full_name,
          email: u.email,
          phone: u.phone || matchedShop?.phone,
          address: matchedShop?.address || null,
          role: u.role || 'retail_user',
          createdAt: u.created_at,
          isActive: true,
          currentBalance: matchedShop?.current_balance || 0,
          ordersCount: matchingOrders.length,
          totalSpent,
          recentOrders: matchingOrders.slice(0, 5).map((o) => ({
            id: o.id,
            orderNumber: o.order_number,
            grandTotal: o.grand_total,
            status: o.status,
            createdAt: o.created_at,
          })),
        });
      }
    },
    [orders, stores]
  );

  const filteredDirectory = useMemo(() => {
    const q = directorySearch.toLowerCase().trim();
    const result: { item: CustomerStoreItem | UserProfileItem; type: 'shop' | 'user' }[] = [];

    if (directoryFilter === 'all' || directoryFilter === 'shops') {
      stores.forEach((s) => {
        const match =
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.owner_name && s.owner_name.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q)) ||
          (s.address && s.address.toLowerCase().includes(q));
        if (match) {
          result.push({ item: s, type: 'shop' });
        }
      });
    }

    if (directoryFilter === 'all' || directoryFilter === 'users') {
      users.forEach((u) => {
        const match =
          !q ||
          u.email.toLowerCase().includes(q) ||
          (u.full_name && u.full_name.toLowerCase().includes(q)) ||
          (u.phone && u.phone.includes(q)) ||
          (u.role && u.role.toLowerCase().includes(q));
        if (match) {
          result.push({ item: u, type: 'user' });
        }
      });
    }

    return result;
  }, [stores, users, directoryFilter, directorySearch]);

  // -------------------------------------------------------------
  // DANGER ZONE EXECUTION
  // -------------------------------------------------------------
  const handleExecuteDelete = async () => {
    if (!itemToDelete) return;

    setIsDeleting(true);
    try {
      const { type, id } = itemToDelete;

      if (type === 'stores') {
        // Try dedicated atomic danger delete RPC first
        const { error: rpcErr } = await (supabase.rpc as any)('admin_danger_delete_store', {
          p_store_id: id,
        });
        if (rpcErr) {
          // Fallback direct cascade
          await (supabase as any).from('customer_payments').delete().eq('customer_id', id);
          await (supabase as any).from('wholesaler_customer_ledger').delete().eq('customer_id', id);
          await (supabase as any).from('customers').delete().eq('id', id);
          await (supabase as any).from('shops').delete().eq('id', id);
        }
      } else if (type === 'orders') {
        // Permanently delete order and all its child dependencies
        const { error: rpcErr } = await (supabase.rpc as any)('admin_danger_delete_order', {
          p_order_id: id,
        });
        if (rpcErr) {
          // Fallback direct cascade
          await (supabase as any).from('order_items').delete().eq('order_id', id);
          await (supabase as any).from('order_tracking').delete().eq('order_id', id);
          await (supabase as any).from('order_status_history').delete().eq('order_id', id);
          await (supabase as any).from('cancellation_requests').delete().eq('order_id', id);
          const { error: oErr } = await (supabase as any).from('orders').delete().eq('id', id);
          if (oErr) throw oErr;
        }
      } else if (type === 'inventory') {
        // Permanently delete inventory & variants
        const { error: rpcErr } = await (supabase.rpc as any)('admin_danger_delete_inventory', {
          p_product_id: id,
        });
        if (rpcErr) {
          const { data: varRows } = await (supabase as any)
            .from('product_variants')
            .select('id')
            .eq('product_id', id);
          const varIds = (varRows || []).map((v: any) => v.id);
          if (varIds.length > 0) {
            await (supabase as any).from('inventory').delete().in('variant_id', varIds);
            await (supabase as any).from('stock_movements').delete().in('variant_id', varIds);
            await (supabase as any).from('stock_adjustments').delete().in('variant_id', varIds);
            await (supabase as any).from('sale_items').delete().in('variant_id', varIds);
            await (supabase as any).from('purchase_items').delete().in('variant_id', varIds);
            await (supabase as any).from('order_items').delete().in('variant_id', varIds);
            await (supabase as any).from('stock_reservations').delete().in('variant_id', varIds);
            await (supabase as any).from('product_variants').delete().eq('product_id', id);
          }
          const { error } = await (supabase as any).from('products').delete().eq('id', id);
          if (error) throw error;
        }
      } else if (type === 'sales') {
        // Permanently delete sales receipt & items
        const { error: rpcErr } = await (supabase.rpc as any)('admin_danger_delete_sale', {
          p_sale_id: id,
        });
        if (rpcErr) {
          await (supabase as any).from('sale_items').delete().eq('sale_id', id);
          const { error } = await (supabase as any).from('sales').delete().eq('id', id);
          if (error) throw error;
        }
      } else if (type === 'users') {
        // Permanently delete user profile & related associations
        const { error: rpcErr } = await (supabase.rpc as any)('admin_danger_delete_user', {
          p_user_id: id,
        });
        if (rpcErr) {
          const { error } = await (supabase as any).from('profiles').delete().eq('id', id);
          if (error) throw error;
        }
      }

      setItemToDelete(null);
      await fetchData();
      if (type === 'inventory') {
        void loadInventory(undefined, true);
        void loadDashboard(undefined, true);
      }

      const successMsg = `Successfully removed ${itemToDelete.title}`;
      if (Platform.OS === 'web') {
        window.alert(successMsg);
      } else {
        Alert.alert('Deleted', successMsg);
      }
    } catch (err: any) {
      console.error('Delete error:', err);
      const errMsg = err?.message || 'Deletion failed. Check database permissions.';
      if (Platform.OS === 'web') {
        window.alert(errMsg);
      } else {
        Alert.alert('Error', errMsg);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Clear Cancelled Orders
  const handleClearCancelledOrders = async () => {
    const cancelled = orders.filter((o) => o.status === 'cancelled');
    if (cancelled.length === 0) {
      Alert.alert('No Orders', 'There are no cancelled orders to clear.');
      return;
    }

    Alert.alert(
      'Clear All Cancelled Orders?',
      `Are you sure you want to permanently clear ${cancelled.length} cancelled order(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const { error: rpcErr } = await (supabase.rpc as any)('admin_danger_clear_cancelled_orders');
              if (rpcErr) {
                for (const o of cancelled) {
                  await (supabase as any).from('order_items').delete().eq('order_id', o.id);
                  await (supabase as any).from('order_tracking').delete().eq('order_id', o.id);
                  await (supabase as any).from('order_status_history').delete().eq('order_id', o.id);
                  await (supabase as any).from('cancellation_requests').delete().eq('order_id', o.id);
                  await (supabase as any).from('orders').delete().eq('id', o.id);
                }
              }
              await fetchData();
              Alert.alert('Cleared', 'Cancelled orders purged successfully.');
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to clear cancelled orders.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------
  // DANGER LIST FILTERING
  // -------------------------------------------------------------
  const filteredDangerList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (dangerCategory === 'stores') {
      return stores.filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.owner_name && s.owner_name.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q))
      );
    }
    if (dangerCategory === 'orders') {
      return orders.filter(
        (o) =>
          !q ||
          o.order_number.toString().includes(q) ||
          o.shop_name.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q)
      );
    }
    if (dangerCategory === 'inventory') {
      return products.filter((p) => {
        if (!q) return true;
        const combined = `${p.name} ${p.size_label || ''}`.toLowerCase();
        return (
          combined.includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          p.category_name?.toLowerCase().includes(q)
        );
      });
    }
    if (dangerCategory === 'sales') {
      return sales.filter(
        (s) =>
          !q ||
          s.receipt_no.toLowerCase().includes(q) ||
          s.customer_name.toLowerCase().includes(q)
      );
    }
    if (dangerCategory === 'users') {
      return users.filter(
        (u) =>
          !q ||
          u.email.toLowerCase().includes(q) ||
          (u.full_name && u.full_name.toLowerCase().includes(q)) ||
          (u.role && u.role.toLowerCase().includes(q))
      );
    }
    return [];
  }, [dangerCategory, searchQuery, stores, orders, products, sales, users]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to Dashboard"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <AppText variant="subtitle" style={styles.headerTitleText}>
            Admin Control Center
          </AppText>
          <AppText variant="caption" muted style={styles.headerSubtitleText}>
            Wholesale Analytics & System Management
          </AppText>
        </View>
      </View>

      {/* Main Mode Segmented Control */}
      <View style={styles.segmentContainer}>
        <Pressable
          style={[
            styles.segmentBtn,
            activeTab === 'analytics' && [styles.segmentBtnActive, { borderColor: colors.primary, backgroundColor: '#eff6ff' }],
          ]}
          onPress={() => setActiveTab('analytics')}
        >
          <Ionicons
            name="stats-chart"
            size={16}
            color={activeTab === 'analytics' ? colors.primary : '#64748b'}
            style={{ marginRight: 6 }}
          />
          <AppText
            style={[
              styles.segmentBtnText,
              { color: activeTab === 'analytics' ? colors.primary : '#64748b' },
            ]}
          >
            Business Analytics
          </AppText>
        </Pressable>

        <Pressable
          style={[
            styles.segmentBtn,
            activeTab === 'danger_zone' && [styles.segmentBtnActive, { borderColor: '#ef4444', backgroundColor: '#fef2f2' }],
          ]}
          onPress={() => setActiveTab('danger_zone')}
        >
          <Ionicons
            name="warning"
            size={16}
            color={activeTab === 'danger_zone' ? '#dc2626' : '#64748b'}
            style={{ marginRight: 6 }}
          />
          <AppText
            style={[
              styles.segmentBtnText,
              { color: activeTab === 'danger_zone' ? '#dc2626' : '#64748b' },
            ]}
          >
            Danger Zone
          </AppText>
        </Pressable>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="caption" muted style={{ marginTop: 10 }}>
            Loading System Data...
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ======================================================== */}
          {/* TAB 1: BUSINESS ANALYTICS & STATS                        */}
          {/* ======================================================== */}
          {activeTab === 'analytics' && (
            <View style={styles.tabContent}>
              {/* Period Filter Buttons */}
              <View style={styles.periodRow}>
                {(['week', 'month', 'all'] as AnalyticsPeriod[]).map((p) => {
                  const isSelected = period === p;
                  const label = p === 'week' ? 'Past 7 Days' : p === 'month' ? 'Past 30 Days' : 'All Time';
                  return (
                    <Pressable
                      key={p}
                      style={[
                        styles.periodBtn,
                        isSelected && [styles.periodBtnActive, { backgroundColor: colors.primary }],
                      ]}
                      onPress={() => setPeriod(p)}
                    >
                      <AppText
                        style={[
                          styles.periodBtnText,
                          { color: isSelected ? '#ffffff' : '#64748b' },
                        ]}
                      >
                        {label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Revenue & Growth Hero Card */}
              <Card style={styles.heroMetricCard}>
                <View style={styles.heroTopRow}>
                  <View>
                    <AppText variant="caption" muted style={styles.heroLabel}>
                      TOTAL SALES REVENUE ({period === 'week' ? 'WEEK' : period === 'month' ? 'MONTH' : 'ALL TIME'})
                    </AppText>
                    <AppText style={styles.heroAmount}>
                      {formatMoney(analyticsData.currentTotalRev)}
                    </AppText>
                  </View>
                  {period !== 'all' && (
                    <View
                      style={[
                        styles.trendPill,
                        {
                          backgroundColor:
                            analyticsData.salesTrendPct >= 0 ? '#ecfdf5' : '#fef2f2',
                          borderColor:
                            analyticsData.salesTrendPct >= 0 ? '#a7f3d0' : '#fecaca',
                        },
                      ]}
                    >
                      <Ionicons
                        name={analyticsData.salesTrendPct >= 0 ? 'trending-up' : 'trending-down'}
                        size={15}
                        color={analyticsData.salesTrendPct >= 0 ? '#059669' : '#dc2626'}
                        style={{ marginRight: 4 }}
                      />
                      <AppText
                        style={[
                          styles.trendText,
                          {
                            color:
                              analyticsData.salesTrendPct >= 0 ? '#059669' : '#dc2626',
                          },
                        ]}
                      >
                        {analyticsData.salesTrendPct >= 0 ? '+' : ''}
                        {analyticsData.salesTrendPct}% vs prev
                      </AppText>
                    </View>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Sub metrics */}
                <View style={styles.heroSubRow}>
                  <View style={styles.heroSubItem}>
                    <AppText variant="caption" muted>Orders Placed</AppText>
                    <AppText style={styles.heroSubValue}>{analyticsData.totalOrdersCount}</AppText>
                  </View>
                  <View style={styles.heroSubItem}>
                    <AppText variant="caption" muted>Customers Due</AppText>
                    <AppText style={[styles.heroSubValue, { color: '#d97706' }]}>
                      {formatMoney(analyticsData.totalReceivables)}
                    </AppText>
                  </View>
                  <View style={styles.heroSubItem}>
                    <AppText variant="caption" muted>New Joined</AppText>
                    <AppText style={[styles.heroSubValue, { color: '#059669' }]}>
                      +{analyticsData.newCustomersCount}
                    </AppText>
                  </View>
                </View>
              </Card>

              {/* 2x2 Metric Cards Grid */}
              <View style={styles.gridRow}>
                {/* Customers Card */}
                <Card
                  style={styles.gridCard}
                  onPress={() => setDirectoryFilter('shops')}
                >
                  <View style={styles.gridCardHeader}>
                    <View style={[styles.gridIconWrap, { backgroundColor: '#eff6ff' }]}>
                      <Ionicons name="storefront" size={14} color="#2563eb" />
                    </View>
                    <AppText variant="caption" muted style={styles.gridLabel} numberOfLines={1}>
                      Total Stores
                    </AppText>
                  </View>
                  <View style={styles.gridValueRow}>
                    <AppText style={styles.gridVal}>{analyticsData.totalCustomersCount}</AppText>
                    <AppText variant="caption" style={[styles.gridSubtext, { color: '#059669', fontWeight: '600' }]}>
                      +{analyticsData.newCustomersCount} new
                    </AppText>
                  </View>
                </Card>

                {/* Users Card */}
                <Card
                  style={styles.gridCard}
                  onPress={() => setDirectoryFilter('users')}
                >
                  <View style={styles.gridCardHeader}>
                    <View style={[styles.gridIconWrap, { backgroundColor: '#f5f3ff' }]}>
                      <Ionicons name="people" size={14} color="#7c3aed" />
                    </View>
                    <AppText variant="caption" muted style={styles.gridLabel} numberOfLines={1}>
                      Total Users
                    </AppText>
                  </View>
                  <View style={styles.gridValueRow}>
                    <AppText style={styles.gridVal}>{analyticsData.totalUsersCount}</AppText>
                    <AppText variant="caption" style={[styles.gridSubtext, { color: '#059669', fontWeight: '600' }]}>
                      +{analyticsData.newUsersCount} reg
                    </AppText>
                  </View>
                </Card>

                {/* Order Success Card */}
                <Card style={styles.gridCard}>
                  <View style={styles.gridCardHeader}>
                    <View style={[styles.gridIconWrap, { backgroundColor: '#ecfdf5' }]}>
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                    </View>
                    <AppText variant="caption" muted style={styles.gridLabel} numberOfLines={1}>
                      Delivered Orders
                    </AppText>
                  </View>
                  <View style={styles.gridValueRow}>
                    <AppText style={styles.gridVal}>{analyticsData.deliveredOrders}</AppText>
                    <AppText variant="caption" muted style={styles.gridSubtext}>
                      {analyticsData.pendingOrders} pending
                    </AppText>
                  </View>
                </Card>

                {/* Catalog Products Card */}
                <Card style={styles.gridCard}>
                  <View style={styles.gridCardHeader}>
                    <View style={[styles.gridIconWrap, { backgroundColor: '#fff7ed' }]}>
                      <Ionicons name="cube" size={14} color="#ea580c" />
                    </View>
                    <AppText variant="caption" muted style={styles.gridLabel} numberOfLines={1}>
                      Active Catalog
                    </AppText>
                  </View>
                  <View style={styles.gridValueRow}>
                    <AppText style={styles.gridVal}>{products.length}</AppText>
                    <AppText variant="caption" muted style={styles.gridSubtext}>
                      Products
                    </AppText>
                  </View>
                </Card>
              </View>

              {/* Order Pipeline Status Breakdown */}
              <View style={styles.sectionWrap}>
                <AppText style={styles.sectionTitle}>ORDERS PIPELINE BREAKDOWN</AppText>
                <Card style={styles.pipelineCard}>
                  <View style={styles.pipelineRow}>
                    <View style={styles.pipelineItem}>
                      <View style={[styles.statusDot, { backgroundColor: '#f59e0b' }]} />
                      <AppText variant="caption" muted>Pending: </AppText>
                      <AppText style={styles.pipelineCount}>{analyticsData.pendingOrders}</AppText>
                    </View>
                    <View style={styles.pipelineItem}>
                      <View style={[styles.statusDot, { backgroundColor: '#3b82f6' }]} />
                      <AppText variant="caption" muted>Processing: </AppText>
                      <AppText style={styles.pipelineCount}>{analyticsData.processingOrders}</AppText>
                    </View>
                  </View>
                  <View style={[styles.pipelineRow, { marginTop: 10 }]}>
                    <View style={styles.pipelineItem}>
                      <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                      <AppText variant="caption" muted>Delivered: </AppText>
                      <AppText style={styles.pipelineCount}>{analyticsData.deliveredOrders}</AppText>
                    </View>
                    <View style={styles.pipelineItem}>
                      <View style={[styles.statusDot, { backgroundColor: '#ef4444' }]} />
                      <AppText variant="caption" muted>Cancelled: </AppText>
                      <AppText style={styles.pipelineCount}>{analyticsData.cancelledOrders}</AppText>
                    </View>
                  </View>
                </Card>
              </View>

              {/* Most Selling Items (Best Sellers) */}
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>🏆 MOST SELLING ITEMS</AppText>
                  <AppText variant="caption" muted>Ranked by sales volume</AppText>
                </View>

                {topSelling.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Ionicons name="cart-outline" size={32} color="#94a3b8" />
                    <AppText variant="caption" muted style={{ marginTop: 6 }}>
                      No sales recorded in this period yet.
                    </AppText>
                  </Card>
                ) : (
                  topSelling.map((item, idx) => (
                    <Card key={idx} style={styles.topSellerCard}>
                      <View style={styles.rankBadge}>
                        <AppText style={styles.rankText}>#{idx + 1}</AppText>
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <AppText style={styles.sellerName} numberOfLines={1}>
                          {item.product_name}
                        </AppText>
                        <AppText variant="caption" muted>
                          Size: {item.size_label || 'Standard'} • Sold: {item.cartons_sold} cartons ({item.total_units_sold || 0} units)
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText style={styles.sellerRevenue}>
                          {formatMoney(item.total_revenue || 0)}
                        </AppText>
                        <AppText variant="caption" style={{ color: '#059669', fontSize: 10 }}>
                          Total Revenue
                        </AppText>
                      </View>
                    </Card>
                  ))
                )}
              </View>

              {/* ALL REGISTERED SHOPS & USERS DIRECTORY */}
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>👥 ALL SHOPS & USERS DIRECTORY</AppText>
                  <AppText variant="caption" muted>
                    Tap any profile to view complete 360° details
                  </AppText>
                </View>

                {/* Directory Category Chips */}
                <View style={styles.dirChipsRow}>
                  {[
                    { key: 'all', label: `All (${stores.length + users.length})` },
                    { key: 'shops', label: `Shops (${stores.length})` },
                    { key: 'users', label: `Users (${users.length})` },
                  ].map((chip) => {
                    const isSel = directoryFilter === chip.key;
                    return (
                      <Pressable
                        key={chip.key}
                        style={[styles.dirChip, isSel && styles.dirChipActive]}
                        onPress={() => setDirectoryFilter(chip.key as any)}
                      >
                        <AppText style={[styles.dirChipText, isSel && styles.dirChipTextActive]}>
                          {chip.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Search in Directory */}
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
                  <TextInput
                    placeholder="Search by name, shop, phone, email..."
                    placeholderTextColor="#94a3b8"
                    value={directorySearch}
                    onChangeText={setDirectorySearch}
                    style={styles.searchInput}
                    autoCapitalize="none"
                  />
                  {directorySearch ? (
                    <Pressable onPress={() => setDirectorySearch('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color="#94a3b8" />
                    </Pressable>
                  ) : null}
                </View>

                {/* Directory Cards */}
                {filteredDirectory.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Ionicons name="people-outline" size={32} color="#94a3b8" />
                    <AppText variant="caption" muted style={{ marginTop: 6 }}>
                      No shops or users match your search.
                    </AppText>
                  </Card>
                ) : (
                  filteredDirectory.map(({ item, type }) => {
                    const isShop = type === 'shop';
                    const shopItem = isShop ? (item as CustomerStoreItem) : null;
                    const userItem = !isShop ? (item as UserProfileItem) : null;

                    const title = isShop ? shopItem!.name : userItem!.full_name || userItem!.email;
                    const subtitle = isShop
                      ? `Owner: ${shopItem!.owner_name || 'N/A'} • Phone: ${shopItem!.phone || 'N/A'}`
                      : `Email: ${userItem!.email} • Role: ${userItem!.role || 'User'}`;
                    const dues = isShop ? shopItem!.current_balance || 0 : 0;

                    return (
                      <Pressable
                        key={`${type}-${item.id}`}
                        onPress={() => openEntityDetail(item, type)}
                      >
                        <Card style={styles.dirItemCard}>
                          <View
                            style={[
                              styles.dirAvatarWrap,
                              { backgroundColor: isShop ? '#eff6ff' : '#f5f3ff' },
                            ]}
                          >
                            <Ionicons
                              name={isShop ? 'storefront' : 'person'}
                              size={18}
                              color={isShop ? '#2563eb' : '#7c3aed'}
                            />
                          </View>

                          <View style={{ flex: 1, marginHorizontal: 10 }}>
                            <View style={styles.dirCardTopRow}>
                              <AppText style={styles.dirItemTitle} numberOfLines={1}>
                                {title}
                              </AppText>
                              <View
                                style={[
                                  styles.dirTypePill,
                                  { backgroundColor: isShop ? '#dbeafe' : '#ede9fe' },
                                ]}
                              >
                                <AppText
                                  style={[
                                    styles.dirTypePillText,
                                    { color: isShop ? '#1d4ed8' : '#6d28d9' },
                                  ]}
                                >
                                  {isShop ? 'SHOP' : 'USER'}
                                </AppText>
                              </View>
                            </View>

                            <AppText variant="caption" muted numberOfLines={1}>
                              {subtitle}
                            </AppText>

                            {isShop && dues > 0 && (
                              <AppText variant="caption" style={{ color: '#dc2626', fontWeight: '700', marginTop: 2 }}>
                                Dues: {formatMoney(dues)}
                              </AppText>
                            )}
                          </View>

                          <View style={styles.dirArrowWrap}>
                            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                          </View>
                        </Card>
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/* ======================================================== */}
          {/* TAB 2: DANGER ZONE (SYSTEM REMOVAL & PURGE)               */}
          {/* ======================================================== */}
          {activeTab === 'danger_zone' && (
            <View style={styles.tabContent}>
              {/* Caution Banner */}
              <View style={styles.cautionBanner}>
                <Ionicons name="alert-circle" size={24} color="#dc2626" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <AppText style={styles.cautionTitle}>DANGER ZONE CONTROLS</AppText>
                  <AppText style={styles.cautionText}>
                    Permanent administrative actions. Deleting records here removes them completely from the database.
                  </AppText>
                </View>
              </View>

              {/* Danger Category Selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {[
                  { key: 'stores', label: `Stores (${stores.length})`, icon: 'storefront' },
                  { key: 'orders', label: `Orders (${orders.length})`, icon: 'receipt' },
                  { key: 'inventory', label: `Inventory (${products.length})`, icon: 'cube' },
                  { key: 'sales', label: `Sales Slips (${sales.length})`, icon: 'document-text' },
                  { key: 'users', label: `Users (${users.length})`, icon: 'people' },
                ].map((cat) => {
                  const isSel = dangerCategory === cat.key;
                  return (
                    <Pressable
                      key={cat.key}
                      style={[
                        styles.catPill,
                        isSel && styles.catPillActive,
                      ]}
                      onPress={() => {
                        setDangerCategory(cat.key as DangerCategory);
                        setSearchQuery('');
                      }}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={14}
                        color={isSel ? '#dc2626' : '#64748b'}
                        style={{ marginRight: 5 }}
                      />
                      <AppText style={[styles.catPillText, isSel && styles.catPillTextActive]}>
                        {cat.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Search in Category */}
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder={`Search ${dangerCategory}...`}
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery ? (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </Pressable>
                ) : null}
              </View>

              {/* Category-Specific Quick Actions (e.g. Clear Cancelled Orders) */}
              {dangerCategory === 'orders' && (
                <View style={styles.bulkActionRow}>
                  <Pressable
                    style={styles.bulkActionBtn}
                    onPress={handleClearCancelledOrders}
                  >
                    <Ionicons name="trash-bin-outline" size={15} color="#dc2626" style={{ marginRight: 4 }} />
                    <AppText style={styles.bulkActionText}>Clear All Cancelled Orders</AppText>
                  </Pressable>
                </View>
              )}

              {/* Danger Items List */}
              {filteredDangerList.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Ionicons name="search-outline" size={32} color="#94a3b8" />
                  <AppText variant="caption" muted style={{ marginTop: 6 }}>
                    No items found matching your search.
                  </AppText>
                </Card>
              ) : (
                filteredDangerList.map((item: any) => {
                  let title = '';
                  let subtitle = '';
                  let badge = '';

                  if (dangerCategory === 'stores') {
                    title = item.name;
                    subtitle = `Owner: ${item.owner_name || 'N/A'} • Phone: ${item.phone || 'N/A'} • Dues: ${formatMoney(item.current_balance || 0)}`;
                    badge = item.is_active ? 'ACTIVE' : 'INACTIVE';
                  } else if (dangerCategory === 'orders') {
                    title = `Order #${item.order_number} (${item.shop_name})`;
                    subtitle = `Total: ${formatMoney(item.grand_total)} • Placed: ${new Date(item.created_at).toLocaleDateString()}`;
                    badge = (item.status || '').toUpperCase();
                  } else if (dangerCategory === 'inventory') {
                    title = item.name;
                    subtitle = `Category: ${item.category_name} • Stock: ${item.stock_units} units • Price: ${formatMoney(item.price)}`;
                    badge = item.stock_units > 0 ? 'IN STOCK' : 'OUT OF STOCK';
                  } else if (dangerCategory === 'sales') {
                    title = `Receipt: ${item.receipt_no}`;
                    subtitle = `Customer: ${item.customer_name} • Total: ${formatMoney(item.total_amount)} • ${new Date(item.sale_date).toLocaleDateString()}`;
                    badge = (item.status || '').toUpperCase();
                  } else if (dangerCategory === 'users') {
                    title = item.email;
                    subtitle = `Name: ${item.full_name || 'N/A'} • Role: ${item.role} • Joined: ${new Date(item.created_at).toLocaleDateString()}`;
                    badge = (item.role || 'USER').toUpperCase();
                  }

                  return (
                    <Card key={item.id} style={styles.dangerItemCard}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={styles.cardHeaderSmall}>
                          <AppText style={styles.dangerItemTitle} numberOfLines={1}>
                            {title}
                          </AppText>
                          {badge ? (
                            <View style={styles.statusBadgeSmall}>
                              <AppText style={styles.statusBadgeSmallText}>{badge}</AppText>
                            </View>
                          ) : null}
                        </View>
                        <AppText variant="caption" muted numberOfLines={2} style={styles.dangerItemSubtitle}>
                          {subtitle}
                        </AppText>
                      </View>

                      <Pressable
                        style={styles.deleteBtn}
                        onPress={() => {
                          setItemToDelete({
                            type: dangerCategory,
                            id: item.id,
                            title,
                            subtitle,
                          });
                        }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ffffff" />
                        <AppText style={styles.deleteBtnText}>Delete</AppText>
                      </Pressable>
                    </Card>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* CONFIRMATION DELETION MODAL */}
      <Modal
        visible={!!itemToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setItemToDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.confirmModalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="warning" size={32} color="#dc2626" />
            </View>
            <AppText style={styles.modalConfirmTitle}>Permanently Delete?</AppText>
            <AppText variant="caption" muted style={styles.modalConfirmDesc}>
              You are about to delete:
            </AppText>
            <View style={styles.itemPreviewBox}>
              <AppText style={styles.itemPreviewTitle} numberOfLines={2}>
                {itemToDelete?.title}
              </AppText>
              {itemToDelete?.subtitle ? (
                <AppText variant="caption" muted style={{ marginTop: 2 }}>
                  {itemToDelete.subtitle}
                </AppText>
              ) : null}
            </View>

            <AppText variant="caption" style={styles.warningNote}>
              ⚠️ This operation is irreversible and will permanently remove this data.
            </AppText>

            <View style={styles.modalActionsRow}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setItemToDelete(null)}
                style={{ flex: 1, marginRight: 8 }}
                disabled={isDeleting}
              />
              <Pressable
                style={[styles.modalDeleteBtn, isDeleting && { opacity: 0.6 }]}
                onPress={handleExecuteDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="trash" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <AppText style={styles.modalDeleteBtnText}>Confirm Delete</AppText>
                  </>
                )}
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>

      {/* 360° USER & SHOP DETAIL MODAL */}
      <Modal
        visible={!!selectedEntity}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEntity(null)}
      >
        <View style={styles.detailModalOverlay}>
          <View style={styles.detailModalContainer}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={styles.detailHeaderLeft}>
                <View
                  style={[
                    styles.detailAvatarWrap,
                    {
                      backgroundColor:
                        selectedEntity?.type === 'shop' ? '#eff6ff' : '#f5f3ff',
                    },
                  ]}
                >
                  <Ionicons
                    name={selectedEntity?.type === 'shop' ? 'storefront' : 'person'}
                    size={22}
                    color={selectedEntity?.type === 'shop' ? '#2563eb' : '#7c3aed'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle" style={styles.boldText} numberOfLines={1}>
                    {selectedEntity?.name}
                  </AppText>
                  <View style={styles.badgesRow}>
                    <View
                      style={[
                        styles.entityTypeBadge,
                        {
                          backgroundColor:
                            selectedEntity?.type === 'shop' ? '#dbeafe' : '#ede9fe',
                        },
                      ]}
                    >
                      <AppText
                        style={[
                          styles.entityTypeBadgeText,
                          {
                            color:
                              selectedEntity?.type === 'shop' ? '#1d4ed8' : '#6d28d9',
                          },
                        ]}
                      >
                        {selectedEntity?.type === 'shop' ? 'RETAIL SHOP' : 'REGISTERED USER'}
                      </AppText>
                    </View>
                    {selectedEntity?.isActive !== undefined && (
                      <View
                        style={[
                          styles.entityTypeBadge,
                          {
                            backgroundColor: selectedEntity.isActive ? '#ecfdf5' : '#fee2e2',
                            marginLeft: 6,
                          },
                        ]}
                      >
                        <AppText
                          style={[
                            styles.entityTypeBadgeText,
                            { color: selectedEntity.isActive ? '#059669' : '#dc2626' },
                          ]}
                        >
                          {selectedEntity.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() => setSelectedEntity(null)}
                style={styles.detailCloseBtn}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {/* Contact & Profile Info */}
              <Card style={styles.detailSectionCard}>
                <AppText style={styles.detailSectionHeader}>CONTACT & ACCOUNT DETAILS</AppText>

                {selectedEntity?.ownerName ? (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" muted>Contact / Owner Person</AppText>
                    <AppText variant="body" style={styles.boldText}>{selectedEntity.ownerName}</AppText>
                  </View>
                ) : null}

                {selectedEntity?.phone ? (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" muted>Phone Number</AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <AppText variant="body" style={[styles.boldText, { marginRight: 8 }]}>
                        {selectedEntity.phone}
                      </AppText>
                      <Pressable
                        style={styles.miniCallBtn}
                        onPress={() => {
                          if (selectedEntity.phone) {
                            void Linking.openURL(`tel:${selectedEntity.phone}`);
                          }
                        }}
                      >
                        <Ionicons name="call" size={12} color="#059669" style={{ marginRight: 4 }} />
                        <AppText style={styles.miniCallBtnText}>Call</AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {selectedEntity?.email ? (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" muted>Email Address</AppText>
                    <AppText variant="body" style={styles.boldText}>{selectedEntity.email}</AppText>
                  </View>
                ) : null}

                {selectedEntity?.address ? (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" muted>Store Address</AppText>
                    <AppText variant="body" style={[styles.boldText, { maxWidth: '65%', textAlign: 'right' }]}>
                      {selectedEntity.address}
                    </AppText>
                  </View>
                ) : null}

                {selectedEntity?.role ? (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" muted>System Role</AppText>
                    <AppText variant="body" style={[styles.boldText, { textTransform: 'capitalize' }]}>
                      {selectedEntity.role}
                    </AppText>
                  </View>
                ) : null}

                {selectedEntity?.createdAt ? (
                  <View style={styles.detailRow}>
                    <AppText variant="caption" muted>Registered Date</AppText>
                    <AppText variant="body" style={styles.boldText}>
                      {new Date(selectedEntity.createdAt).toLocaleString()}
                    </AppText>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <AppText variant="caption" muted>Database ID</AppText>
                  <AppText variant="caption" muted numberOfLines={1} style={{ maxWidth: '60%' }}>
                    {selectedEntity?.id}
                  </AppText>
                </View>
              </Card>

              {/* Financial Khata & Dues */}
              <Card style={styles.detailSectionCard}>
                <AppText style={styles.detailSectionHeader}>FINANCIAL STATUS & DUES</AppText>
                <View style={styles.detailRow}>
                  <AppText variant="body">Current Outstanding Khata:</AppText>
                  <AppText
                    variant="subtitle"
                    style={[
                      styles.boldText,
                      {
                        color:
                          (selectedEntity?.currentBalance || 0) > 0 ? '#dc2626' : '#059669',
                      },
                    ]}
                  >
                    {formatMoney(selectedEntity?.currentBalance || 0)}
                  </AppText>
                </View>
                {(selectedEntity?.currentBalance || 0) > 0 && (
                  <View style={styles.duesNoticeBox}>
                    <Ionicons name="alert-circle" size={16} color="#d97706" style={{ marginRight: 6 }} />
                    <AppText variant="caption" style={{ color: '#b45309', flex: 1 }}>
                      Pending balance due for payment collection.
                    </AppText>
                  </View>
                )}
              </Card>

              {/* Lifetime Orders Analytics */}
              <Card style={styles.detailSectionCard}>
                <AppText style={styles.detailSectionHeader}>ORDERING ACTIVITY & PURCHASES</AppText>
                <View style={styles.statsSummaryRow}>
                  <View style={styles.statBox}>
                    <AppText variant="caption" muted>Total Orders</AppText>
                    <AppText variant="subtitle" style={[styles.boldText, { color: colors.primary }]}>
                      {selectedEntity?.ordersCount || 0}
                    </AppText>
                  </View>
                  <View style={styles.statBox}>
                    <AppText variant="caption" muted>Total Spending</AppText>
                    <AppText variant="subtitle" style={[styles.boldText, { color: '#059669' }]}>
                      {formatMoney(selectedEntity?.totalSpent || 0)}
                    </AppText>
                  </View>
                </View>

                {/* Recent Orders List */}
                <AppText variant="caption" muted style={{ marginTop: 12, marginBottom: 6, fontWeight: '700' }}>
                  RECENT ORDERS ({selectedEntity?.recentOrders.length || 0})
                </AppText>

                {!selectedEntity?.recentOrders || selectedEntity.recentOrders.length === 0 ? (
                  <AppText variant="caption" muted style={{ fontStyle: 'italic', marginVertical: 6 }}>
                    No orders placed yet.
                  </AppText>
                ) : (
                  selectedEntity.recentOrders.map((o) => (
                    <View key={o.id} style={styles.recentOrderRow}>
                      <View style={{ flex: 1 }}>
                        <AppText style={styles.boldText}>Order #{o.orderNumber}</AppText>
                        <AppText variant="caption" muted>
                          {new Date(o.createdAt).toLocaleDateString()}
                        </AppText>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <AppText style={[styles.boldText, { color: colors.primary }]}>
                          {formatMoney(o.grandTotal)}
                        </AppText>
                        <View style={styles.orderStatusMini}>
                          <AppText style={styles.orderStatusMiniText}>
                            {o.status.toUpperCase()}
                          </AppText>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </ScrollView>

            {/* Footer */}
            <View style={styles.detailFooter}>
              {selectedEntity?.phone ? (
                <Pressable
                  style={styles.detailFooterCallBtn}
                  onPress={() => {
                    if (selectedEntity.phone) {
                      void Linking.openURL(`tel:${selectedEntity.phone}`);
                    }
                  }}
                >
                  <Ionicons name="call" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <AppText style={styles.detailFooterCallBtnText}>Call Phone</AppText>
                </Pressable>
              ) : null}

              <Pressable
                style={styles.detailFooterCloseBtn}
                onPress={() => setSelectedEntity(null)}
              >
                <AppText style={styles.detailFooterCloseBtnText}>Close</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitleText: {
    fontWeight: '800',
    fontSize: 18,
    color: '#0f172a',
  },
  headerSubtitleText: {
    fontSize: 11,
    marginTop: 1,
  },
  segmentContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 10,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  segmentBtnActive: {
    borderWidth: 1.5,
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tabContent: {
    gap: 16,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  periodBtnActive: {},
  periodBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroMetricCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 14,
  },
  heroSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroSubItem: {
    flex: 1,
  },
  heroSubValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 2,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  gridCard: {
    width: '48.5%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  gridCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  gridValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  gridVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  gridSubtext: {
    fontSize: 10.5,
  },
  sectionWrap: {
    marginTop: 6,
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#64748b',
  },
  pipelineCard: {
    padding: 14,
    borderRadius: 12,
  },
  pipelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pipelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  pipelineCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  topSellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
  },
  sellerName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  sellerRevenue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },

  // Danger Zone Styles
  cautionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cautionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#b91c1c',
  },
  cautionText: {
    fontSize: 11.5,
    color: '#991b1b',
    marginTop: 2,
    lineHeight: 16,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  catPillActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  catPillTextActive: {
    color: '#dc2626',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
    color: '#0f172a',
  },
  bulkActionRow: {
    alignItems: 'flex-end',
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bulkActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  dangerItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 1,
  },
  statusBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  statusBadgeSmallText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748b',
  },
  dangerItemSubtitle: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#dc2626',
  },
  deleteBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 4,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 380,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    elevation: 6,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalConfirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalConfirmDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  itemPreviewBox: {
    width: '100%',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 12,
  },
  itemPreviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  warningNote: {
    fontSize: 11.5,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  modalDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 10,
  },
  modalDeleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  boldText: {
    fontWeight: '700',
  },

  // Directory & Detail Modal Styles
  dirChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  dirChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dirChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  dirChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  dirChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  dirItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dirAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  dirItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  dirTypePill: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 6,
  },
  dirTypePillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  dirArrowWrap: {
    marginLeft: 4,
  },
  detailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  detailModalContainer: {
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  detailAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  entityTypeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  entityTypeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailCloseBtn: {
    padding: 6,
  },
  detailSectionCard: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  miniCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  miniCallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  duesNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  statsSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBox: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    alignItems: 'center',
  },
  recentOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderStatusMini: {
    backgroundColor: '#eff6ff',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
    marginTop: 2,
  },
  orderStatusMiniText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2563eb',
  },
  detailFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  detailFooterCallBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#059669',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailFooterCallBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  detailFooterCloseBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailFooterCloseBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
