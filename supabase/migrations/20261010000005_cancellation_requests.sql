-- ==============================================================================
-- Migration: Cancel Order and Cancellation Requests (C15)
-- Features:
-- 1. cancellation_requests table with unique partial index on pending status
-- 2. Configurable app_settings for cancellation policy (cutoff status, fees, rate limits)
-- 3. preview_cancellation(p_order_id) RPC
-- 4. cancel_order(p_order_id, p_reason, p_idempotency_key) atomic RPC
-- 5. decide_cancellation_request(p_request_id, p_decision, p_seller_note, p_fee_applied) RPC
-- 6. list_cancellation_requests(p_shop_id, p_order_id) RPC
-- 7. RLS policies and Realtime publication
-- ==============================================================================

-- 1. Add 'refund' to ledger_type_enum if not present
DO $$ BEGIN
  ALTER TYPE public.ledger_type_enum ADD VALUE IF NOT EXISTS 'refund';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create app_settings table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES (
  'cancellation_policy',
  jsonb_build_object(
    'cutoff_status', 'processing',
    'processing_fee', 0,
    'out_for_delivery_fee', 500,
    'max_attempts_per_24h', 3
  )
)
ON CONFLICT (key) DO NOTHING;

-- 3. Create cancellation_requests table
CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')) DEFAULT 'pending',
  fee_estimate numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_estimate >= 0),
  fee_applied numeric(12,2) CHECK (fee_applied >= 0),
  reason text NOT NULL,
  seller_note text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id)
);

-- Indexes for performance & partial unique index: ONLY ONE OPEN (pending) REQUEST PER ORDER
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_requests_one_pending 
  ON public.cancellation_requests (order_id) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_order_id 
  ON public.cancellation_requests (order_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_shop_id 
  ON public.cancellation_requests (shop_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_idempotency 
  ON public.cancellation_requests (idempotency_key) 
  WHERE idempotency_key IS NOT NULL;


-- 4. Enable RLS on cancellation_requests
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read cancellation requests" ON public.cancellation_requests;
CREATE POLICY "Shop members read cancellation requests" ON public.cancellation_requests
  FOR SELECT TO authenticated
  USING (
    public.is_shop_member(shop_id) AND (
      public.shop_role(shop_id) IN ('owner', 'manager') OR
      user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop members insert cancellation requests" ON public.cancellation_requests;
CREATE POLICY "Shop members insert cancellation requests" ON public.cancellation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_shop_member(shop_id) AND (
      public.shop_role(shop_id) IN ('owner', 'manager') OR
      user_id = auth.uid()
    )
  );


-- 5. RPC: preview_cancellation(p_order_id)
CREATE OR REPLACE FUNCTION public.preview_cancellation(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
  v_pending record;
  v_settings jsonb;
  v_cutoff text := 'processing';
  v_fee_processing numeric := 0;
  v_fee_out_delivery numeric := 500;
  v_outcome text;
  v_requires_approval boolean := false;
  v_fee_estimate numeric := 0;
  v_notice text;
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
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only preview their own orders';
  END IF;

  -- Check if already pending request
  SELECT * INTO v_pending 
  FROM public.cancellation_requests 
  WHERE order_id = p_order_id AND status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'REQUEST_CREATED',
      'requiresApproval', true,
      'feeEstimate', v_pending.fee_estimate,
      'notice', 'A cancellation request is already pending seller approval.',
      'reason', 'A cancellation request is already pending approval.',
      'hasPendingRequest', true,
      'pendingRequest', jsonb_build_object(
        'id', v_pending.id,
        'status', v_pending.status,
        'feeEstimate', v_pending.fee_estimate,
        'reason', v_pending.reason,
        'createdAt', v_pending.created_at
      )
    );
  END IF;

  -- Check terminal or non-cancellable statuses
  IF v_order.order_status = 'delivered' THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'CANCELLED',
      'requiresApproval', false,
      'feeEstimate', 0,
      'notice', 'This order has already been delivered and cannot be cancelled.',
      'reason', 'Order is already delivered.',
      'hasPendingRequest', false
    );
  END IF;

  IF v_order.order_status = 'partially_delivered' THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'CANCELLED',
      'requiresApproval', false,
      'feeEstimate', 0,
      'notice', 'Partial delivery has been made. Please submit a return request instead.',
      'reason', 'Partial delivery already made.',
      'hasPendingRequest', false
    );
  END IF;

  IF v_order.order_status IN ('cancelled', 'rejected') THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'CANCELLED',
      'requiresApproval', false,
      'feeEstimate', 0,
      'notice', 'This order is already ' || v_order.order_status::text || '.',
      'reason', 'Order already cancelled or rejected.',
      'hasPendingRequest', false
    );
  END IF;

  -- Load app_settings for cancellation policy
  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'cancellation_policy';
  IF v_settings IS NOT NULL THEN
    v_cutoff := coalesce(v_settings->>'cutoff_status', 'processing');
    v_fee_processing := coalesce((v_settings->>'processing_fee')::numeric, 0);
    v_fee_out_delivery := coalesce((v_settings->>'out_for_delivery_fee')::numeric, 500);
  END IF;

  -- Branch based on status
  IF v_order.order_status IN ('placed', 'confirmed') THEN
    v_outcome := 'CANCELLED';
    v_requires_approval := false;
    v_fee_estimate := 0;
    v_notice := 'Your order will be cancelled immediately with no fee. Any reserved stock and credit will be restored.';
  ELSIF v_order.order_status IN ('processing', 'ready') THEN
    v_outcome := 'REQUEST_CREATED';
    v_requires_approval := true;
    v_fee_estimate := v_fee_processing;
    v_notice := 'The order is being prepared. The seller must approve this cancellation request.';
  ELSIF v_order.order_status = 'out_for_delivery' THEN
    v_outcome := 'REQUEST_CREATED';
    v_requires_approval := true;
    v_fee_estimate := v_fee_out_delivery;
    v_notice := 'The order is out for delivery. The seller must approve this request. A cancellation fee of Rs. ' || v_fee_estimate::text || ' may apply.';
  ELSE
    v_outcome := 'REQUEST_CREATED';
    v_requires_approval := true;
    v_fee_estimate := 0;
    v_notice := 'The seller must approve this cancellation request.';
  END IF;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'orderNumber', v_order.order_number,
    'currentStatus', v_order.order_status,
    'canCancel', true,
    'outcome', v_outcome,
    'requiresApproval', v_requires_approval,
    'feeEstimate', v_fee_estimate,
    'notice', v_notice,
    'hasPendingRequest', false,
    'pendingRequest', null
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC: cancel_order(p_order_id, p_reason, p_idempotency_key)
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
  v_cached_req record;
  v_pending record;
  v_request_count int;
  v_settings jsonb;
  v_fee_processing numeric := 0;
  v_fee_out_delivery numeric := 500;
  v_fee numeric := 0;
  v_request_id uuid;
  v_credit_rec record;
  v_balance numeric;
BEGIN
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_REASON: Cancellation reason is required';
  END IF;

  -- 1. Row Lock Order
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  -- 2. Authorization & Staff Role check
  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only cancel their own orders';
  END IF;

  -- 3. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_cached_req 
    FROM public.cancellation_requests 
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'outcome', 'REQUEST_CREATED',
        'requestId', v_cached_req.id,
        'orderId', p_order_id,
        'orderStatus', v_order.order_status,
        'feeAmount', v_cached_req.fee_estimate,
        'message', 'Cancellation request already submitted (idempotent duplicate).'
      );
    END IF;

    -- If order already cancelled with same reason
    IF v_order.order_status = 'cancelled' THEN
      RETURN jsonb_build_object(
        'outcome', 'CANCELLED',
        'orderId', p_order_id,
        'orderStatus', 'cancelled',
        'feeAmount', 0,
        'message', 'Order already cancelled (idempotent duplicate).'
      );
    END IF;
  END IF;

  -- 4. Status Guards
  IF v_order.order_status = 'delivered' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_DELIVERED: Cannot cancel an already delivered order';
  END IF;

  IF v_order.order_status = 'partially_delivered' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_PARTIAL: Partial delivery has already been made. Please submit a return request instead';
  END IF;

  IF v_order.order_status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'ORDER_ALREADY_CANCELLED: Order is already cancelled or rejected';
  END IF;

  -- 5. Open Pending Request Check
  SELECT * INTO v_pending 
  FROM public.cancellation_requests 
  WHERE order_id = p_order_id AND status = 'pending';

  IF FOUND THEN
    RAISE EXCEPTION 'REQUEST_ALREADY_PENDING: A cancellation request is already pending for this order';
  END IF;

  -- 6. Rate Limit Check (max 3 attempts per 24 hours per order)
  SELECT count(*) INTO v_request_count
  FROM public.cancellation_requests
  WHERE order_id = p_order_id 
    AND created_at > (now() - interval '24 hours');

  IF v_request_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: Maximum cancellation attempts (3 per 24 hours) reached for this order';
  END IF;

  -- Load app_settings
  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'cancellation_policy';
  IF v_settings IS NOT NULL THEN
    v_fee_processing := coalesce((v_settings->>'processing_fee')::numeric, 0);
    v_fee_out_delivery := coalesce((v_settings->>'out_for_delivery_fee')::numeric, 500);
  END IF;

  -- 7. ATOMIC BRANCH: Placed or Confirmed -> Immediate Cancellation
  IF v_order.order_status IN ('placed', 'confirmed') THEN
    -- A. Update order status
    UPDATE public.orders
    SET 
      order_status = 'cancelled',
      notes = coalesce(notes || E'\n', '') || 'Cancelled by customer: ' || p_reason,
      updated_at = now()
    WHERE id = p_order_id;

    -- B. Release stock reservations
    DELETE FROM public.stock_reservations WHERE order_id = p_order_id;

    -- C. Credit Ledger Reversal (never delete rows!)
    IF v_order.payment_method = 'credit' THEN
      SELECT * INTO v_credit_rec 
      FROM public.credit_accounts 
      WHERE shop_id = v_order.shop_id 
      FOR UPDATE;

      IF FOUND THEN
        v_balance := greatest(0, v_credit_rec.used - v_order.grand_total);
        UPDATE public.credit_accounts 
        SET used = v_balance 
        WHERE shop_id = v_order.shop_id;

        INSERT INTO public.ledger_entries (
          shop_id, order_id, type, amount, balance_after, notes, created_by
        ) VALUES (
          v_order.shop_id,
          p_order_id,
          'credit_adjustment',
          v_order.grand_total,
          v_balance,
          'Credit restored on immediate order cancellation',
          auth.uid()
        );
      END IF;
    END IF;

    -- D. Refund / Credit note if payment already made
    IF v_order.payment_status IN ('paid', 'partially_paid') THEN
      INSERT INTO public.ledger_entries (
        shop_id, order_id, type, amount, balance_after, notes, created_by
      ) VALUES (
        v_order.shop_id,
        p_order_id,
        'credit_adjustment',
        v_order.grand_total,
        0,
        'Payment credit note for cancelled order',
        auth.uid()
      );

      UPDATE public.orders 
      SET payment_status = 'refunded' 
      WHERE id = p_order_id;
    END IF;

    -- E. Write status history
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      p_order_id,
      'cancelled',
      auth.uid(),
      'Cancelled immediately by customer: ' || p_reason
    );

    RETURN jsonb_build_object(
      'outcome', 'CANCELLED',
      'orderId', p_order_id,
      'orderStatus', 'cancelled',
      'feeAmount', 0,
      'message', 'Order cancelled immediately. Reserved stock and credit restored.'
    );

  -- 8. BRANCH: Processing, Ready, or Out for Delivery -> Create Cancellation Request
  ELSE
    IF v_order.order_status = 'out_for_delivery' THEN
      v_fee := v_fee_out_delivery;
    ELSE
      v_fee := v_fee_processing;
    END IF;

    INSERT INTO public.cancellation_requests (
      order_id, shop_id, user_id, status, fee_estimate, reason, idempotency_key
    ) VALUES (
      p_order_id,
      v_order.shop_id,
      auth.uid(),
      'pending',
      v_fee,
      p_reason,
      p_idempotency_key
    )
    RETURNING id INTO v_request_id;

    -- Write status history documenting the request
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      p_order_id,
      v_order.order_status::text,
      auth.uid(),
      'Cancellation request submitted (' || p_reason || '). Estimated fee: Rs. ' || v_fee::text
    );

    RETURN jsonb_build_object(
      'outcome', 'REQUEST_CREATED',
      'requestId', v_request_id,
      'orderId', p_order_id,
      'orderStatus', v_order.order_status,
      'feeAmount', v_fee,
      'message', 'Cancellation request submitted for seller review.'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RPC: decide_cancellation_request(p_request_id, p_decision, p_seller_note, p_fee_applied)
CREATE OR REPLACE FUNCTION public.decide_cancellation_request(
  p_request_id uuid,
  p_decision text,
  p_seller_note text DEFAULT NULL,
  p_fee_applied numeric DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_req record;
  v_order record;
  v_fee numeric;
  v_credit_rec record;
  v_restore_amount numeric;
  v_balance numeric;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION: Decision must be approved or rejected';
  END IF;

  SELECT * INTO v_req FROM public.cancellation_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Cancellation request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING: Cancellation request is already %', v_req.status;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_req.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order not found';
  END IF;

  -- Ensure caller is owner or manager of the shop
  IF NOT (public.is_shop_member(v_req.shop_id) AND public.shop_role(v_req.shop_id) IN ('owner', 'manager')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only owners or managers can decide cancellation requests';
  END IF;

  v_fee := coalesce(p_fee_applied, v_req.fee_estimate);

  -- DECISION: APPROVED
  IF p_decision = 'approved' THEN
    UPDATE public.cancellation_requests
    SET 
      status = 'approved',
      fee_applied = v_fee,
      seller_note = p_seller_note,
      decided_at = now(),
      decided_by = auth.uid()
    WHERE id = p_request_id;

    -- Update Order Status to cancelled
    UPDATE public.orders
    SET 
      order_status = 'cancelled',
      notes = coalesce(notes || E'\n', '') || 'Cancellation approved by seller' || coalesce(': ' || p_seller_note, ''),
      updated_at = now()
    WHERE id = v_req.order_id;

    -- Release stock reservations
    DELETE FROM public.stock_reservations WHERE order_id = v_req.order_id;

    -- Restore credit usage (net of cancellation fee)
    IF v_order.payment_method = 'credit' THEN
      SELECT * INTO v_credit_rec 
      FROM public.credit_accounts 
      WHERE shop_id = v_req.shop_id 
      FOR UPDATE;

      IF FOUND THEN
        v_restore_amount := greatest(0, v_order.grand_total - coalesce(v_fee, 0));
        v_balance := greatest(0, v_credit_rec.used - v_restore_amount);

        UPDATE public.credit_accounts 
        SET used = v_balance 
        WHERE shop_id = v_req.shop_id;

        INSERT INTO public.ledger_entries (
          shop_id, order_id, type, amount, balance_after, notes, created_by
        ) VALUES (
          v_req.shop_id,
          v_req.order_id,
          'credit_adjustment',
          v_restore_amount,
          v_balance,
          'Credit restored after approved cancellation (Fee: Rs. ' || v_fee::text || ')',
          auth.uid()
        );
      END IF;
    END IF;

    -- Refund paid orders
    IF v_order.payment_status IN ('paid', 'partially_paid') THEN
      INSERT INTO public.ledger_entries (
        shop_id, order_id, type, amount, balance_after, notes, created_by
      ) VALUES (
        v_req.shop_id,
        v_req.order_id,
        'credit_adjustment',
        greatest(0, v_order.grand_total - coalesce(v_fee, 0)),
        0,
        'Refund credit note for approved cancellation (Fee: Rs. ' || v_fee::text || ')',
        auth.uid()
      );

      UPDATE public.orders SET payment_status = 'refunded' WHERE id = v_req.order_id;
    END IF;

    -- Write history
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      v_req.order_id,
      'cancelled',
      auth.uid(),
      'Cancellation request approved by seller. Fee applied: Rs. ' || v_fee::text || coalesce('. Note: ' || p_seller_note, '')
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'approved',
      'requestId', p_request_id,
      'orderId', v_req.order_id,
      'orderStatus', 'cancelled',
      'feeApplied', v_fee
    );

  -- DECISION: REJECTED
  ELSE
    UPDATE public.cancellation_requests
    SET 
      status = 'rejected',
      fee_applied = 0,
      seller_note = p_seller_note,
      decided_at = now(),
      decided_by = auth.uid()
    WHERE id = p_request_id;

    -- Write history
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      v_req.order_id,
      v_order.order_status::text,
      auth.uid(),
      'Cancellation request rejected by seller' || coalesce(': ' || p_seller_note, '')
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'rejected',
      'requestId', p_request_id,
      'orderId', v_req.order_id,
      'orderStatus', v_order.order_status,
      'sellerNote', p_seller_note
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. RPC: list_cancellation_requests(p_shop_id, p_order_id)
CREATE OR REPLACE FUNCTION public.list_cancellation_requests(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  shop_id uuid,
  user_id uuid,
  status text,
  fee_estimate numeric,
  fee_applied numeric,
  reason text,
  seller_note text,
  idempotency_key text,
  created_at timestamptz,
  decided_at timestamptz,
  decided_by uuid
) AS $$
BEGIN
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    cr.id,
    cr.order_id,
    cr.shop_id,
    cr.user_id,
    cr.status,
    cr.fee_estimate,
    cr.fee_applied,
    cr.reason,
    cr.seller_note,
    cr.idempotency_key,
    cr.created_at,
    cr.decided_at,
    cr.decided_by
  FROM public.cancellation_requests cr
  WHERE cr.shop_id = p_shop_id
    AND (p_order_id IS NULL OR cr.order_id = p_order_id)
  ORDER BY cr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. Realtime Publication for cancellation_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.cancellation_requests;
