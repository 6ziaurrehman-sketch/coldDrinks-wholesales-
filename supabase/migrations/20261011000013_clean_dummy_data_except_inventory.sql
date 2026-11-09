-- ============================================================================
-- Migration 13: Clean All Dummy Data (Except Inventory & Products)
-- Removes dummy customers, suppliers, sales slips, payments, and ledger entries.
-- Completely preserves public.products, public.product_variants, 
-- public.brands, public.categories, and public.inventory stock.
-- ============================================================================

-- 1. Clean dummy sale items & sales slips
DELETE FROM public.sale_items;
DELETE FROM public.sales;

-- 2. Clean dummy customer payments & ledger
DELETE FROM public.customer_payments;
DELETE FROM public.wholesaler_customer_ledger;

-- 3. Clean dummy customer returns (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer_returns') THEN
    DELETE FROM public.customer_returns;
  END IF;
END $$;

-- 4. Clean dummy purchases & purchase items
DELETE FROM public.purchase_items;
DELETE FROM public.purchases;

-- 5. Clean dummy stock adjustment and movement audit logs
DELETE FROM public.stock_adjustments;
DELETE FROM public.stock_movements;

-- 6. Clean dummy customers
DELETE FROM public.customers;

-- 7. Clean dummy suppliers
DELETE FROM public.suppliers;
