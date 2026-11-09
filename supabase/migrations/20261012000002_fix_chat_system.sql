-- ==============================================================================
-- Migration: Fix In-App Chat System (get_or_create_conversation, can_access_conversation, send_chat_message, and RLS)
-- Description:
-- 1. Fixes get_or_create_conversation: initializes order variables safely so
--    chats without an order ID don't throw 'record v_order is not assigned yet'.
-- 2. Fixes can_access_conversation: queries shop_users instead of non-existent shop_members.
-- 3. Fixes send_chat_message: checks shops.is_active instead of non-existent shops.status.
-- 4. Adds INSERT policies for conversations and messages tables.
-- ==============================================================================

-- 1. Helper function: can_access_conversation
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_role text;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Creator always has access
  IF v_conv.created_by = auth.uid() THEN
    RETURN true;
  END IF;

  -- Check if user is shop member via shop_users
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = v_conv.shop_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid() AND active_shop_id = v_conv.shop_id;
  END IF;

  IF v_role IS NOT NULL THEN
    RETURN true;
  END IF;

  -- Wholesaler / admin role access
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('wholesaler', 'admin', 'seller')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 2. RPC: get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_order_num int := NULL;
  v_order_total numeric := NULL;
  v_order_status text := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Find existing conversation
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_conv FROM public.conversations
    WHERE shop_id = p_shop_id AND order_id = p_order_id
    LIMIT 1;
  ELSE
    SELECT * INTO v_conv FROM public.conversations
    WHERE shop_id = p_shop_id AND order_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Create new if not exists
  IF v_conv IS NULL THEN
    INSERT INTO public.conversations (shop_id, order_id, created_by, status, last_message_at)
    VALUES (p_shop_id, p_order_id, auth.uid(), 'open', now())
    RETURNING * INTO v_conv;
  END IF;

  -- Fetch order details safely if linked
  IF v_conv.order_id IS NOT NULL THEN
    SELECT order_number, grand_total, status::text
    INTO v_order_num, v_order_total, v_order_status
    FROM public.orders WHERE id = v_conv.order_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'shop_id', v_conv.shop_id,
    'order_id', v_conv.order_id,
    'order_number', v_order_num,
    'order_total', v_order_total,
    'order_status', v_order_status,
    'status', v_conv.status,
    'last_message_at', v_conv.last_message_at,
    'created_at', v_conv.created_at,
    'created_by', v_conv.created_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid) TO authenticated, anon;

-- 3. RPC: send_chat_message
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id uuid,
  p_text text,
  p_attachment_path text DEFAULT NULL,
  p_client_msg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_shop record;
  v_msg record;
  v_client_id text;
  v_sender_role text := 'customer';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_NOT_FOUND';
  END IF;

  -- Determine sender role
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('wholesaler', 'admin', 'seller')
  ) THEN
    v_sender_role := 'seller';
  END IF;

  -- Shop active check
  SELECT * INTO v_shop FROM public.shops WHERE id = v_conv.shop_id;
  IF v_shop.is_active = false THEN
    RAISE EXCEPTION 'SHOP_INACTIVE: This shop account is currently inactive.';
  END IF;

  v_client_id := COALESCE(p_client_msg_id, gen_random_uuid()::text);

  -- Idempotent insert with client_msg_id conflict handling
  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    sender_role,
    text,
    attachment_path,
    client_msg_id,
    created_at
  ) VALUES (
    p_conversation_id,
    auth.uid(),
    v_sender_role,
    TRIM(p_text),
    p_attachment_path,
    v_client_id,
    now()
  )
  ON CONFLICT (conversation_id, client_msg_id)
  DO UPDATE SET text = EXCLUDED.text
  RETURNING * INTO v_msg;

  -- Update conversation timestamp
  UPDATE public.conversations
  SET last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'sender_id', v_msg.sender_id,
    'sender_role', v_msg.sender_role,
    'text', v_msg.text,
    'attachment_path', v_msg.attachment_path,
    'client_msg_id', v_msg.client_msg_id,
    'read_at', v_msg.read_at,
    'created_at', v_msg.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, text, text) TO authenticated, anon;

-- 4. RLS Policies on conversations and messages
DROP POLICY IF EXISTS "Role-based conversation access" ON public.conversations;
DROP POLICY IF EXISTS "Shop members can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Shop members can update conversations" ON public.conversations;

CREATE POLICY "Role-based conversation access"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    public.can_access_conversation(id)
  );

CREATE POLICY "Shop members can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_shop_member(shop_id) 
    OR created_by = auth.uid()
  );

CREATE POLICY "Shop members can update conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    public.can_access_conversation(id)
  );

DROP POLICY IF EXISTS "Conversation member can view messages" ON public.messages;
DROP POLICY IF EXISTS "Conversation participants can insert messages" ON public.messages;

CREATE POLICY "Conversation member can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.can_access_conversation(conversation_id)
  );

CREATE POLICY "Conversation participants can insert messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_conversation(conversation_id)
  );
