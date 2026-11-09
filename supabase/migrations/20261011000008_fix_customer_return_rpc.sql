-- Migration: 20261011000008_fix_customer_return_rpc.sql
-- Description: Updates wholesaler_record_customer_return to use exact columns and movement types

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
  IF coalesce(p_cartons_qty, 0) <= 0 AND coalesce(p_loose_units_qty, 0) <= 0 THEN
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

  v_pieces := greatest(coalesce(v_pieces, 1), 1);
  v_units_returned := (coalesce(p_cartons_qty, 0) * v_pieces) + coalesce(p_loose_units_qty, 0);

  -- 3. Increase inventory
  UPDATE public.inventory
  SET total_units = total_units + v_units_returned,
      updated_at = now()
  WHERE variant_id = p_variant_id
  RETURNING total_units INTO v_new_units;

  -- 4. Record stock movement audit matching exact schema
  INSERT INTO public.stock_movements (
    variant_id, movement_type, change_units, balance_units_after, reference_id, reason
  ) VALUES (
    p_variant_id, 'customer_return', v_units_returned, v_new_units, p_customer_id::text,
    format('Return from customer: %s (%s cartons, %s loose)', p_reason, p_cartons_qty, p_loose_units_qty)
  );

  -- 5. Record stock adjustment audit
  INSERT INTO public.stock_adjustments (
    variant_id, adjustment_type, units_delta, reason, notes
  ) VALUES (
    p_variant_id, 'return', v_units_returned, p_reason, p_notes
  );

  -- 6. If customer credit is specified, credit customer Khata
  IF p_customer_id IS NOT NULL AND coalesce(p_credit_amount, 0) > 0 THEN
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'units_returned', v_units_returned,
    'new_stock_units', v_new_units,
    'credit_amount', coalesce(p_credit_amount, 0),
    'new_customer_balance', coalesce(v_new_debt, v_current_debt)
  );
END;
$$;
