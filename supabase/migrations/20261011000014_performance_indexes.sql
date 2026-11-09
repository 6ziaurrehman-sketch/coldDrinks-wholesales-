-- ============================================================================
-- Migration 14: High-Performance Database B-Tree Indexes
-- Accelerates joins, catalog queries, sales queries, and dashboard metrics
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_product_variants_product 
  ON public.product_variants(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variants_active_prod 
  ON public.product_variants(is_active, product_id);

CREATE INDEX IF NOT EXISTS idx_products_active_brand 
  ON public.products(is_active, brand_id);

CREATE INDEX IF NOT EXISTS idx_products_category 
  ON public.products(category_id);

CREATE INDEX IF NOT EXISTS idx_inventory_variant 
  ON public.inventory(variant_id);

CREATE INDEX IF NOT EXISTS idx_inventory_units 
  ON public.inventory(total_units);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale 
  ON public.sale_items(sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_variant 
  ON public.sale_items(variant_id);

CREATE INDEX IF NOT EXISTS idx_customer_payments_customer_date 
  ON public.customer_payments(customer_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_variant_date 
  ON public.stock_adjustments(variant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_date_status 
  ON public.sales(sale_date DESC, status);
