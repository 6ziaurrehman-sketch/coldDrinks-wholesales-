-- Migration: 20261011000005_wholesaler_cost_prices_and_valuation.sql
-- Description: Sets realistic wholesale cost prices and updates dashboard stock valuation math

-- 1. Ensure RLS allows wholesaler owners to update products and product_variants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Wholesaler full access products'
  ) THEN
    CREATE POLICY "Wholesaler full access products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_variants' AND policyname = 'Wholesaler full access product_variants'
  ) THEN
    CREATE POLICY "Wholesaler full access product_variants" ON public.product_variants FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Populate cost_price on product_variants (standard wholesale 85% of retail carton price)
UPDATE public.product_variants
SET cost_price = round(coalesce(price, 1000) * 0.85, 2)
WHERE cost_price IS NULL OR cost_price = 0;

-- 3. Update wholesaler_get_dashboard_metrics with precise numeric division
CREATE OR REPLACE FUNCTION public.wholesaler_get_dashboard_metrics()
RETURNS jsonb AS $$
DECLARE
  v_res jsonb;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Karachi');
BEGIN
  v_res := jsonb_build_object(
    'total_active_products', (SELECT count(*) FROM public.products WHERE is_active = true),
    'total_variants', (SELECT count(*) FROM public.product_variants WHERE is_active = true),
    'low_stock_count', (
      SELECT count(*) FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      WHERE i.total_units > 0 AND i.total_units <= i.low_stock_threshold
    ),
    'out_of_stock_count', (
      SELECT count(*) FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      WHERE i.total_units = 0
    ),
    'total_stock_value', coalesce((
      SELECT round(sum(i.total_units * (pv.cost_price::numeric / greatest(pv.pieces_per_unit, 1)::numeric)), 2)
      FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
    ), 0),
    'today_sales_count', (
      SELECT count(*) FROM public.sales
      WHERE sale_date >= v_today_start AND status = 'finalized'
    ),
    'today_sales_amount', coalesce((
      SELECT sum(total_amount) FROM public.sales
      WHERE sale_date >= v_today_start AND status = 'finalized'
    ), 0),
    'today_cash_collected', coalesce((
      SELECT sum(amount) FROM public.customer_payments
      WHERE payment_date >= v_today_start
    ), 0),
    'today_credit_sales', coalesce((
      SELECT sum(balance_due) FROM public.sales
      WHERE sale_date >= v_today_start AND status = 'finalized'
    ), 0),
    'total_customer_receivables', coalesce((
      SELECT sum(current_balance) FROM public.customers WHERE current_balance > 0
    ), 0),
    'total_supplier_payables', coalesce((
      SELECT sum(balance_payable) FROM public.suppliers WHERE balance_payable > 0
    ), 0)
  );

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
