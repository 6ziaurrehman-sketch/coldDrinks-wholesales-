-- Migration: 20261115000001_top_selling_products_time_range_and_profit.sql
-- Description: Adds time range filtering ('today', 'yesterday', '3_days', '7_days', 'month', 'all')
-- and computes both total_revenue and total_profit (revenue - cost) for each top selling product.

-- Drop previous overloaded signatures to avoid ambiguous RPC routing
DROP FUNCTION IF EXISTS public.wholesaler_get_top_selling_products();
DROP FUNCTION IF EXISTS public.wholesaler_get_top_selling_products(text);
DROP FUNCTION IF EXISTS public.wholesaler_get_top_selling_products(int);
DROP FUNCTION IF EXISTS public.wholesaler_get_top_selling_products(text, int);

CREATE OR REPLACE FUNCTION public.wholesaler_get_top_selling_products(
  p_range text DEFAULT 'all',
  p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res jsonb;
  v_now timestamptz := now();
  v_today_start timestamptz := (date_trunc('day', v_now AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi');
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_range = 'today' OR p_range = '1_day' THEN
    v_start := v_today_start;
    v_end := NULL;
  ELSIF p_range = 'yesterday' THEN
    v_start := (date_trunc('day', v_now AT TIME ZONE 'Asia/Karachi') - interval '1 day') AT TIME ZONE 'Asia/Karachi';
    v_end := v_today_start;
  ELSIF p_range = '3_days' THEN
    v_start := (date_trunc('day', v_now AT TIME ZONE 'Asia/Karachi') - interval '2 days') AT TIME ZONE 'Asia/Karachi';
    v_end := NULL;
  ELSIF p_range = '7_days' OR p_range = 'week' THEN
    v_start := (date_trunc('day', v_now AT TIME ZONE 'Asia/Karachi') - interval '6 days') AT TIME ZONE 'Asia/Karachi';
    v_end := NULL;
  ELSIF p_range = 'month' OR p_range = '30_days' THEN
    v_start := (date_trunc('month', v_now AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi');
    v_end := NULL;
  ELSIF p_range = 'all' THEN
    v_start := NULL;
    v_end := NULL;
  ELSE
    -- default fallback: no boundary
    v_start := NULL;
    v_end := NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_name', t.product_name,
        'size_label', t.size_label,
        'cartons_sold', t.total_cartons,
        'loose_sold', t.total_loose,
        'total_units_sold', t.total_units,
        'total_revenue', t.total_revenue,
        'total_cost', t.total_cost,
        'total_profit', t.total_profit
      )
    ),
    '[]'::jsonb
  ) INTO v_res
  FROM (
    SELECT
      ti.product_name_snapshot AS product_name,
      ti.size_label_snapshot AS size_label,
      SUM(ti.cartons_qty)::integer AS total_cartons,
      SUM(ti.loose_units_qty)::integer AS total_loose,
      SUM(ti.total_units)::integer AS total_units,
      ROUND(SUM(ti.line_total), 2)::numeric(12,2) AS total_revenue,
      ROUND(
        SUM(
          ti.total_units * (
            COALESCE(NULLIF(pv.cost_price, 0), COALESCE(pv.price, ti.price_per_carton, 0) * 0.85) / 
            GREATEST(COALESCE(ti.pieces_per_carton, pv.pieces_per_unit, 1), 1)
          )
        ), 
        2
      )::numeric(12,2) AS total_cost,
      ROUND(
        SUM(
          ti.line_total - (
            ti.total_units * (
              COALESCE(NULLIF(pv.cost_price, 0), COALESCE(pv.price, ti.price_per_carton, 0) * 0.85) / 
              GREATEST(COALESCE(ti.pieces_per_carton, pv.pieces_per_unit, 1), 1)
            )
          )
        ), 
        2
      )::numeric(12,2) AS total_profit
    FROM public.sale_items ti
    JOIN public.sales s ON s.id = ti.sale_id
    LEFT JOIN public.product_variants pv ON pv.id = ti.variant_id
    WHERE COALESCE(s.status, 'finalized') != 'cancelled'
      AND (v_start IS NULL OR s.sale_date >= v_start)
      AND (v_end IS NULL OR s.sale_date < v_end)
    GROUP BY ti.product_name_snapshot, ti.size_label_snapshot
    ORDER BY total_cartons DESC, total_units DESC, total_revenue DESC
    LIMIT COALESCE(p_limit, 10)
  ) t;

  RETURN v_res;
END;
$$;

-- Grant execute permissions to all roles
GRANT EXECUTE ON FUNCTION public.wholesaler_get_top_selling_products(text, int) TO anon, authenticated, service_role;
