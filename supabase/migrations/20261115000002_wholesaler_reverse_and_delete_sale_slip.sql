-- Migration: 20261115000002_wholesaler_reverse_and_delete_sale_slip.sql
-- Description: Adds wholesaler_reverse_sale RPC to safely and completely reverse a sales slip,
-- restore product stock to warehouse inventory, adjust customer Khata debt/balance,
-- delete associated ledger and payment records, and permanently remove the sales slip.

CREATE OR REPLACE FUNCTION public.wholesaler_reverse_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item record;
  v_units integer;
BEGIN
  -- 1. Lock and fetch sale record
  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Sale %s not found or already deleted', p_sale_id)
    );
  END IF;

  -- 2. Restore stock inventory for each line item
  FOR v_item IN
    SELECT variant_id, total_units, cartons_qty, loose_units_qty, pieces_per_carton
    FROM public.sale_items
    WHERE sale_id = p_sale_id
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      v_units := COALESCE(
        v_item.total_units,
        (COALESCE(v_item.cartons_qty, 0) * GREATEST(COALESCE(v_item.pieces_per_carton, 1), 1)) + COALESCE(v_item.loose_units_qty, 0)
      );

      IF v_units > 0 THEN
        UPDATE public.inventory
        SET total_units = COALESCE(total_units, 0) + v_units,
            updated_at = now()
        WHERE variant_id = v_item.variant_id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Adjust customer Khata balance if credit balance_due was recorded
  IF v_sale.customer_id IS NOT NULL AND COALESCE(v_sale.balance_due, 0) > 0 THEN
    UPDATE public.customers
    SET current_balance = GREATEST(0, COALESCE(current_balance, 0) - v_sale.balance_due),
        updated_at = now()
    WHERE id = v_sale.customer_id;
  END IF;

  -- 4. Clean up associated customer payments and customer ledger entries
  DELETE FROM public.customer_payments WHERE sale_id = p_sale_id;
  DELETE FROM public.wholesaler_customer_ledger WHERE reference_id = p_sale_id::text;

  -- 5. Clean up stock movement records for this sale
  DELETE FROM public.stock_movements WHERE reference_id = p_sale_id::text;

  -- 6. Delete sale items and the sale record itself
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;
  DELETE FROM public.sales WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Sale slip %s successfully reversed, stock restored, and records removed.', COALESCE(v_sale.receipt_no, p_sale_id::text)),
    'receipt_no', v_sale.receipt_no,
    'customer_id', v_sale.customer_id
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.wholesaler_reverse_sale(uuid) TO authenticated, service_role, anon;

-- Update admin_danger_delete_sale to use this robust transactional implementation
CREATE OR REPLACE FUNCTION public.admin_danger_delete_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.wholesaler_reverse_sale(p_sale_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_danger_delete_sale(uuid) TO authenticated, service_role, anon;
