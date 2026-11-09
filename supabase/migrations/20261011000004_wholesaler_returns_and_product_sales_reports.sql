-- ==============================================================================
-- Migration: 20261011000004_wholesaler_returns_and_product_sales_reports.sql
-- Description: Adds atomic customer sales return RPC and top selling products report
-- ==============================================================================

-- 1. Atomic Customer Return RPC
CREATE OR REPLACE FUNCTION public.wholesaler_record_customer_return(
  p_customer_id uuid,
  p_variant_id uuid,
  p_cartons_qty integer DEFAULT 0,
  p_loose_units_qty integer DEFAULT 0,
  p_credit_amount numeric DEFAULT 0,
  p_reason text DEFAULT 'Customer returned stock',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pieces integer;
  v_prod_id uuid;
  v_prod_name text;
  v_size_label text;
  v_units_returned integer;
  v_new_units integer;
  v_current_debt numeric(12,2);
  v_new_debt numeric(12,2);
BEGIN
  -- 1. Validate inputs
  IF p_cartons_qty <= 0 AND p_loose_units_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_RETURN: Returned quantity must be greater than zero';
  END IF;

  -- 2. Fetch variant packaging and product info
  SELECT pv.pieces_per_unit, pv.product_id, p.name, pv.size_label
  INTO v_pieces, v_prod_id, v_prod_name, v_size_label
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND: Product variant % does not exist', p_variant_id;
  END IF;

  v_pieces := COALESCE(v_pieces, 1);
  v_units_returned := (p_cartons_qty * v_pieces) + p_loose_units_qty;

  -- 3. Atomically increment inventory
  UPDATE public.inventory
  SET total_units = total_units + v_units_returned,
      updated_at = now()
  WHERE variant_id = p_variant_id
  RETURNING total_units INTO v_new_units;

  -- 4. Record stock movement
  INSERT INTO public.stock_movements (
    variant_id, movement_type, units_delta, balance_after, reference_type, notes
  ) VALUES (
    p_variant_id, 'return', v_units_returned, v_new_units, 'customer_return',
    format('Return from customer: %s (%s cartons, %s loose)', p_reason, p_cartons_qty, p_loose_units_qty)
  );

  -- 5. Record stock adjustment audit
  INSERT INTO public.stock_adjustments (
    variant_id, adjustment_type, units_delta, reason, notes
  ) VALUES (
    p_variant_id, 'return', v_units_returned, p_reason, p_notes
  );

  -- 6. If customer credit is specified, credit customer Khata
  IF p_customer_id IS NOT NULL AND p_credit_amount > 0 THEN
    SELECT current_balance INTO v_current_debt
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_debt := v_current_debt - p_credit_amount;
      UPDATE public.customers
      SET current_balance = v_new_debt,
          updated_at = now()
      WHERE id = p_customer_id;

      INSERT INTO public.wholesaler_customer_ledger (
        customer_id, entry_type, debit, credit, running_balance, description
      ) VALUES (
        p_customer_id, 'return', 0, p_credit_amount, v_new_debt,
        format('Return credit for %s (%s): %s', v_prod_name, v_size_label, p_reason)
      );
    END IF;
  ELSE
    SELECT current_balance INTO v_new_debt
    FROM public.customers
    WHERE id = p_customer_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'units_returned', v_units_returned,
    'new_stock_units', v_new_units,
    'credit_amount', p_credit_amount,
    'new_customer_balance', COALESCE(v_new_debt, 0)
  );
END;
$$;

-- 2. Top Selling Cold Drinks Query RPC
CREATE OR REPLACE FUNCTION public.wholesaler_get_top_selling_products()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_name', t.product_name_snapshot,
        'size_label', t.size_label_snapshot,
        'cartons_sold', t.total_cartons,
        'loose_sold', t.total_loose,
        'total_units_sold', t.total_units,
        'total_revenue', t.total_revenue
      )
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM (
    SELECT
      product_name_snapshot,
      size_label_snapshot,
      SUM(cartons_qty)::integer AS total_cartons,
      SUM(loose_units_qty)::integer AS total_loose,
      SUM(total_units)::integer AS total_units,
      SUM(line_total)::numeric(12,2) AS total_revenue
    FROM public.sale_items
    GROUP BY product_name_snapshot, size_label_snapshot
    ORDER BY total_units DESC
    LIMIT 6
  ) t;

  RETURN v_result;
END;
$$;
