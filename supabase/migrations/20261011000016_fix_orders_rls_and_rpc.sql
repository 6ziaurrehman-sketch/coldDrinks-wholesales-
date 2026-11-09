-- ==============================================================================
-- Migration 16: Orders RLS Policies & Atomic Order Creation RPC
-- Description:
-- 1. Adds missing INSERT, UPDATE, and SELECT RLS policies on orders and order_items
--    so authenticated shop members/owners can place orders and view them.
-- 2. Provides create_shop_order() SECURITY DEFINER RPC for atomic, safe ordering.
-- ==============================================================================

-- 1. Ensure RLS is enabled
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- 2. ORDERS table policies
DROP POLICY IF EXISTS "Shop members read orders" ON public.orders;
DROP POLICY IF EXISTS "Shop members can create orders" ON public.orders;
DROP POLICY IF EXISTS "Shop members can update orders" ON public.orders;

CREATE POLICY "Shop members read orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.is_shop_member(shop_id) 
  OR user_id = auth.uid()
);

CREATE POLICY "Shop members can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_shop_member(shop_id) 
  OR user_id = auth.uid()
);

CREATE POLICY "Shop members can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.is_shop_member(shop_id) 
  OR user_id = auth.uid()
)
WITH CHECK (
  public.is_shop_member(shop_id) 
  OR user_id = auth.uid()
);

-- 3. ORDER_ITEMS table policies
DROP POLICY IF EXISTS "Shop members read order items" ON public.order_items;
DROP POLICY IF EXISTS "Shop members can insert order items" ON public.order_items;

CREATE POLICY "Shop members read order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (public.is_shop_member(o.shop_id) OR o.user_id = auth.uid())
  )
);

CREATE POLICY "Shop members can insert order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (public.is_shop_member(o.shop_id) OR o.user_id = auth.uid())
  )
);

-- 4. ORDER_STATUS_HISTORY table policies
DROP POLICY IF EXISTS "Shop members read order status" ON public.order_status_history;
DROP POLICY IF EXISTS "Shop members can insert order status" ON public.order_status_history;

CREATE POLICY "Shop members read order status"
ON public.order_status_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_history.order_id
      AND (public.is_shop_member(o.shop_id) OR o.user_id = auth.uid())
  )
);

CREATE POLICY "Shop members can insert order status"
ON public.order_status_history
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_history.order_id
      AND (public.is_shop_member(o.shop_id) OR o.user_id = auth.uid())
  )
);

-- 5. ATOMIC RPC: create_shop_order
CREATE OR REPLACE FUNCTION public.create_shop_order(
  p_shop_id uuid,
  p_address_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_num int;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_qty int;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_prod_name text;
  v_brand text;
  v_sale_unit text;
  v_pieces int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to place an order';
  END IF;

  -- Calculate subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'qty')::int, 1);
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_subtotal := v_subtotal + (v_unit_price * v_qty);
  END LOOP;

  -- Create order row
  INSERT INTO public.orders (
    shop_id,
    user_id,
    address_id,
    payment_method,
    payment_status,
    status,
    subtotal,
    grand_total,
    notes
  ) VALUES (
    p_shop_id,
    auth.uid(),
    p_address_id,
    p_payment_method::payment_method_enum,
    'unpaid',
    'confirmed',
    v_subtotal,
    v_subtotal,
    p_notes
  )
  RETURNING id, order_number INTO v_order_id, v_order_num;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_qty := COALESCE((v_item->>'qty')::int, 1);
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_line_total := v_unit_price * v_qty;
    v_prod_name := COALESCE(v_item->>'product_name', 'Cold Drink');
    v_brand := v_item->>'brand';
    v_sale_unit := COALESCE(v_item->>'sale_unit', 'carton');
    v_pieces := COALESCE((v_item->>'pieces_per_unit')::int, 1);

    INSERT INTO public.order_items (
      order_id,
      variant_id,
      product_name,
      brand,
      sale_unit,
      pieces_per_unit,
      unit_price,
      qty,
      line_total
    ) VALUES (
      v_order_id,
      v_variant_id,
      v_prod_name,
      v_brand,
      v_sale_unit,
      v_pieces,
      v_unit_price,
      v_qty,
      v_line_total
    );
  END LOOP;

  -- Log initial status history
  INSERT INTO public.order_status_history (
    order_id,
    status,
    changed_by,
    notes
  ) VALUES (
    v_order_id,
    'confirmed',
    auth.uid(),
    'Order placed by customer'
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_order_id,
    'order_number', v_order_num,
    'grand_total', v_subtotal
  );
END;
$$;
