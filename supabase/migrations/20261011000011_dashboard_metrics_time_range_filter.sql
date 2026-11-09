-- Migration: 20261011000011_dashboard_metrics_time_range_filter.sql
-- Description: Adds time range filtering to wholesaler_get_dashboard_metrics ('1_day', '3_days', '7_days', '30_days', 'year', 'all')

CREATE OR REPLACE FUNCTION public.wholesaler_get_dashboard_metrics(p_range text DEFAULT '1_day')
RETURNS jsonb AS $$
DECLARE
  v_res jsonb;
  v_now timestamptz := now() at time zone 'Asia/Karachi';
  v_start timestamptz;
BEGIN
  IF p_range = '3_days' THEN
    v_start := date_trunc('day', v_now - interval '3 days');
  ELSIF p_range = '7_days' OR p_range = 'week' THEN
    v_start := date_trunc('day', v_now - interval '7 days');
  ELSIF p_range = '30_days' OR p_range = 'month' THEN
    v_start := date_trunc('day', v_now - interval '30 days');
  ELSIF p_range = 'year' OR p_range = '1_year' THEN
    v_start := date_trunc('day', v_now - interval '365 days');
  ELSIF p_range = 'all' THEN
    v_start := '2000-01-01 00:00:00+00'::timestamptz;
  ELSE
    -- Default 1 day (today)
    v_start := date_trunc('day', v_now);
  END IF;

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
      WHERE sale_date >= v_start AND status = 'finalized'
    ),
    'today_sales_amount', coalesce((
      SELECT sum(total_amount) FROM public.sales
      WHERE sale_date >= v_start AND status = 'finalized'
    ), 0),
    'today_cash_collected', coalesce((
      SELECT sum(amount) FROM public.customer_payments
      WHERE payment_date >= v_start
    ), 0) + coalesce((
      SELECT sum(paid_amount) FROM public.sales
      WHERE customer_id IS NULL AND sale_date >= v_start AND status = 'finalized'
    ), 0),
    'today_credit_sales', coalesce((
      SELECT sum(balance_due) FROM public.sales
      WHERE sale_date >= v_start AND status = 'finalized'
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
