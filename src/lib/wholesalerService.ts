import { supabase } from '@/lib/supabase';
import {
  InventoryItem,
  WholesalerCustomer,
  WholesalerSupplier,
  WholesalerSalePayload,
  WholesalerSaleReceipt,
  WholesalerSaleSummary,
  WholesalerDashboardMetrics,
  WholesalerProductInput,
} from '@/types/wholesaler.types';
import { mapSupabaseError } from '@/lib/errors';

export const wholesalerService = {
  // 1. Dashboard Metrics
  async getDashboardMetrics(range?: string): Promise<WholesalerDashboardMetrics> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_get_dashboard_metrics', {
        p_range: range || '1_day',
      });
      if (error) throw error;
      return data as WholesalerDashboardMetrics;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getDashboardMetrics' });
    }
  },

  // 2. Inventory Listing
  async getInventory(search?: string): Promise<InventoryItem[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_get_inventory', {
        p_search: search || null,
      });
      if (error) throw error;
      const list: InventoryItem[] = ((data || []) as any[]).map((item: any) => {
        const isAct = item.is_active !== undefined ? Boolean(item.is_active) : true;
        const stat = !isAct || item.status === 'disabled'
          ? 'disabled'
          : item.is_out_of_stock || item.total_units === 0
          ? 'out_of_stock'
          : 'active';
        return {
          ...item,
          is_active: isAct,
          status: stat,
        };
      });

      // Also retrieve any disabled products so the wholesaler can manage and re-enable them in Disabled filter!
      const [disabledProdsRes, disabledVarsRes] = await Promise.all([
        (supabase as any)
          .from('products')
          .select(`
            id,
            name,
            image_url,
            packaging_type,
            is_active,
            brand:brands(name),
            category:categories!products_category_id_fkey(name),
            product_variants(
              id,
              size_label,
              price,
              cost_price,
              pieces_per_unit,
              is_active,
              inventory(total_units, low_stock_threshold)
            )
          `)
          .eq('is_active', false),
        (supabase as any)
          .from('product_variants')
          .select(`
            id,
            size_label,
            price,
            cost_price,
            pieces_per_unit,
            is_active,
            product:products(
              id,
              name,
              image_url,
              packaging_type,
              is_active,
              brand:brands(name),
              category:categories!products_category_id_fkey(name)
            ),
            inventory(total_units, low_stock_threshold)
          `)
          .eq('is_active', false),
      ]);

      const disabledProds = disabledProdsRes.data || [];
      const disabledVars = disabledVarsRes.data || [];

      // Add variants from disabled products
      disabledProds.forEach((dp: any) => {
        if (search && !dp.name.toLowerCase().includes(search.toLowerCase())) {
          return;
        }
        (dp.product_variants || []).forEach((v: any) => {
          if (!list.some((l) => l.variant_id === v.id)) {
            const invRecord = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
            const totalUnits = invRecord?.total_units || 0;
            const pieces = Math.max(1, v.pieces_per_unit || 1);
            const lowThresh = invRecord?.low_stock_threshold ?? 24;
            const costCarton = v.cost_price || 0;
            list.push({
              product_id: dp.id,
              variant_id: v.id,
              product_name: dp.name,
              brand_name: dp.brand?.name || 'Cold Drinks',
              category_name: dp.category?.name || 'Beverages',
              image_url: dp.image_url,
              size_label: v.size_label || 'Regular',
              packaging_type: dp.packaging_type || 'carton',
              pieces_per_carton: pieces,
              price_per_carton: v.price || 0,
              price_per_unit: Math.round(((v.price || 0) / pieces) * 100) / 100,
              cost_per_carton: costCarton,
              cost_per_unit: Math.round((costCarton / pieces) * 100) / 100,
              total_units: totalUnits,
              available_cartons: Math.floor(totalUnits / pieces),
              available_loose_units: totalUnits % pieces,
              low_stock_threshold: lowThresh,
              is_low_stock: totalUnits <= lowThresh && totalUnits > 0,
              is_out_of_stock: totalUnits === 0,
              stock_value: Math.round((totalUnits * (costCarton / pieces)) * 100) / 100,
              is_active: false,
              status: 'disabled',
            });
          }
        });
      });

      // Add directly disabled variants where parent product is is_active=true
      disabledVars.forEach((v: any) => {
        const p = v.product;
        if (!p) return;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) {
          return;
        }
        if (!list.some((l) => l.variant_id === v.id)) {
          const invRecord = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
          const totalUnits = invRecord?.total_units || 0;
          const pieces = Math.max(1, v.pieces_per_unit || 1);
          const lowThresh = invRecord?.low_stock_threshold ?? 24;
          const costCarton = v.cost_price || 0;
          list.push({
            product_id: p.id,
            variant_id: v.id,
            product_name: p.name,
            brand_name: p.brand?.name || 'Cold Drinks',
            category_name: p.category?.name || 'Beverages',
            image_url: p.image_url,
            size_label: v.size_label || 'Regular',
            packaging_type: p.packaging_type || 'carton',
            pieces_per_carton: pieces,
            price_per_carton: v.price || 0,
            price_per_unit: Math.round(((v.price || 0) / pieces) * 100) / 100,
            cost_per_carton: costCarton,
            cost_per_unit: Math.round((costCarton / pieces) * 100) / 100,
            total_units: totalUnits,
            available_cartons: Math.floor(totalUnits / pieces),
            available_loose_units: totalUnits % pieces,
            low_stock_threshold: lowThresh,
            is_low_stock: totalUnits <= lowThresh && totalUnits > 0,
            is_out_of_stock: totalUnits === 0,
            stock_value: Math.round((totalUnits * (costCarton / pieces)) * 100) / 100,
            is_active: false,
            status: 'disabled',
          });
        }
      });

      return list;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getInventory' });
    }
  },

  // 3. Stock Adjustment (Opening Stock, Breakage, Damage, Count Correction)
  async recordStockAdjustment(params: {
    variantId: string;
    type: 'opening_stock' | 'damage' | 'expiry' | 'breakage' | 'count_correction' | 'return';
    unitsDelta: number;
    reason: string;
    notes?: string;
  }): Promise<{ success: boolean; new_units: number }> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_record_stock_adjustment', {
        p_variant_id: params.variantId,
        p_type: params.type,
        p_units_delta: params.unitsDelta,
        p_reason: params.reason,
        p_notes: params.notes || null,
      });
      if (error) throw error;
      return data as { success: boolean; new_units: number };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'recordStockAdjustment', isWrite: true });
    }
  },

  // 4. Products: Add & Edit
  async addProduct(input: WholesalerProductInput): Promise<{ product_id: string; variant_id: string }> {
    try {
      // 1. Get or create category
      let categoryId = input.category_id;
      if (!categoryId) {
        const { data: defaultCat } = await (supabase as any).from('categories').select('id').limit(1).single();
        categoryId = defaultCat?.id;
      }

      // 2. Insert product
      const activeFlag = input.status === 'disabled' || input.is_active === false ? false : true;
      const { data: prod, error: pErr } = await (supabase as any)
        .from('products')
        .insert({
          name: input.name,
          category_id: categoryId,
          brand_id: input.brand_id || null,
          image_url: input.image_url || null,
          packaging_type: input.packaging_type,
          barcode: input.barcode || null,
          sku: input.sku || `SKU-${Date.now()}`,
          is_active: activeFlag,
        })
        .select('id')
        .single();

      if (pErr) throw pErr;

      // 3. Insert product variant
      const pieces = Math.max(1, input.pieces_per_carton || 1);
      const unitSale = input.unit_sale_price || Math.round((input.price / pieces) * 100) / 100;

      const { data: variant, error: vErr } = await (supabase as any)
        .from('product_variants')
        .insert({
          product_id: prod.id,
          size_label: input.size_label,
          packaging_type: input.packaging_type,
          pieces_per_unit: pieces,
          price: input.price,
          cost_price: input.cost_price,
          unit_sale_price: unitSale,
          image_url: input.image_url || null,
          barcode: input.barcode || null,
          is_active: activeFlag,
        })
        .select('id')
        .single();

      if (vErr) throw vErr;

      // 4. Initialize inventory row
      await (supabase as any).from('inventory').insert({
        variant_id: variant.id,
        total_units: 0,
        low_stock_threshold: 24,
      });

      return { product_id: prod.id, variant_id: variant.id };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'addProduct', isWrite: true });
    }
  },

  async updateProductPrice(params: {
    variantId: string;
    pricePerCarton: number;
    costPrice?: number;
    unitSalePrice?: number;
  }): Promise<void> {
    try {
      const updateData: any = { price: params.pricePerCarton };
      if (params.costPrice !== undefined) updateData.cost_price = params.costPrice;
      if (params.unitSalePrice !== undefined) updateData.unit_sale_price = params.unitSalePrice;

      const { error } = await (supabase as any)
        .from('product_variants')
        .update(updateData)
        .eq('id', params.variantId);

      if (error) throw error;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'updateProductPrice', isWrite: true });
    }
  },

  async updateProductDetails(params: {
    productId: string;
    variantId: string;
    name?: string;
    sizeLabel?: string;
    packagingType?: string;
    piecesPerCarton?: number;
    pricePerCarton?: number;
    costPrice?: number;
    unitSalePrice?: number;
    lowStockThreshold?: number;
    isActive?: boolean;
    status?: 'active' | 'out_of_stock' | 'disabled';
    imageUrl?: string;
  }): Promise<void> {
    try {
      const activeState = params.status === 'disabled' ? false : params.status === 'active' ? true : params.isActive;

      if (params.name || params.packagingType || activeState !== undefined || params.imageUrl !== undefined) {
        const prodUpdate: any = {};
        if (params.name) prodUpdate.name = params.name;
        if (params.packagingType) prodUpdate.packaging_type = params.packagingType;
        if (activeState !== undefined) prodUpdate.is_active = activeState;
        if (params.imageUrl !== undefined) prodUpdate.image_url = params.imageUrl;

        const { error: pErr } = await (supabase as any)
          .from('products')
          .update(prodUpdate)
          .eq('id', params.productId);
        if (pErr) throw pErr;
      }

      const varUpdate: any = {};
      if (params.sizeLabel) varUpdate.size_label = params.sizeLabel;
      if (params.packagingType) varUpdate.packaging_type = params.packagingType;
      if (params.piecesPerCarton !== undefined) varUpdate.pieces_per_unit = params.piecesPerCarton;
      if (params.pricePerCarton !== undefined) varUpdate.price = params.pricePerCarton;
      if (params.costPrice !== undefined) varUpdate.cost_price = params.costPrice;
      if (params.unitSalePrice !== undefined) varUpdate.unit_sale_price = params.unitSalePrice;
      if (activeState !== undefined) varUpdate.is_active = activeState;
      if (params.imageUrl !== undefined) varUpdate.image_url = params.imageUrl;

      if (Object.keys(varUpdate).length > 0) {
        const { error: vErr } = await (supabase as any)
          .from('product_variants')
          .update(varUpdate)
          .eq('id', params.variantId);
        if (vErr) throw vErr;
      }

      if (params.status === 'out_of_stock') {
        await (supabase as any)
          .from('inventory')
          .update({ total_units: 0 })
          .eq('variant_id', params.variantId);
      }

      if (params.lowStockThreshold !== undefined) {
        const { error: iErr } = await (supabase as any)
          .from('inventory')
          .update({ low_stock_threshold: params.lowStockThreshold })
          .eq('variant_id', params.variantId);
        if (iErr) throw iErr;
      }
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'updateProductDetails', isWrite: true });
    }
  },

  // 5. Customers (Retail Shops)
  async getCustomers(): Promise<WholesalerCustomer[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as WholesalerCustomer[];
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getCustomers' });
    }
  },

  async addCustomer(customer: {
    name: string;
    owner_name?: string;
    phone?: string;
    address?: string;
    area?: string;
    opening_balance?: number;
    notes?: string;
  }): Promise<WholesalerCustomer> {
    try {
      const opBal = customer.opening_balance || 0;
      const { data, error } = await (supabase as any)
        .from('customers')
        .insert({
          name: customer.name,
          owner_name: customer.owner_name || null,
          phone: customer.phone || null,
          address: customer.address || null,
          area: customer.area || null,
          opening_balance: opBal,
          current_balance: opBal,
          notes: customer.notes || null,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as WholesalerCustomer;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'addCustomer', isWrite: true });
    }
  },

  // 6. Suppliers & Purchases
  async getSuppliers(): Promise<WholesalerSupplier[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as WholesalerSupplier[];
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getSuppliers' });
    }
  },

  async addSupplier(supplier: {
    name: string;
    contact_person?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }): Promise<WholesalerSupplier> {
    try {
      const { data, error } = await (supabase as any)
        .from('suppliers')
        .insert({
          name: supplier.name,
          contact_person: supplier.contact_person || null,
          phone: supplier.phone || null,
          address: supplier.address || null,
          notes: supplier.notes || null,
          balance_payable: 0,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as WholesalerSupplier;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'addSupplier', isWrite: true });
    }
  },

  async finalizePurchase(params: {
    supplierId: string;
    invoiceNo: string;
    purchaseDate?: string;
    transportCost?: number;
    paidAmount?: number;
    paymentMethod?: string;
    notes?: string;
    items: {
      variant_id: string;
      cartons_qty: number;
      loose_units_qty: number;
      cost_per_carton: number;
    }[];
  }): Promise<{ success: boolean; purchase_id: string; total_cost: number }> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_finalize_purchase', {
        p_supplier_id: params.supplierId,
        p_invoice_no: params.invoiceNo,
        p_purchase_date: params.purchaseDate || new Date().toISOString().split('T')[0],
        p_transport_cost: params.transportCost || 0,
        p_paid_amount: params.paidAmount || 0,
        p_payment_method: params.paymentMethod || 'cash',
        p_notes: params.notes || null,
        p_items: params.items,
      });

      if (error) throw error;
      return data as { success: boolean; purchase_id: string; total_cost: number };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'finalizePurchase', isWrite: true });
    }
  },

  // 7. Sales Entry & Slips
  async finalizeSale(payload: WholesalerSalePayload): Promise<WholesalerSaleReceipt> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_finalize_sale', {
        p_customer_id: payload.customer_id || null,
        p_sale_date: payload.sale_date || new Date().toISOString(),
        p_discount: payload.discount || 0,
        p_paid_amount: payload.paid_amount || 0,
        p_payment_method: payload.payment_method || 'cash',
        p_notes: payload.notes || null,
        p_items: payload.items,
      });

      if (error) throw error;
      return data as WholesalerSaleReceipt;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'finalizeSale', isWrite: true });
    }
  },

  async getSalesHistory(search?: string): Promise<WholesalerSaleSummary[]> {
    try {
      let query = (supabase as any)
        .from('sales')
        .select(`
          id,
          receipt_no,
          customer_id,
          customer_name_snapshot,
          customer_phone_snapshot,
          sale_date,
          subtotal,
          discount,
          total_amount,
          paid_amount,
          balance_due,
          payment_method,
          status
        `)
        .order('sale_date', { ascending: false })
        .limit(100);

      if (search) {
        query = query.or(`receipt_no.ilike.%${search}%,customer_name_snapshot.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as WholesalerSaleSummary[];
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getSalesHistory' });
    }
  },

  async getSaleDetail(saleId: string): Promise<any> {
    try {
      const { data: sale, error: sErr } = await (supabase as any)
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();

      if (sErr) throw sErr;

      const { data: items, error: iErr } = await (supabase as any)
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId);

      if (iErr) throw iErr;

      return { ...sale, items: items || [] };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getSaleDetail' });
    }
  },

  // 8. Customer Khata / Ledger & Payments
  async recordCustomerPayment(params: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    referenceNo?: string;
    notes?: string;
  }): Promise<{ success: boolean; new_balance: number }> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_record_customer_payment', {
        p_customer_id: params.customerId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod,
        p_reference_no: params.referenceNo || null,
        p_notes: params.notes || null,
      });

      if (error) throw error;
      return data as { success: boolean; new_balance: number };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'recordCustomerPayment', isWrite: true });
    }
  },

  async getCustomerLedger(customerId: string): Promise<any[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('wholesaler_customer_ledger')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getCustomerLedger' });
    }
  },

  async getPurchasesHistory(supplierId?: string): Promise<any[]> {
    try {
      let query = (supabase as any)
        .from('purchases')
        .select(`
          id,
          invoice_no,
          supplier_id,
          purchase_date,
          total_cost,
          transport_cost,
          paid_amount,
          remaining_payable,
          payment_method,
          notes,
          suppliers (
            name,
            phone
          ),
          purchase_items (
            id,
            product_name_snapshot,
            size_label_snapshot,
            cartons_qty,
            loose_units_qty,
            cost_per_carton,
            line_total
          )
        `)
        .order('purchase_date', { ascending: false })
        .limit(50);

      if (supplierId) {
        query = query.eq('supplier_id', supplierId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getPurchasesHistory' });
    }
  },

  async recordCustomerReturn(params: {
    customerId?: string;
    variantId: string;
    cartonsQty?: number;
    looseUnitsQty?: number;
    creditAmount?: number;
    reason: string;
    notes?: string;
  }): Promise<{ success: boolean; units_returned: number; new_stock_units: number; new_customer_balance: number }> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_record_customer_return', {
        p_customer_id: params.customerId || null,
        p_variant_id: params.variantId,
        p_cartons_qty: params.cartonsQty || 0,
        p_loose_units_qty: params.looseUnitsQty || 0,
        p_credit_amount: params.creditAmount || 0,
        p_reason: params.reason,
        p_notes: params.notes || null,
      });

      if (error) throw error;
      return data;
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'recordCustomerReturn', isWrite: true });
    }
  },

  async getTopSellingProducts(): Promise<any[]> {
    try {
      const { data, error } = await (supabase.rpc as any)('wholesaler_get_top_selling_products');
      if (error) throw error;
      return data || [];
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'getTopSellingProducts' });
    }
  },
};
