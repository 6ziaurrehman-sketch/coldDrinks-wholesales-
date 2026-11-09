export interface InventoryItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand_name: string;
  category_name: string;
  image_url: string | null;
  size_label: string;
  packaging_type: string;
  pieces_per_carton: number;
  price_per_carton: number;
  price_per_unit: number;
  cost_per_carton: number;
  cost_per_unit: number;
  total_units: number;
  available_cartons: number;
  available_loose_units: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  stock_value: number;
  is_active?: boolean;
  status?: 'active' | 'out_of_stock' | 'disabled';
}

export interface WholesalerProductInput {
  name: string;
  brand_id?: string;
  brand_name?: string;
  category_id?: string;
  size_label: string;
  packaging_type: string;
  pieces_per_carton: number;
  cost_price: number;
  price: number;
  unit_sale_price?: number;
  image_url?: string;
  barcode?: string;
  sku?: string;
  status?: 'active' | 'out_of_stock' | 'disabled';
  is_active?: boolean;
}

export interface WholesalerCustomer {
  id: string;
  name: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  area: string | null;
  opening_balance: number;
  current_balance: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WholesalerSupplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  balance_payable: number;
  is_active: boolean;
  created_at: string;
}

export interface WholesalerSaleItemInput {
  variant_id: string;
  cartons_qty: number;
  loose_units_qty: number;
  price_per_carton: number;
  price_per_unit?: number;
}

export interface WholesalerSalePayload {
  customer_id?: string;
  sale_date?: string;
  discount?: number;
  paid_amount?: number;
  payment_method?: 'cash' | 'bank_transfer' | 'credit' | 'partial' | 'other';
  notes?: string;
  items: WholesalerSaleItemInput[];
}

export interface WholesalerSaleReceipt {
  success: boolean;
  sale_id: string;
  receipt_no: string;
  customer_name: string;
  customer_phone: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  previous_balance: number;
  current_total_balance: number;
  payment_method: string;
  notes: string | null;
}

export interface WholesalerSaleSummary {
  id: string;
  receipt_no: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  customer_phone_snapshot: string | null;
  sale_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_method: string;
  status: string;
  items_count?: number;
}

export interface WholesalerDashboardMetrics {
  total_active_products: number;
  total_variants: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_stock_value: number;
  today_sales_count: number;
  today_sales_amount: number;
  today_cash_collected: number;
  today_credit_sales: number;
  total_customer_receivables: number;
  total_supplier_payables: number;
}
