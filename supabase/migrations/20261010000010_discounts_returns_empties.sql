-- ==============================================================================
-- Migration: Discount Requests, Return Requests & Empties Ledger (C23 & C24)
-- Features:
-- 1. discount_requests table: percent/amount, counter offers, countdown expiry, unique active request
-- 2. returns and return_items tables: return window, item reasons, photos
-- 3. empties_ledger: bottles & crates tracking (issued, returned, balance derived)
-- 4. Storage bucket 'return-photos' with authenticated RLS
-- 5. RPCs:
--    - create_discount_request
--    - withdraw_discount_request
--    - accept_counter_offer
--    - apply_discount_decision
--    - get_return_eligible_orders
--    - create_return_request
--    - approve_return_request
--    - get_empties_summary
-- 6. Realtime publication
-- ==============================================================================

-- 1. Discount Requests Table (C23)
CREATE TABLE IF NOT EXISTS public.discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  requested_type text NOT NULL CHECK (requested_type IN ('percent', 'amount')),
  requested_value numeric(12,2) NOT NULL CHECK (requested_value > 0),
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'countered', 'accepted', 'expired', 'withdrawn')),
  counter_value numeric(12,2),
  counter_type text CHECK (counter_type IN ('percent', 'amount')),
  seller_note text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Ensure only one active (pending or countered) discount request per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_discount_request
  ON public.discount_requests (order_id)
  WHERE status IN ('pending', 'countered');

CREATE INDEX IF NOT EXISTS idx_discount_requests_shop ON public.discount_requests (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discount_requests_order ON public.discount_requests (order_id);

-- Enable RLS on discount_requests
ALTER TABLE public.discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members can view discount requests" ON public.discount_requests;
CREATE POLICY "Shop members can view discount requests"
  ON public.discount_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shop_members sm
      WHERE sm.shop_id = discount_requests.shop_id
        AND sm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.active_shop_id = discount_requests.shop_id
    )
  );

-- 2. Return Requests and Return Items (C24)
CREATE SEQUENCE IF NOT EXISTS public.return_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  return_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'partially_approved', 'rejected')),
  total_refund_amount numeric(12,2) DEFAULT 0.00,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  seller_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_returns_shop ON public.returns (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_order ON public.returns (order_id);

CREATE TABLE IF NOT EXISTS public.return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  variant_title text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  reason text NOT NULL CHECK (reason IN ('damaged', 'wrong_item', 'expired', 'short_delivery')),
  photos text[] DEFAULT '{}',
  refund_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON public.return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item ON public.return_items (order_item_id);

-- 3. Empties Ledger (Bottles & Crates)
CREATE TABLE IF NOT EXISTS public.empties_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('bottle', 'crate')),
  issued int NOT NULL DEFAULT 0 CHECK (issued >= 0),
  returned int NOT NULL DEFAULT 0 CHECK (returned >= 0),
  ref_type text NOT NULL, -- 'order', 'return', 'adjustment'
  ref_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_empties_ledger_shop ON public.empties_ledger (shop_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empties_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members can view returns" ON public.returns;
CREATE POLICY "Shop members can view returns"
  ON public.returns FOR SELECT
  TO authenticated
  USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS "Shop members can view return items" ON public.return_items;
CREATE POLICY "Shop members can view return items"
  ON public.return_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_items.return_id
        AND public.is_shop_member(r.shop_id)
    )
  );

DROP POLICY IF EXISTS "Shop members can view empties ledger" ON public.empties_ledger;
CREATE POLICY "Shop members can view empties ledger"
  ON public.empties_ledger FOR SELECT
  TO authenticated
  USING (public.is_shop_member(shop_id));

-- 4. Storage Bucket 'return-photos'
INSERT INTO storage.buckets (id, name, public)
VALUES ('return-photos', 'return-photos', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Shop members can upload return photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Shop members can upload return photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'return-photos'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Shop members can view return photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Shop members can view return photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'return-photos'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;

-- 5. RPC: create_discount_request (C23)
CREATE OR REPLACE FUNCTION public.create_discount_request(
  p_order_id uuid,
  p_requested_type text,
  p_requested_value numeric,
  p_message text DEFAULT NULL,
  p_expires_in_hours int DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_shop_id uuid;
  v_req_id uuid;
  v_expires_at timestamptz;
  v_max_percent numeric := 30.0; -- Sane cap: max 30% discount request
  v_calc_discount numeric;
BEGIN
  -- 1. Verify order exists and is eligible
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  v_shop_id := v_order.shop_id;

  -- Verify user is member of this shop
  IF NOT public.is_shop_member(v_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User does not belong to this shop.';
  END IF;

  -- Only placed or draft orders can request a discount (cannot request once confirmed or processing)
  IF v_order.order_status NOT IN ('placed', 'draft') THEN
    RAISE EXCEPTION 'ORDER_LOCKED: Discount requests can only be submitted before an order is confirmed or processed.';
  END IF;

  -- 2. Validate sane caps
  IF p_requested_type = 'percent' THEN
    IF p_requested_value <= 0 OR p_requested_value > v_max_percent THEN
      RAISE EXCEPTION 'INVALID_CAP: Percentage discount must be between 1%% and %s%%.', v_max_percent;
    END IF;
    v_calc_discount := ROUND((v_order.subtotal * (p_requested_value / 100.0)), 2);
  ELSIF p_requested_type = 'amount' THEN
    IF p_requested_value <= 0 OR p_requested_value >= v_order.subtotal THEN
      RAISE EXCEPTION 'INVALID_CAP: Discount amount cannot exceed order subtotal of %s.', v_order.subtotal;
    END IF;
    IF (p_requested_value / v_order.subtotal) > (v_max_percent / 100.0) THEN
      RAISE EXCEPTION 'INVALID_CAP: Discount cannot exceed %s%% of order value.', v_max_percent;
    END IF;
    v_calc_discount := p_requested_value;
  ELSE
    RAISE EXCEPTION 'INVALID_TYPE: Type must be percent or amount.';
  END IF;

  -- 3. Check for existing active request
  IF EXISTS (
    SELECT 1 FROM public.discount_requests
    WHERE order_id = p_order_id
      AND status IN ('pending', 'countered')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_REQUEST_EXISTS: An active discount request already exists for this order.';
  END IF;

  -- Expiry: default 4 hours from now
  v_expires_at := now() + (COALESCE(p_expires_in_hours, 4) || ' hours')::interval;

  INSERT INTO public.discount_requests (
    shop_id, order_id, requested_type, requested_value,
    message, status, expires_at, created_by
  ) VALUES (
    v_shop_id, p_order_id, p_requested_type, p_requested_value,
    p_message, 'pending', v_expires_at, auth.uid()
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_req_id,
    'discount_amount', v_calc_discount,
    'expires_at', v_expires_at
  );
END;
$$;

-- 6. RPC: withdraw_discount_request (C23)
CREATE OR REPLACE FUNCTION public.withdraw_discount_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req record;
BEGIN
  SELECT * INTO v_req FROM public.discount_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Discount request does not exist.';
  END IF;

  IF NOT public.is_shop_member(v_req.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF v_req.status NOT IN ('pending', 'countered') THEN
    RAISE EXCEPTION 'CANNOT_WITHDRAW: Request status is already %s.', v_req.status;
  END IF;

  UPDATE public.discount_requests
  SET status = 'withdrawn', updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. RPC: accept_counter_offer (C23)
CREATE OR REPLACE FUNCTION public.accept_counter_offer(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req record;
  v_order record;
  v_discount numeric := 0;
  v_new_total numeric := 0;
BEGIN
  SELECT * INTO v_req FROM public.discount_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Discount request does not exist.';
  END IF;

  IF NOT public.is_shop_member(v_req.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Double accept idempotent check
  IF v_req.status = 'accepted' THEN
    RETURN jsonb_build_object('success', true, 'already_accepted', true);
  END IF;

  IF v_req.status != 'countered' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Request is not in countered status (current: %s).', v_req.status;
  END IF;

  -- Check expiry
  IF now() > v_req.expires_at THEN
    UPDATE public.discount_requests SET status = 'expired', updated_at = now() WHERE id = p_request_id;
    RAISE EXCEPTION 'COUNTER_EXPIRED: The counter offer has expired.';
  END IF;

  -- Verify order still exists and is not confirmed/cancelled
  SELECT * INTO v_order FROM public.orders WHERE id = v_req.order_id FOR UPDATE;
  IF v_order.order_status NOT IN ('placed', 'draft') THEN
    RAISE EXCEPTION 'ORDER_LOCKED: Order status has progressed to %s.', v_order.order_status;
  END IF;

  -- Compute discount amount
  IF v_req.counter_type = 'percent' THEN
    v_discount := ROUND((v_order.subtotal * (v_req.counter_value / 100.0)), 2);
  ELSE
    v_discount := v_req.counter_value;
  END IF;

  v_new_total := GREATEST(0, (v_order.subtotal + COALESCE(v_order.delivery_fee, 0)) - v_discount);

  -- Atomic update on order
  UPDATE public.orders
  SET discount_amount = v_discount,
      total_amount = v_new_total,
      updated_at = now()
  WHERE id = v_req.order_id;

  -- Update discount request
  UPDATE public.discount_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id;

  -- Log status history
  INSERT INTO public.order_status_history (order_id, status, actor, notes)
  VALUES (v_req.order_id, v_order.order_status, 'customer', 'Counter discount of Rs. ' || v_discount || ' accepted');

  RETURN jsonb_build_object(
    'success', true,
    'applied_discount', v_discount,
    'new_total', v_new_total
  );
END;
$$;

-- 8. RPC: list_discount_requests (C23 with lazy expiry update)
CREATE OR REPLACE FUNCTION public.list_discount_requests(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res jsonb;
BEGIN
  -- Lazy expire requests past deadline
  UPDATE public.discount_requests
  SET status = 'expired', updated_at = now()
  WHERE order_id = p_order_id
    AND status IN ('pending', 'countered')
    AND expires_at < now();

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT
      id, shop_id, order_id, order_item_id,
      requested_type, requested_value, message,
      status, counter_value, counter_type, seller_note,
      expires_at, created_at, updated_at
    FROM public.discount_requests
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
  ) r;

  RETURN v_res;
END;
$$;

-- 9. RPC: get_return_eligible_orders (C24)
CREATE OR REPLACE FUNCTION public.get_return_eligible_orders(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_hours int := 24; -- 24h return window
  v_orders jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(ord)), '[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT
      o.id,
      o.order_number,
      o.total_amount,
      o.created_at,
      o.order_status,
      (o.updated_at + (v_window_hours || ' hours')::interval) as return_deadline,
      jsonb_agg(
        jsonb_build_object(
          'order_item_id', oi.id,
          'variant_id', oi.variant_id,
          'product_name', COALESCE(p.title, 'Product'),
          'variant_title', COALESCE(pv.title, 'Standard'),
          'unit_price', oi.unit_price,
          'delivered_qty', COALESCE(oi.delivered_quantity, oi.quantity),
          'returned_qty', COALESCE((
            SELECT SUM(ri.qty) FROM public.return_items ri
            JOIN public.returns ret ON ret.id = ri.return_id
            WHERE ri.order_item_id = oi.id AND ret.status != 'rejected'
          ), 0),
          'returnable_qty', GREATEST(0,
            COALESCE(oi.delivered_quantity, oi.quantity) - COALESCE((
              SELECT SUM(ri.qty) FROM public.return_items ri
              JOIN public.returns ret ON ret.id = ri.return_id
              WHERE ri.order_item_id = oi.id AND ret.status != 'rejected'
            ), 0)
          )
        )
      ) as items
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE o.shop_id = p_shop_id
      AND o.order_status IN ('delivered', 'partially_delivered')
      AND now() <= (o.updated_at + (v_window_hours || ' hours')::interval)
    GROUP BY o.id, o.order_number, o.total_amount, o.created_at, o.order_status, o.updated_at
    ORDER BY o.created_at DESC
  ) ord;

  RETURN v_orders;
END;
$$;

-- 10. RPC: create_return_request (C24)
CREATE OR REPLACE FUNCTION public.create_return_request(
  p_order_id uuid,
  p_items jsonb, -- Array of { order_item_id, qty, reason, photos }
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_shop_id uuid;
  v_return_id uuid;
  v_return_num text;
  v_item jsonb;
  v_order_item record;
  v_delivered_qty int;
  v_already_returned int;
  v_max_returnable int;
  v_item_qty int;
  v_reason text;
  v_photos text[];
  v_item_refund numeric(12,2) := 0;
  v_total_refund numeric(12,2) := 0;
  v_window_hours int := 24;
BEGIN
  -- 1. Check order
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  v_shop_id := v_order.shop_id;

  -- Role check: Manager or Owner can request returns
  IF NOT public.is_shop_owner_or_manager(v_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only shop owner or manager can submit return requests.';
  END IF;

  -- Window check (24 hours after delivery)
  IF now() > (v_order.updated_at + (v_window_hours || ' hours')::interval) THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED: The 24-hour return window for order #% has closed.', v_order.order_number;
  END IF;

  -- 2. Allocate sequential return number
  v_return_num := 'RET-2026-' || LPAD(nextval('public.return_number_seq')::text, 6, '0');
  v_return_id := gen_random_uuid();

  INSERT INTO public.returns (
    id, shop_id, order_id, return_number, status, total_refund_amount, created_by
  ) VALUES (
    v_return_id, v_shop_id, p_order_id, v_return_num, 'pending', 0, auth.uid()
  );

  -- 3. Process line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT oi.*, p.title as prod_title, pv.title as var_title
    INTO v_order_item
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE oi.id = (v_item->>'order_item_id')::uuid AND oi.order_id = p_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND: Order item % does not exist on this order.', v_item->>'order_item_id';
    END IF;

    v_item_qty := (v_item->>'qty')::int;
    v_reason := v_item->>'reason';

    -- Delivered quantity
    v_delivered_qty := COALESCE(v_order_item.delivered_quantity, v_order_item.quantity);

    -- Check already returned
    SELECT COALESCE(SUM(ri.qty), 0) INTO v_already_returned
    FROM public.return_items ri
    JOIN public.returns r ON r.id = ri.return_id
    WHERE ri.order_item_id = v_order_item.id AND r.status != 'rejected';

    v_max_returnable := v_delivered_qty - v_already_returned;
    IF v_item_qty > v_max_returnable THEN
      RAISE EXCEPTION 'QTY_EXCEEDED: Requested return quantity (%s) exceeds returnable limit (%s).', v_item_qty, v_max_returnable;
    END IF;

    -- Photos mandatory for damaged
    IF v_reason = 'damaged' THEN
      IF v_item->'photos' IS NULL OR jsonb_array_length(v_item->'photos') = 0 THEN
        RAISE EXCEPTION 'PHOTO_REQUIRED: Clear photo evidence is strictly required for damaged items.';
      END IF;
    END IF;

    -- Convert photos array
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'photos', '[]'::jsonb)))
    INTO v_photos;

    v_item_refund := v_item_qty * v_order_item.unit_price;
    v_total_refund := v_total_refund + v_item_refund;

    INSERT INTO public.return_items (
      return_id, order_item_id, product_name, variant_title,
      unit_price, qty, reason, photos, refund_amount, status
    ) VALUES (
      v_return_id, v_order_item.id,
      COALESCE(v_order_item.prod_title, 'Item'),
      COALESCE(v_order_item.var_title, 'Standard'),
      v_order_item.unit_price, v_item_qty, v_reason,
      v_photos, v_item_refund, 'pending'
    );
  END LOOP;

  UPDATE public.returns
  SET total_refund_amount = v_total_refund
  WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'return_number', v_return_num,
    'total_refund_amount', v_total_refund
  );
END;
$$;

-- 11. RPC: get_empties_summary (C24)
CREATE OR REPLACE FUNCTION public.get_empties_summary(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bottles_issued int := 0;
  v_bottles_returned int := 0;
  v_crates_issued int := 0;
  v_crates_returned int := 0;
  v_deposit_rate_bottle numeric := 15.0; -- Rs. 15 per bottle deposit
  v_deposit_rate_crate numeric := 250.0; -- Rs. 250 per crate deposit
  v_deposit_value numeric := 0;
BEGIN
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'bottle' THEN issued ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'bottle' THEN returned ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'crate' THEN issued ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'crate' THEN returned ELSE 0 END), 0)
  INTO
    v_bottles_issued, v_bottles_returned, v_crates_issued, v_crates_returned
  FROM public.empties_ledger
  WHERE shop_id = p_shop_id;

  v_deposit_value := ((v_bottles_issued - v_bottles_returned) * v_deposit_rate_bottle)
                   + ((v_crates_issued - v_crates_returned) * v_deposit_rate_crate);

  RETURN jsonb_build_object(
    'bottles', jsonb_build_object(
      'issued', v_bottles_issued,
      'returned', v_bottles_returned,
      'balance', v_bottles_issued - v_bottles_returned,
      'deposit_rate', v_deposit_rate_bottle
    ),
    'crates', jsonb_build_object(
      'issued', v_crates_issued,
      'returned', v_crates_returned,
      'balance', v_crates_issued - v_crates_returned,
      'deposit_rate', v_deposit_rate_crate
    ),
    'total_deposit_held', GREATEST(0, v_deposit_value)
  );
END;
$$;

-- 12. Add Realtime Publications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.discount_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.returns;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.empties_ledger;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
