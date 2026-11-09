-- Migration: 20261011000007_fix_rpc_exact_columns.sql
-- Description: Updates RPCs with exact column names

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
BEGIN
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
  v_receipt_no := 'SLIP-' || to_char(coalesce(p_sale_date, now()), 'YYYY') || '-' || lpad(v_seq_val::text, 5, '0');

  -- 4. Calculate Subtotal and Create Sale Record
  INSERT INTO public.sales (
    receipt_no, customer_id, customer_name_snapshot, customer_phone_snapshot,
    sale_date, subtotal, discount, total_amount, paid_amount, balance_due,
    previous_balance_snapshot, payment_method, notes, status
  ) VALUES (
    v_receipt_no, p_customer_id, v_customer_name, v_customer_phone,
    coalesce(p_sale_date, now()), 0, coalesce(p_discount, 0), 0, coalesce(p_paid_amount, 0), 0,
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
        p_customer_id, v_sale_id, p_paid_amount, coalesce(p_sale_date, now()), p_payment_method, 'Payment for ' || v_receipt_no
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'receipt_no', v_receipt_no,
    'previous_balance', v_prev_balance,
    'subtotal', v_subtotal,
    'discount', coalesce(p_discount, 0),
    'total_amount', v_total_amount,
    'paid_amount', coalesce(p_paid_amount, 0),
    'balance_due', v_balance_due,
    'new_balance', v_new_cust_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


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
  -- 1. Create Purchase Header
  INSERT INTO public.purchases (
    supplier_id, invoice_no, purchase_date, subtotal, total_cost,
    transport_cost, paid_amount, balance_amount, payment_method, notes, status
  ) VALUES (
    p_supplier_id, p_invoice_no, coalesce(p_purchase_date, now()), 0, 0,
    coalesce(p_transport_cost, 0), coalesce(p_paid_amount, 0), 0,
    p_payment_method, p_notes, 'received'
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
