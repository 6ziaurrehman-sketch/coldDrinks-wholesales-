-- ==============================================================================
-- Migration: Fix wholesaler_update_order_status RPC Lock
-- Description:
-- Separates the FOR UPDATE lock on public.orders from the shops lookup to eliminate:
-- 'ERROR: 42P10: FOR UPDATE cannot be applied to the nullable side of an outer join'
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.wholesaler_update_order_status(
  p_order_id uuid,
  p_new_status text,       -- 'processing', 'out_for_delivery', 'delivered', 'cancelled'
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item record;
  v_slip_no text;
  v_sale_id uuid;
  v_customer_id uuid;
  v_shop_name text := 'Customer Shop';
  v_shop_phone text := NULL;
  v_pieces int := 1;
BEGIN
  -- 1. Lock and retrieve order directly without outer join
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist', p_order_id;
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'ORDER_ALREADY_FINALIZED: Order is already marked as %', v_order.status;
  END IF;

  -- 2. Fetch shop details if linked
  IF v_order.shop_id IS NOT NULL THEN
    SELECT name, phone
    INTO v_shop_name, v_shop_phone
    FROM public.shops
    WHERE id = v_order.shop_id;
  END IF;

  -- 3. Update order status and append notes
  UPDATE public.orders
  SET 
    status = p_new_status::order_status_enum,
    notes = CASE 
      WHEN p_notes IS NOT NULL AND p_notes <> '' THEN COALESCE(notes, '') || ' | ' || p_notes
      ELSE notes
    END,
    updated_at = now()
  WHERE id = p_order_id;

  -- 4. If delivered, automatically finalize into wholesaler sales slip & deduct warehouse stock
  IF p_new_status = 'delivered' THEN
    -- Match or create customer in customers table
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE name ILIKE v_shop_name
    LIMIT 1;

    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (name, phone, address, notes)
      VALUES (v_shop_name, v_shop_phone, 'User App Customer', 'Auto-created from Order #' || v_order.order_number)
      RETURNING id INTO v_customer_id;
    END IF;

    -- Generate receipt number
    v_slip_no := 'SLIP-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');

    -- Insert into sales table
    INSERT INTO public.sales (
      receipt_no,
      customer_id,
      customer_name_snapshot,
      customer_phone_snapshot,
      sale_date,
      subtotal,
      discount,
      total_amount,
      paid_amount,
      balance_due,
      payment_method,
      notes,
      status
    ) VALUES (
      v_slip_no,
      v_customer_id,
      v_shop_name,
      v_shop_phone,
      now(),
      v_order.subtotal,
      v_order.discount_total,
      v_order.grand_total,
      CASE WHEN v_order.payment_method::text = 'cash' THEN v_order.grand_total ELSE 0 END,
      CASE WHEN v_order.payment_method::text = 'cash' THEN 0 ELSE v_order.grand_total END,
      CASE 
        WHEN v_order.payment_method::text IN ('cash', 'credit', 'bank_transfer') THEN v_order.payment_method::text 
        ELSE 'cash' 
      END,
      'Delivered Order #' || v_order.order_number || CASE WHEN p_notes IS NOT NULL THEN ' - ' || p_notes ELSE '' END,
      'finalized'
    ) RETURNING id INTO v_sale_id;

    -- Record sale line items & deduct stock
    FOR v_item IN SELECT * FROM public.order_items WHERE order_id = p_order_id LOOP
      SELECT pieces_per_unit INTO v_pieces
      FROM public.product_variants
      WHERE id = v_item.variant_id;
      
      IF v_pieces IS NULL OR v_pieces < 1 THEN
        v_pieces := COALESCE(v_item.pieces_per_unit, 1);
      END IF;

      INSERT INTO public.sale_items (
        sale_id,
        variant_id,
        cartons_qty,
        loose_units_qty,
        price_per_carton,
        price_per_unit,
        line_total
      ) VALUES (
        v_sale_id,
        v_item.variant_id,
        v_item.qty,
        0,
        v_item.unit_price,
        v_item.unit_price / GREATEST(1, v_pieces),
        v_item.line_total
      );

      -- Deduct warehouse stock
      UPDATE public.inventory
      SET total_units = GREATEST(0, total_units - (v_item.qty * v_pieces))
      WHERE variant_id = v_item.variant_id;
    END LOOP;

    -- If credit, increase customer current_balance in Khata
    IF v_order.payment_method::text = 'credit' AND v_customer_id IS NOT NULL THEN
      UPDATE public.customers
      SET current_balance = current_balance + v_order.grand_total
      WHERE id = v_customer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_status', p_new_status,
    'receipt_no', v_slip_no
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wholesaler_update_order_status(uuid, text, text) TO authenticated, anon;
