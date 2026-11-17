-- Migration: 20261115000003_dashboard_profit_and_customer_insights.sql
-- Description: Adds today_profit & total_profit to wholesaler_get_dashboard_metrics,
-- and creates wholesaler_get_customer_insights RPC to return 360° shop sales, profit, and Khata statistics.

-- 1. Upgrade wholesaler_get_dashboard_metrics with profit calculation
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
      WHERE sale_date >= v_start AND coalesce(status, 'finalized') != 'cancelled'
    ),
    'today_sales_amount', coalesce((
      SELECT sum(total_amount) FROM public.sales
      WHERE sale_date >= v_start AND coalesce(status, 'finalized') != 'cancelled'
    ), 0),
    'today_profit', coalesce((
      SELECT round(
        sum(
          ti.line_total - (
            ti.total_units * (
              coalesce(nullif(pv.cost_price, 0), coalesce(pv.price, ti.price_per_carton, 0) * 0.85) /
              greatest(coalesce(ti.pieces_per_carton, pv.pieces_per_unit, 1), 1)
            )
          )
        ),
        2
      )
      FROM public.sale_items ti
      JOIN public.sales s ON s.id = ti.sale_id
      LEFT JOIN public.product_variants pv ON pv.id = ti.variant_id
      WHERE s.sale_date >= v_start AND coalesce(s.status, 'finalized') != 'cancelled'
    ), 0),
    'total_profit', coalesce((
      SELECT round(
        sum(
          ti.line_total - (
            ti.total_units * (
              coalesce(nullif(pv.cost_price, 0), coalesce(pv.price, ti.price_per_carton, 0) * 0.85) /
              greatest(coalesce(ti.pieces_per_carton, pv.pieces_per_unit, 1), 1)
            )
          )
        ),
        2
      )
      FROM public.sale_items ti
      JOIN public.sales s ON s.id = ti.sale_id
      LEFT JOIN public.product_variants pv ON pv.id = ti.variant_id
      WHERE coalesce(s.status, 'finalized') != 'cancelled'
    ), 0),
    'today_cash_collected', coalesce((
      SELECT sum(amount) FROM public.customer_payments
      WHERE payment_date >= v_start
    ), 0) + coalesce((
      SELECT sum(paid_amount) FROM public.sales
      WHERE customer_id IS NULL AND sale_date >= v_start AND coalesce(status, 'finalized') != 'cancelled'
    ), 0),
    'today_credit_sales', coalesce((
      SELECT sum(balance_due) FROM public.sales
      WHERE sale_date >= v_start AND coalesce(status, 'finalized') != 'cancelled'
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

GRANT EXECUTE ON FUNCTION public.wholesaler_get_dashboard_metrics(text) TO anon, authenticated, service_role;

-- 2. 360° Shop Insights RPC: Sales, Profit, Lifetime Credit & Repayments
CREATE OR REPLACE FUNCTION public.wholesaler_get_customer_insights(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_cust record;
  v_total_sales numeric;
  v_sales_count int;
  v_total_profit numeric;
  v_total_credit_taken numeric;
  v_total_payments_made numeric;
  v_credit_sales_count int;
  v_settled_credit_count int;
BEGIN
  SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
  END IF;

  SELECT
    coalesce(sum(total_amount), 0),
    count(*)
  INTO v_total_sales, v_sales_count
  FROM public.sales
  WHERE customer_id = p_customer_id AND coalesce(status, 'finalized') != 'cancelled';

  SELECT coalesce(
    round(
      sum(
        ti.line_total - (
          ti.total_units * (
            coalesce(nullif(pv.cost_price, 0), coalesce(pv.price, ti.price_per_carton, 0) * 0.85) /
            greatest(coalesce(ti.pieces_per_carton, pv.pieces_per_unit, 1), 1)
          )
        )
      ),
      2
    ),
    0
  ) INTO v_total_profit
  FROM public.sale_items ti
  JOIN public.sales s ON s.id = ti.sale_id
  LEFT JOIN public.product_variants pv ON pv.id = ti.variant_id
  WHERE s.customer_id = p_customer_id AND coalesce(s.status, 'finalized') != 'cancelled';

  SELECT coalesce(sum(balance_due), 0), count(*)
  INTO v_total_credit_taken, v_credit_sales_count
  FROM public.sales
  WHERE customer_id = p_customer_id AND coalesce(balance_due, 0) > 0 AND coalesce(status, 'finalized') != 'cancelled';

  SELECT coalesce(sum(amount), 0), count(*)
  INTO v_total_payments_made, v_settled_credit_count
  FROM public.customer_payments
  WHERE customer_id = p_customer_id;

  v_res := jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'name', v_cust.name,
    'owner_name', v_cust.owner_name,
    'phone', v_cust.phone,
    'address', v_cust.address,
    'current_balance', coalesce(v_cust.current_balance, 0),
    'credit_limit', coalesce(v_cust.credit_limit, 0),
    'created_at', v_cust.created_at,
    'total_sales', v_total_sales,
    'sales_count', v_sales_count,
    'total_profit', v_total_profit,
    'total_credit_taken', v_total_credit_taken,
    'credit_sales_count', v_credit_sales_count,
    'total_payments_made', v_total_payments_made,
    'payments_count', v_settled_credit_count
  );

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wholesaler_get_customer_insights(uuid) TO anon, authenticated, service_role;
