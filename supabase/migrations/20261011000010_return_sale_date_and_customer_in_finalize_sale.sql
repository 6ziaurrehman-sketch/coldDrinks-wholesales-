-- Migration: 20261011000010_return_sale_date_and_customer_in_finalize_sale.sql
-- Description: Ensures wholesaler_finalize_sale returns complete receipt fields (sale_date, customer_name, customer_phone, payment_method, current_total_balance)

CREATE OR REPLACE FUNCTION public.wholesaler_finalize_sale(
  p_customer_id uuid DEFAULT NULL,
  p_sale_date timestamptz DEFAULT now(),
  p_discount numeric DEFAULT 0,
  p_paid_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_sale_id uuid;
  v_receipt_no text;
  v_customer_name text;
  v_customer_phone text;
  v_prev_balance numeric := 0;
  v_new_cust_balance numeric := 0;
  v_subtotal numeric := 0;
  v_total_amount numeric := 0;
  v_balance_due numeric := 0;
  v_item jsonb;
  v_var_id uuid;
  v_cartons int;
  v_loose int;
  v_pieces int;
  v_total_units int;
  v_price_carton numeric;
  v_price_unit numeric;
  v_line_total numeric;
  v_prod_name text;
  v_size_label text;
  v_packaging text;
  v_cur_stock int;
  v_new_stock int;
  v_seq_val bigint;
  v_actual_date timestamptz;
BEGIN
  v_actual_date := coalesce(p_sale_date, now());

  -- 1. Validate customer
  IF p_customer_id IS NOT NULL THEN
    SELECT name, phone, current_balance 
    INTO v_customer_name, v_customer_phone, v_prev_balance
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: Customer ID % does not exist', p_customer_id;
    END IF;
  ELSE
    v_customer_name := 'Counter Cash Customer';
    v_customer_phone := NULL;
    v_prev_balance := 0;
  END IF;

  -- 2. Pre-validate stock for ALL items before making any modifications
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_var_id := (v_item->>'variant_id')::uuid;
    v_cartons := coalesce((v_item->>'cartons_qty')::int, 0);
    v_loose := coalesce((v_item->>'loose_units_qty')::int, 0);

    SELECT pv.pieces_per_unit, p.name
    INTO v_pieces, v_prod_name
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_var_id;

    v_pieces := greatest(coalesce(v_pieces, 1), 1);
    v_total_units := (v_cartons * v_pieces) + v_loose;

    SELECT coalesce(total_units, 0) INTO v_cur_stock
    FROM public.inventory
    WHERE variant_id = v_var_id
    FOR UPDATE;

    IF v_cur_stock IS NULL OR v_cur_stock < v_total_units THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: % has only % units available (requested %)', v_prod_name, coalesce(v_cur_stock, 0), v_total_units;
    END IF;
  END LOOP;

  -- 3. Generate Sequential Receipt Number
  SELECT nextval('public.sales_receipt_seq') INTO v_seq_val;
  v_receipt_no := 'SLIP-' || to_char(v_actual_date, 'YYYY') || '-' || lpad(v_seq_val::text, 5, '0');

  -- 4. Calculate Subtotal and Create Sale Record
  INSERT INTO public.sales (
    receipt_no, customer_id, customer_name_snapshot, customer_phone_snapshot,
    sale_date, subtotal, discount, total_amount, paid_amount, balance_due,
    previous_balance_snapshot, payment_method, notes, status
  ) VALUES (
    v_receipt_no, p_customer_id, v_customer_name, v_customer_phone,
    v_actual_date, 0, coalesce(p_discount, 0), 0, coalesce(p_paid_amount, 0), 0,
    v_prev_balance, p_payment_method, p_notes, 'finalized'
  ) RETURNING id INTO v_sale_id;

  -- 5. Insert Items, Deduct Inventory, Record Movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_var_id := (v_item->>'variant_id')::uuid;
    v_cartons := coalesce((v_item->>'cartons_qty')::int, 0);
    v_loose := coalesce((v_item->>'loose_units_qty')::int, 0);
    v_price_carton := coalesce((v_item->>'price_per_carton')::numeric, 0);

    SELECT pv.pieces_per_unit, p.name, pv.size_label, coalesce(pv.packaging_type, p.packaging_type, 'carton'), pv.unit_sale_price
    INTO v_pieces, v_prod_name, v_size_label, v_packaging, v_price_unit
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_var_id;

    v_pieces := greatest(coalesce(v_pieces, 1), 1);
    v_total_units := (v_cartons * v_pieces) + v_loose;

    IF v_item->>'price_per_unit' IS NOT NULL THEN
      v_price_unit := (v_item->>'price_per_unit')::numeric;
    ELSIF v_price_unit IS NULL OR v_price_unit = 0 THEN
      v_price_unit := round(v_price_carton / v_pieces, 2);
    END IF;

    v_line_total := round((v_cartons * v_price_carton) + (v_loose * v_price_unit), 2);
    v_subtotal := v_subtotal + v_line_total;

    -- Insert sale item
    INSERT INTO public.sale_items (
      sale_id, variant_id, product_name_snapshot, size_label_snapshot, packaging_type_snapshot,
      pieces_per_carton, cartons_qty, loose_units_qty, total_units,
      price_per_carton, price_per_unit, line_total
    ) VALUES (
      v_sale_id, v_var_id, v_prod_name, coalesce(v_size_label, 'Regular'), v_packaging,
      v_pieces, v_cartons, v_loose, v_total_units,
      v_price_carton, v_price_unit, v_line_total
    );

    -- Deduct stock
    SELECT total_units INTO v_cur_stock FROM public.inventory WHERE variant_id = v_var_id FOR UPDATE;
    v_new_stock := v_cur_stock - v_total_units;
    UPDATE public.inventory SET total_units = v_new_stock, updated_at = now() WHERE variant_id = v_var_id;

    -- Stock movement audit
    INSERT INTO public.stock_movements (
      variant_id, movement_type, change_units, balance_units_after, reference_id, reason
    ) VALUES (
      v_var_id, 'sale', -v_total_units, v_new_stock, v_sale_id::text, 'Sale slip ' || v_receipt_no
    );
  END LOOP;

  -- 6. Finalize Sale Totals
  v_total_amount := greatest(v_subtotal - coalesce(p_discount, 0), 0);
  v_balance_due := greatest(v_total_amount - coalesce(p_paid_amount, 0), 0);

  UPDATE public.sales
  SET subtotal = v_subtotal, total_amount = v_total_amount, balance_due = v_balance_due
  WHERE id = v_sale_id;

  -- 7. Update Customer Khata & Record Ledger
  IF p_customer_id IS NOT NULL THEN
    v_new_cust_balance := v_prev_balance + v_balance_due;
    UPDATE public.customers SET current_balance = v_new_cust_balance, updated_at = now() WHERE id = p_customer_id;

    -- Debit entry for sale
    INSERT INTO public.wholesaler_customer_ledger (
      customer_id, entry_type, reference_id, debit, credit, running_balance, description
    ) VALUES (
      p_customer_id, 'sale', v_sale_id::text, v_total_amount, 0, v_prev_balance + v_total_amount, 'Sales Slip ' || v_receipt_no
    );

    -- Credit entry if paid anything immediately
    IF coalesce(p_paid_amount, 0) > 0 THEN
      INSERT INTO public.wholesaler_customer_ledger (
        customer_id, entry_type, reference_id, debit, credit, running_balance, description
      ) VALUES (
        p_customer_id, 'payment', v_sale_id::text, 0, p_paid_amount, v_new_cust_balance, 'Payment at sale ' || v_receipt_no
      );

      INSERT INTO public.customer_payments (
        customer_id, sale_id, amount, payment_date, payment_method, notes
      ) VALUES (
        p_customer_id, v_sale_id, p_paid_amount, v_actual_date, p_payment_method, 'Payment for ' || v_receipt_no
      );
    END IF;
  ELSE
    v_new_cust_balance := 0;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'receipt_no', v_receipt_no,
    'customer_name', coalesce(v_customer_name, 'Cash Customer'),
    'customer_phone', v_customer_phone,
    'sale_date', to_char(v_actual_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'payment_method', p_payment_method,
    'previous_balance', v_prev_balance,
    'subtotal', v_subtotal,
    'discount', coalesce(p_discount, 0),
    'total_amount', v_total_amount,
    'paid_amount', coalesce(p_paid_amount, 0),
    'balance_due', v_balance_due,
    'new_balance', v_new_cust_balance,
    'current_total_balance', coalesce(v_new_cust_balance, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
