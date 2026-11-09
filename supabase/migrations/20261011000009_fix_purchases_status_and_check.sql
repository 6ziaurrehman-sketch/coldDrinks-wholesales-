-- Migration: 20261011000009_fix_purchases_status_and_check.sql
-- Description: Updates purchases status check constraint and wholesaler_finalize_purchase

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check 
  CHECK (status IN ('draft', 'finalized', 'received', 'cancelled'));

CREATE OR REPLACE FUNCTION public.wholesaler_finalize_purchase(
  p_supplier_id uuid,
  p_invoice_no text,
  p_purchase_date timestamptz DEFAULT now(),
  p_transport_cost numeric DEFAULT 0,
  p_paid_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_purchase_id uuid;
  v_subtotal numeric := 0;
  v_total_cost numeric := 0;
  v_balance_amount numeric := 0;
  v_item jsonb;
  v_var_id uuid;
  v_cartons int;
  v_loose int;
  v_pieces int;
  v_total_units int;
  v_cost_carton numeric;
  v_cost_unit numeric;
  v_line_subtotal numeric;
  v_name text;
  v_cur_stock int;
  v_new_stock int;
BEGIN
  -- 1. Create Purchase Header with status 'finalized'
  INSERT INTO public.purchases (
    supplier_id, invoice_no, purchase_date, subtotal, total_cost,
    transport_cost, paid_amount, balance_amount, payment_method, notes, status
  ) VALUES (
    p_supplier_id, p_invoice_no, coalesce(p_purchase_date, now()), 0, 0,
    coalesce(p_transport_cost, 0), coalesce(p_paid_amount, 0), 0,
    p_payment_method, p_notes, 'finalized'
  ) RETURNING id INTO v_purchase_id;

  -- 2. Process Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_var_id := (v_item->>'variant_id')::uuid;
    v_cartons := coalesce((v_item->>'cartons_qty')::int, 0);
    v_loose := coalesce((v_item->>'loose_units_qty')::int, 0);
    v_cost_carton := coalesce((v_item->>'cost_per_carton')::numeric, 0);

    SELECT pv.pieces_per_unit, p.name INTO v_pieces, v_name
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_var_id;

    v_pieces := greatest(coalesce(v_pieces, 1), 1);
    v_total_units := (v_cartons * v_pieces) + v_loose;
    v_cost_unit := round(v_cost_carton / v_pieces, 2);
    v_line_subtotal := round((v_cartons * v_cost_carton) + (v_loose * v_cost_unit), 2);
    v_subtotal := v_subtotal + v_line_subtotal;

    -- Insert purchase item
    INSERT INTO public.purchase_items (
      purchase_id, variant_id, product_name_snapshot, pieces_per_carton,
      cartons_qty, loose_units_qty, total_units, cost_per_carton, cost_per_unit, subtotal
    ) VALUES (
      v_purchase_id, v_var_id, v_name, v_pieces,
      v_cartons, v_loose, v_total_units, v_cost_carton, v_cost_unit, v_line_subtotal
    );

    -- Atomically increase inventory
    SELECT coalesce(total_units, 0) INTO v_cur_stock
    FROM public.inventory WHERE variant_id = v_var_id FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.inventory (variant_id, total_units) VALUES (v_var_id, 0);
      v_cur_stock := 0;
    END IF;

    v_new_stock := v_cur_stock + v_total_units;
    UPDATE public.inventory SET total_units = v_new_stock, updated_at = now() WHERE variant_id = v_var_id;

    -- Update variant cost price
    IF v_cost_carton > 0 THEN
      UPDATE public.product_variants SET cost_price = v_cost_carton WHERE id = v_var_id;
    END IF;

    -- Record movement audit
    INSERT INTO public.stock_movements (
      variant_id, movement_type, change_units, balance_units_after, reference_id, reason
    ) VALUES (
      v_var_id, 'purchase', v_total_units, v_new_stock, v_purchase_id::text, 'Purchase invoice ' || p_invoice_no
    );
  END LOOP;

  -- 3. Finalize Totals & Supplier Balance
  v_total_cost := v_subtotal + coalesce(p_transport_cost, 0);
  v_balance_amount := v_total_cost - coalesce(p_paid_amount, 0);

  UPDATE public.purchases
  SET subtotal = v_subtotal, total_cost = v_total_cost, balance_amount = v_balance_amount
  WHERE id = v_purchase_id;

  -- If unpaid balance, update supplier balance payable
  IF v_balance_amount > 0 AND p_supplier_id IS NOT NULL THEN
    UPDATE public.suppliers
    SET balance_payable = balance_payable + v_balance_amount, updated_at = now()
    WHERE id = p_supplier_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'invoice_no', p_invoice_no,
    'total_cost', v_total_cost,
    'paid_amount', p_paid_amount,
    'balance_amount', v_balance_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
