-- ==============================================================================
-- Migration: Order Tracking, Delivery Statuses & Realtime (C11 - Order Tracking)
-- Features:
-- 1. Three separate status fields on orders:
--    - order_status (placed, confirmed, processing, ready, out_for_delivery, delivered, partially_delivered, cancelled, rejected)
--    - payment_status (unpaid, proof_submitted, partially_paid, paid, refunded)
--    - delivery_status (unassigned, assigned, out_for_delivery, delivered, failed, rescheduled)
-- 2. Delivered vs ordered quantities on order_items: delivered_qty (int default 0)
-- 3. Delivery ETA and failure details:
--    - delivery_eta timestamptz
--    - delivery_failure_reason text
--    - delivery_rescheduled_date date
-- 4. Audit trigger on orders:
--    - Writes to order_status_history whenever order_status, payment_status, or delivery_status changes
--    - Captures status_type, from_status, to_status, actor/changed_by, notes, created_at
-- 5. Customer timeline RPC:
--    - get_order_tracking(p_order_id uuid)
--    - Returns timeline built ONLY from order_status_history, delivery status line, ETA, failure reason, and item quantities.
-- 6. RPCs for Customer Actions:
--    - reschedule_order_delivery(p_order_id uuid, p_new_date date, p_slot_id uuid, p_notes text)
--    - cancel_after_failed_delivery(p_order_id uuid, p_reason text)
-- 7. RLS policies ensuring:
--    - Shop members can read orders, history, and items.
--    - Staff role can ONLY see their own orders (user_id = auth.uid()).
--    - Owners and managers can view all shop orders.
-- ==============================================================================

-- 1. Enums for tracking & delivery statuses
DO $$ BEGIN
  CREATE TYPE order_status_type AS ENUM (
    'placed', 'confirmed', 'processing', 'ready',
    'out_for_delivery', 'delivered', 'partially_delivered',
    'cancelled', 'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_type AS ENUM (
    'unpaid', 'proof_submitted', 'partially_paid', 'paid', 'refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status_type AS ENUM (
    'unassigned', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'rescheduled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Alter orders table to conform to the 3 separate status fields and delivery tracking columns
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS order_status order_status_type NOT NULL DEFAULT 'placed',
  ADD COLUMN IF NOT EXISTS delivery_status delivery_status_type NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS delivery_eta timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failure_reason text,
  ADD COLUMN IF NOT EXISTS delivery_rescheduled_date date;

-- Add delivered_qty to order_items if not present
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS delivered_qty int DEFAULT 0;

-- 3. Enhance order_status_history to record actor, status_type, from_status, to_status
ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS status_type text DEFAULT 'order_status',
  ADD COLUMN IF NOT EXISTS from_status text,
  ADD COLUMN IF NOT EXISTS to_status text,
  ADD COLUMN IF NOT EXISTS actor_role text;

-- 4. Automatic Trigger to write order_status_history whenever any status changes
CREATE OR REPLACE FUNCTION public.handle_order_status_audit()
RETURNS trigger AS $$
DECLARE
  v_actor_role text;
BEGIN
  -- Determine current user role if available
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_actor_role 
    FROM public.shop_users 
    WHERE shop_id = NEW.shop_id AND user_id = auth.uid() AND status = 'active'
    LIMIT 1;
  ELSE
    v_actor_role := 'system';
  END IF;

  -- 1. Check order_status change
  IF (TG_OP = 'INSERT') OR (OLD.order_status IS DISTINCT FROM NEW.order_status) THEN
    INSERT INTO public.order_status_history (
      order_id, status, status_type, from_status, to_status, changed_by, actor_role, notes, created_at
    ) VALUES (
      NEW.id,
      NEW.order_status::text,
      'order_status',
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.order_status::text END,
      NEW.order_status::text,
      auth.uid(),
      v_actor_role,
      CASE 
        WHEN NEW.order_status = 'cancelled' THEN coalesce(NEW.notes, 'Order cancelled')
        ELSE null 
      END,
      now()
    );
  END IF;

  -- 2. Check delivery_status change
  IF (TG_OP = 'UPDATE') AND (OLD.delivery_status IS DISTINCT FROM NEW.delivery_status) THEN
    INSERT INTO public.order_status_history (
      order_id, status, status_type, from_status, to_status, changed_by, actor_role, notes, created_at
    ) VALUES (
      NEW.id,
      NEW.delivery_status::text,
      'delivery_status',
      OLD.delivery_status::text,
      NEW.delivery_status::text,
      auth.uid(),
      v_actor_role,
      CASE 
        WHEN NEW.delivery_status = 'failed' THEN NEW.delivery_failure_reason
        WHEN NEW.delivery_status = 'rescheduled' THEN 'Delivery rescheduled to ' || coalesce(NEW.delivery_rescheduled_date::text, 'a future date')
        ELSE null 
      END,
      now()
    );
  END IF;

  -- 3. Check payment_status change
  IF (TG_OP = 'UPDATE') AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    INSERT INTO public.order_status_history (
      order_id, status, status_type, from_status, to_status, changed_by, actor_role, notes, created_at
    ) VALUES (
      NEW.id,
      NEW.payment_status::text,
      'payment_status',
      OLD.payment_status::text,
      NEW.payment_status::text,
      auth.uid(),
      v_actor_role,
      null,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_status_audit ON public.orders;
CREATE TRIGGER trg_order_status_audit
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_audit();


-- 5. RPC get_order_tracking(p_order_id)
-- Returns timeline, delivery status, ETA, failure reason, and ordered vs delivered quantities
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
  v_timeline jsonb;
  v_items jsonb;
  v_delivery_line text;
BEGIN
  -- Fetch order
  SELECT 
    o.id,
    o.order_number,
    o.shop_id,
    o.user_id,
    o.order_status,
    o.payment_status,
    o.delivery_status,
    o.delivery_eta,
    o.delivery_failure_reason,
    o.delivery_rescheduled_date,
    o.grand_total,
    o.created_at,
    o.updated_at,
    s.name as shop_name,
    ca.full_address as delivery_address,
    ca.contact_name,
    ca.contact_phone
  INTO v_order
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  LEFT JOIN public.customer_addresses ca ON ca.id = o.address_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  -- Permission check: caller must be member of the shop
  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied to this order';
  END IF;

  -- Staff role can ONLY see their own orders
  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only view their own orders';
  END IF;

  -- Build customer timeline ONLY from order_status_history
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'status', h.status,
      'statusType', h.status_type,
      'fromStatus', h.from_status,
      'toStatus', h.to_status,
      'actorRole', h.actor_role,
      'notes', h.notes,
      'createdAt', h.created_at
    ) ORDER BY h.created_at ASC
  ), '[]'::jsonb)
  INTO v_timeline
  FROM public.order_status_history h
  WHERE h.order_id = p_order_id;

  -- Build ordered vs delivered items comparison
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'productName', oi.product_name,
      'brand', oi.brand,
      'saleUnit', oi.sale_unit,
      'piecesPerUnit', oi.pieces_per_unit,
      'orderedQty', oi.qty,
      'deliveredQty', coalesce(oi.delivered_qty, 0),
      'shortfallQty', GREATEST(0, oi.qty - coalesce(oi.delivered_qty, 0)),
      'unitPrice', oi.unit_price,
      'lineTotal', oi.line_total
    )
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  -- Delivery status line description
  v_delivery_line := CASE v_order.delivery_status
    WHEN 'unassigned' THEN 'Preparing for vehicle dispatch'
    WHEN 'assigned' THEN 'Assigned to delivery driver'
    WHEN 'out_for_delivery' THEN 'Driver is on the way to your shop'
    WHEN 'delivered' THEN 'Successfully unloaded and delivered'
    WHEN 'failed' THEN 'Delivery attempt unsuccessful: ' || coalesce(v_order.delivery_failure_reason, 'Customer unavailable')
    WHEN 'rescheduled' THEN 'Delivery rescheduled for ' || coalesce(v_order.delivery_rescheduled_date::text, 'next slot')
    ELSE 'Order confirmed'
  END;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'shopId', v_order.shop_id,
    'shopName', v_order.shop_name,
    'orderStatus', v_order.order_status,
    'paymentStatus', v_order.payment_status,
    'deliveryStatus', v_order.delivery_status,
    'deliveryStatusLine', v_delivery_line,
    'deliveryEta', v_order.delivery_eta,
    'failureReason', v_order.delivery_failure_reason,
    'rescheduledDate', v_order.delivery_rescheduled_date,
    'deliveryAddress', v_order.delivery_address,
    'contactName', v_order.contact_name,
    'contactPhone', v_order.contact_phone,
    'grandTotal', v_order.grand_total,
    'createdAt', v_order.created_at,
    'updatedAt', v_order.updated_at,
    'timeline', v_timeline,
    'items', v_items
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC: Reschedule delivery after a failed or delayed delivery
CREATE OR REPLACE FUNCTION public.reschedule_order_delivery(
  p_order_id uuid,
  p_new_date date,
  p_slot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only reschedule their own orders';
  END IF;

  IF v_order.order_status IN ('delivered', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_ACTION: Cannot reschedule an order that is already %', v_order.order_status;
  END IF;

  UPDATE public.orders
  SET 
    delivery_status = 'rescheduled',
    delivery_rescheduled_date = p_new_date,
    delivery_slot_id = coalesce(p_slot_id, delivery_slot_id),
    notes = coalesce(p_notes, notes),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'orderId', p_order_id,
    'rescheduledDate', p_new_date,
    'deliveryStatus', 'rescheduled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RPC: Cancel order after failed delivery
CREATE OR REPLACE FUNCTION public.cancel_after_failed_delivery(
  p_order_id uuid,
  p_reason text DEFAULT 'Customer requested cancellation after delivery failure'
)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only cancel their own orders';
  END IF;

  IF v_order.order_status = 'delivered' THEN
    RAISE EXCEPTION 'INVALID_ACTION: Cannot cancel an already delivered order';
  END IF;

  UPDATE public.orders
  SET 
    order_status = 'cancelled',
    notes = p_reason,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'orderId', p_order_id,
    'orderStatus', 'cancelled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. Enable Realtime Replication for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;

-- 9. Update RLS policies on orders to strictly enforce Staff visibility (staff sees ONLY own orders)
DROP POLICY IF EXISTS "Shop members read orders" ON public.orders;
CREATE POLICY "Shop members read orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_shop_member(shop_id) AND (
      public.shop_role(shop_id) IN ('owner', 'manager') OR
      user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop members read order status" ON public.order_status_history;
CREATE POLICY "Shop members read order status" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND public.is_shop_member(o.shop_id)
        AND (
          public.shop_role(o.shop_id) IN ('owner', 'manager') OR
          o.user_id = auth.uid()
        )
    )
  );
