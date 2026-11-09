-- ==============================================================================
-- Migration: Seller Contact, Support System, and Account Settings (C17 / C18)
-- Features:
-- 1. app_settings: seed seller_contact and app_version settings
-- 2. support_tickets table (shop_id, order_id nullable, subject, body, status, attachments, idempotency_key)
-- 3. ticket_messages table (ticket_id, sender_id, sender_role, message, attachments)
-- 4. support_faqs table with default B2B cold drinks FAQs
-- 5. RPCs: get_seller_contact, list_support_faqs, create_support_ticket,
--          reply_support_ticket, list_support_tickets, get_support_ticket_detail,
--          check_can_delete_account
-- 6. RLS policies and Realtime publication
-- ==============================================================================

-- 1. Ensure app_settings has seller_contact and version info
INSERT INTO public.app_settings (key, value)
VALUES (
  'seller_contact',
  jsonb_build_object(
    'phone', '+923001234567',
    'whatsapp', '+923001234567',
    'business_hours', jsonb_build_object(
      'start', '09:00',
      'end', '19:00',
      'days', jsonb_build_array(1, 2, 3, 4, 5, 6), -- Monday to Saturday (0=Sunday)
      'holidays', jsonb_build_array('2026-03-23', '2026-05-01', '2026-08-14', '2026-11-09', '2026-12-25')
    ),
    'expected_response_time', 'Within 2 business hours'
  )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

-- 2. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  attachments jsonb DEFAULT '[]'::jsonb,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_shop ON public.support_tickets (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON public.support_tickets (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_idempotency
  ON public.support_tickets (shop_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Create ticket_messages table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'seller')),
  message text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages (ticket_id, created_at ASC);

-- 4. Create support_faqs table
CREATE TABLE IF NOT EXISTS public.support_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('ordering', 'delivery', 'payments', 'account', 'returns')),
  question text NOT NULL,
  answer text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Seed FAQs if table is empty
INSERT INTO public.support_faqs (category, question, answer, sort_order)
VALUES
  ('ordering', 'What is the minimum order quantity for wholesale deliveries?', 'The minimum order quantity depends on your delivery zone, typically 10 crates or cartons. Individual variant minimums and case multipliers apply at checkout.', 1),
  ('ordering', 'How do I reorder items from a past purchase?', 'Go to the Orders tab, open any past order or tap the visible "Reorder" button on the order card. Prices and stock will automatically update to current live values.', 2),
  ('delivery', 'What are your delivery hours and cutoffs?', 'Orders placed before 2:00 PM PKT are scheduled for next-morning delivery. You can set your preferred delivery time period (Morning or Afternoon) in Delivery Preferences.', 3),
  ('delivery', 'Can I change my delivery address after placing an order?', 'Addresses cannot be changed once an order is marked Out for Delivery. If your order is in Placed or Confirmed status, please contact seller support immediately.', 4),
  ('payments', 'What payment methods are supported for wholesale shops?', 'We accept Cash on Delivery (COD), Direct Bank Transfer / IBFT with payment slip upload, and 14-day Approved Credit for verified wholesale accounts.', 5),
  ('payments', 'How does credit limit approval work?', 'Shop owners can apply for credit terms. Once approved, your current credit limit and available balance are displayed in the account and checkout screens.', 6),
  ('returns', 'What is the return policy for damaged or expired bottles?', 'Please inspect crates upon arrival. Any broken seals or short-expiry bottles can be reported via a Return Request or Support Ticket within 24 hours of delivery with photo proof.', 7),
  ('account', 'Can my shop staff place orders without seeing credit or prices?', 'Yes! Staff members have restricted access: they can place orders but cannot view credit balances, payment proofs, or shop financial statements.', 8)
ON CONFLICT DO NOTHING;

-- 5. Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_faqs ENABLE ROW LEVEL SECURITY;

-- FAQs are public readable
CREATE POLICY "faqs_public_read" ON public.support_faqs
  FOR SELECT TO authenticated, anon USING (true);

-- Tickets RLS: Customers can view tickets for shops they are member of
CREATE POLICY "tickets_shop_members_select" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "tickets_shop_members_insert" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Messages RLS: Can view and insert messages if user belongs to the ticket's shop
CREATE POLICY "messages_shop_members_select" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT t.id FROM public.support_tickets t
      JOIN public.shop_users su ON su.shop_id = t.shop_id
      WHERE su.user_id = auth.uid() AND su.status = 'active'
    )
  );

CREATE POLICY "messages_shop_members_insert" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    ticket_id IN (
      SELECT t.id FROM public.support_tickets t
      JOIN public.shop_users su ON su.shop_id = t.shop_id
      WHERE su.user_id = auth.uid() AND su.status = 'active'
    )
  );

-- ==============================================================================
-- 6. RPC Functions
-- ==============================================================================

-- RPC 1: get_seller_contact
CREATE OR REPLACE FUNCTION public.get_seller_contact()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact jsonb;
BEGIN
  SELECT value INTO v_contact
  FROM public.app_settings
  WHERE key = 'seller_contact';

  IF v_contact IS NULL THEN
    v_contact := jsonb_build_object(
      'phone', '+923001234567',
      'whatsapp', '+923001234567',
      'business_hours', jsonb_build_object(
        'start', '09:00',
        'end', '19:00',
        'days', jsonb_build_array(1, 2, 3, 4, 5, 6),
        'holidays', jsonb_build_array('2026-03-23', '2026-05-01', '2026-08-14', '2026-11-09', '2026-12-25')
      ),
      'expected_response_time', 'Within 2 business hours'
    );
  END IF;

  RETURN v_contact;
END;
$$;

-- RPC 2: list_support_faqs
CREATE OR REPLACE FUNCTION public.list_support_faqs(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  question text,
  answer text,
  sort_order int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.category, f.question, f.answer, f.sort_order
  FROM public.support_faqs f
  WHERE (p_category IS NULL OR f.category = p_category)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR f.question ILIKE '%' || p_search || '%'
      OR f.answer ILIKE '%' || p_search || '%'
    )
  ORDER BY f.sort_order ASC, f.created_at ASC;
END;
$$;

-- RPC 3: create_support_ticket
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL,
  p_subject text DEFAULT '',
  p_body text DEFAULT '',
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_order_user_id uuid;
  v_existing_ticket record;
  v_new_ticket_id uuid;
  v_clean_subject text;
  v_clean_body text;
BEGIN
  -- Verify user belongs to shop
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User is not an active member of this shop';
  END IF;

  -- Verify order permission if order_id provided
  IF p_order_id IS NOT NULL THEN
    SELECT user_id INTO v_order_user_id
    FROM public.orders
    WHERE id = p_order_id AND shop_id = p_shop_id;

    IF v_order_user_id IS NULL THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist for this shop';
    END IF;

    -- If staff, verify they placed the order
    IF v_role = 'staff' AND v_order_user_id <> v_user_id THEN
      RAISE EXCEPTION 'ORDER_FORBIDDEN: Staff can only attach orders they placed';
    END IF;
  END IF;

  -- Check idempotency
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing_ticket
    FROM public.support_tickets
    WHERE shop_id = p_shop_id AND idempotency_key = p_idempotency_key;

    IF v_existing_ticket.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ticket_id', v_existing_ticket.id,
        'subject', v_existing_ticket.subject,
        'status', v_existing_ticket.status,
        'is_duplicate', true
      );
    END IF;
  END IF;

  v_clean_subject := trim(p_subject);
  v_clean_body := trim(p_body);

  IF length(v_clean_subject) < 3 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Subject must be at least 3 characters';
  END IF;

  IF length(v_clean_body) < 5 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Message body must be at least 5 characters';
  END IF;

  -- Create ticket
  INSERT INTO public.support_tickets (
    shop_id,
    order_id,
    created_by,
    subject,
    body,
    status,
    attachments,
    idempotency_key
  )
  VALUES (
    p_shop_id,
    p_order_id,
    v_user_id,
    v_clean_subject,
    v_clean_body,
    'open',
    COALESCE(p_attachments, '[]'::jsonb),
    p_idempotency_key
  )
  RETURNING id INTO v_new_ticket_id;

  -- Add initial message
  INSERT INTO public.ticket_messages (
    ticket_id,
    sender_id,
    sender_role,
    message,
    attachments
  )
  VALUES (
    v_new_ticket_id,
    v_user_id,
    'customer',
    v_clean_body,
    COALESCE(p_attachments, '[]'::jsonb)
  );

  RETURN jsonb_build_object(
    'ticket_id', v_new_ticket_id,
    'subject', v_clean_subject,
    'status', 'open',
    'is_duplicate', false
  );
END;
$$;

-- RPC 4: reply_support_ticket
CREATE OR REPLACE FUNCTION public.reply_support_ticket(
  p_ticket_id uuid,
  p_message text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ticket record;
  v_role text;
  v_msg_id uuid;
  v_clean_msg text;
BEGIN
  SELECT * INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND: Support ticket does not exist';
  END IF;

  -- Verify membership
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = v_ticket.shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User is not an active member of this shop';
  END IF;

  v_clean_msg := trim(p_message);
  IF length(v_clean_msg) < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Message cannot be empty';
  END IF;

  -- Insert message
  INSERT INTO public.ticket_messages (
    ticket_id,
    sender_id,
    sender_role,
    message,
    attachments
  )
  VALUES (
    p_ticket_id,
    v_user_id,
    'customer',
    v_clean_msg,
    COALESCE(p_attachments, '[]'::jsonb)
  )
  RETURNING id INTO v_msg_id;

  -- Reopen if resolved, update timestamp
  UPDATE public.support_tickets
  SET updated_at = now(),
      status = CASE WHEN status = 'resolved' THEN 'in_progress' ELSE status END
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object(
    'message_id', v_msg_id,
    'ticket_id', p_ticket_id,
    'status', CASE WHEN v_ticket.status = 'resolved' THEN 'in_progress' ELSE v_ticket.status END
  );
END;
$$;

-- RPC 5: list_support_tickets
CREATE OR REPLACE FUNCTION public.list_support_tickets(
  p_shop_id uuid
)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  order_id uuid,
  order_number text,
  subject text,
  body text,
  status text,
  attachments jsonb,
  message_count bigint,
  last_message text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.shop_id,
    t.order_id,
    o.order_number,
    t.subject,
    t.body,
    t.status,
    t.attachments,
    COUNT(m.id) AS message_count,
    (
      SELECT msg.message
      FROM public.ticket_messages msg
      WHERE msg.ticket_id = t.id
      ORDER BY msg.created_at DESC
      LIMIT 1
    ) AS last_message,
    t.created_at,
    t.updated_at
  FROM public.support_tickets t
  LEFT JOIN public.orders o ON o.id = t.order_id
  LEFT JOIN public.ticket_messages m ON m.ticket_id = t.id
  WHERE t.shop_id = p_shop_id
  GROUP BY t.id, o.order_number
  ORDER BY t.updated_at DESC;
END;
$$;

-- RPC 6: get_support_ticket_detail
CREATE OR REPLACE FUNCTION public.get_support_ticket_detail(
  p_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_order_num text;
  v_messages jsonb;
BEGIN
  SELECT t.*, o.order_number INTO v_ticket
  FROM public.support_tickets t
  LEFT JOIN public.orders o ON o.id = t.order_id
  WHERE t.id = p_ticket_id;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND: Ticket not found';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'ticket_id', m.ticket_id,
        'sender_id', m.sender_id,
        'sender_role', m.sender_role,
        'message', m.message,
        'attachments', m.attachments,
        'created_at', m.created_at
      ) ORDER BY m.created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_messages
  FROM public.ticket_messages m
  WHERE m.ticket_id = p_ticket_id;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'shop_id', v_ticket.shop_id,
    'order_id', v_ticket.order_id,
    'order_number', v_ticket.order_number,
    'subject', v_ticket.subject,
    'body', v_ticket.body,
    'status', v_ticket.status,
    'attachments', v_ticket.attachments,
    'created_at', v_ticket.created_at,
    'updated_at', v_ticket.updated_at,
    'messages', v_messages
  );
END;
$$;

-- RPC 7: check_can_delete_account
-- Explains deletion block if active orders or outstanding credit balance exist
CREATE OR REPLACE FUNCTION public.check_can_delete_account(
  p_shop_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_order_count int;
  v_active_order_nums text;
  v_credit_balance numeric := 0;
BEGIN
  -- Count active orders
  SELECT COUNT(*), string_agg(order_number, ', ')
  INTO v_active_order_count, v_active_order_nums
  FROM public.orders
  WHERE shop_id = p_shop_id
    AND order_status IN ('placed', 'confirmed', 'processing', 'ready', 'out_for_delivery');

  IF v_active_order_count > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'ACTIVE_ORDERS',
      'message', 'Account cannot be deleted while orders (' || v_active_order_nums || ') are in progress. Please wait for delivery or contact seller support.'
    );
  END IF;

  -- Check credit balance if shop has credit
  SELECT COALESCE(current_balance, 0)
  INTO v_credit_balance
  FROM public.credit_limits
  WHERE shop_id = p_shop_id;

  IF v_credit_balance > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'OUTSTANDING_BALANCE',
      'message', 'Account cannot be deleted with an outstanding balance of Rs. ' || v_credit_balance::text || '. Please clear your dues or contact seller support.'
    );
  END IF;

  RETURN jsonb_build_object(
    'can_delete', true,
    'reason', NULL,
    'message', 'Account eligible for deletion.'
  );
END;
$$;

-- 7. Add tables to supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;
