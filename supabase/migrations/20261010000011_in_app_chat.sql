-- ==============================================================================
-- Migration: In-App Chat with Seller (C25)
-- Features:
-- 1. conversations table (shop_id, order_id nullable, status, created_by)
-- 2. messages table (text, attachment_path, read_at, client_msg_id for dedupe)
-- 3. Storage bucket 'chat-attachments' with RLS
-- 4. Role isolation: Owner & Manager see all shop chats; Staff see ONLY own chats
-- 5. RPCs:
--    - get_or_create_conversation
--    - send_chat_message (checks account suspension, deduplicates client_msg_id)
--    - list_chat_messages (upward cursor pagination)
--    - mark_chat_messages_read
-- 6. Realtime publication
-- ==============================================================================

-- 1. Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_shop ON public.conversations (shop_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_order ON public.conversations (order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON public.conversations (created_by);

-- 2. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'seller', 'system')),
  text text,
  attachment_path text,
  read_at timestamptz,
  client_msg_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint for client_msg_id deduplication per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_msg_id
  ON public.messages (conversation_id, client_msg_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper to check conversation access based on roles:
-- Owner & Manager can access any chat in the shop.
-- Staff can ONLY access chats they created!
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv record;
  v_role text;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check if user is shop member
  SELECT role INTO v_role
  FROM public.shop_members
  WHERE shop_id = v_conv.shop_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid() AND active_shop_id = v_conv.shop_id;
  END IF;

  IF v_role IN ('owner', 'manager') THEN
    RETURN true;
  ELSIF v_role = 'staff' THEN
    RETURN v_conv.created_by = auth.uid();
  END IF;

  RETURN false;
END;
$$;

-- Conversations RLS
DROP POLICY IF EXISTS "Role-based conversation access" ON public.conversations;
CREATE POLICY "Role-based conversation access"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    (public.is_shop_owner_or_manager(shop_id))
    OR (created_by = auth.uid() AND public.is_shop_member(shop_id))
  );

-- Messages RLS
DROP POLICY IF EXISTS "Conversation member can view messages" ON public.messages;
CREATE POLICY "Conversation member can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.can_access_conversation(conversation_id));

-- 4. Storage Bucket 'chat-attachments'
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Chat participants can upload attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Chat participants can upload attachments"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'chat-attachments'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Chat participants can view attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Chat participants can view attachments"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'chat-attachments'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;

-- 5. RPC: get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv record;
  v_order record;
  v_role text;
BEGIN
  -- Verify shop membership
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Determine user role
  SELECT role INTO v_role FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND active_shop_id = p_shop_id;
  END IF;

  -- Find existing conversation
  IF p_order_id IS NOT NULL THEN
    IF v_role = 'staff' THEN
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id = p_order_id AND created_by = auth.uid()
      LIMIT 1;
    ELSE
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id = p_order_id
      LIMIT 1;
    END IF;
  ELSE
    IF v_role = 'staff' THEN
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id IS NULL AND created_by = auth.uid()
      LIMIT 1;
    ELSE
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id IS NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Create new if not exists
  IF v_conv IS NULL THEN
    INSERT INTO public.conversations (shop_id, order_id, created_by, status)
    VALUES (p_shop_id, p_order_id, auth.uid(), 'open')
    RETURNING * INTO v_conv;
  END IF;

  -- Fetch order details if linked
  IF v_conv.order_id IS NOT NULL THEN
    SELECT id, order_number, total_amount, order_status
    INTO v_order
    FROM public.orders WHERE id = v_conv.order_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'shop_id', v_conv.shop_id,
    'order_id', v_conv.order_id,
    'order_number', v_order.order_number,
    'order_total', v_order.total_amount,
    'order_status', v_order.order_status,
    'status', v_conv.status,
    'last_message_at', v_conv.last_message_at,
    'created_at', v_conv.created_at,
    'created_by', v_conv.created_by
  );
END;
$$;

-- 6. RPC: send_chat_message (Idempotent deduplication + Suspension check)
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id uuid,
  p_text text,
  p_attachment_path text DEFAULT NULL,
  p_client_msg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv record;
  v_shop record;
  v_msg record;
  v_client_id text;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_NOT_FOUND';
  END IF;

  -- Role access check
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Account suspension check
  SELECT * INTO v_shop FROM public.shops WHERE id = v_conv.shop_id;
  IF v_shop.status = 'suspended' OR v_shop.status = 'blocked' THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Your shop account is currently suspended. Chat sending is disabled.';
  END IF;

  v_client_id := COALESCE(p_client_msg_id, gen_random_uuid()::text);

  -- Idempotent insert with client_msg_id conflict handling
  INSERT INTO public.messages (
    conversation_id, sender_id, sender_role, text,
    attachment_path, client_msg_id
  ) VALUES (
    p_conversation_id, auth.uid(), 'customer', p_text,
    p_attachment_path, v_client_id
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

-- 7. RPC: list_chat_messages (Upward cursor pagination)
CREATE OR REPLACE FUNCTION public.list_chat_messages(
  p_conversation_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_messages jsonb;
  v_has_more boolean := false;
  v_next_cursor timestamptz := NULL;
  v_safe_limit int;
BEGIN
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_safe_limit := LEAST(COALESCE(p_limit, 30), 60);

  SELECT jsonb_agg(row_to_json(m))
  INTO v_messages
  FROM (
    SELECT
      id, conversation_id, sender_id, sender_role,
      text, attachment_path, read_at, client_msg_id, created_at
    FROM public.messages
    WHERE conversation_id = p_conversation_id
      AND (p_cursor IS NULL OR created_at < p_cursor)
    ORDER BY created_at DESC
    LIMIT v_safe_limit + 1
  ) m;

  IF v_messages IS NULL THEN
    v_messages := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(v_messages) > v_safe_limit THEN
    v_has_more := true;
    v_next_cursor := (v_messages->(v_safe_limit - 1)->>'created_at')::timestamptz;
    SELECT jsonb_agg(elem)
    INTO v_messages
    FROM (
      SELECT elem
      FROM jsonb_array_elements(v_messages) WITH ORDINALITY AS t(elem, idx)
      WHERE idx <= v_safe_limit
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'messages', v_messages,
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$$;

-- 8. RPC: mark_chat_messages_read
CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RETURN jsonb_build_object('success', false, 'count', 0);
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_role = 'seller'
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

-- 9. Realtime Publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
