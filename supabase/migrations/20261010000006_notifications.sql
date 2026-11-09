-- ==============================================================================
-- Migration: Notifications System, Push Tokens, and Preferences (C16)
-- Features:
-- 1. notifications table (user_id, shop_id, type, category, title, body, data, is_critical, read_at)
-- 2. device_tokens table (unique per token, multi-account device reassignment on login, deletion on logout)
-- 3. notification_preferences table (per category toggles, quiet hours in Asia/Karachi, role filtering)
-- 4. RPCs: register_device_token, unregister_device_token, list_notifications, mark_notification_read, mark_all_notifications_read, get_notification_preferences, upsert_notification_preferences, dispatch_notification
-- 5. RLS policies and Realtime publication
-- ==============================================================================

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  type text NOT NULL,
  category text NOT NULL CHECK (category IN ('orders', 'delivery', 'payments', 'discounts', 'messages', 'offers')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  is_critical boolean DEFAULT false,
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_shop_created ON public.notifications (shop_id, created_at DESC);

-- 2. Create device_tokens table (unique per token to handle device handoff cleanly)
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens (user_id);

-- 3. Create notification_preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  orders_enabled boolean DEFAULT true,
  delivery_enabled boolean DEFAULT true,
  payments_enabled boolean DEFAULT true,
  offers_enabled boolean DEFAULT true,
  messages_enabled boolean DEFAULT true,
  quiet_hours_enabled boolean DEFAULT true,
  quiet_hours_start text DEFAULT '22:00', -- HH:MM in Asia/Karachi
  quiet_hours_end text DEFAULT '08:00',   -- HH:MM in Asia/Karachi
  timezone text DEFAULT 'Asia/Karachi',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_notification_prefs_user_shop UNIQUE (user_id, shop_id)
);

-- 4. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Notifications RLS
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Device Tokens RLS
DROP POLICY IF EXISTS "Users read own device tokens" ON public.device_tokens;
CREATE POLICY "Users read own device tokens" ON public.device_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own device tokens" ON public.device_tokens;
CREATE POLICY "Users manage own device tokens" ON public.device_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Notification Preferences RLS
DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 5. RPC: register_device_token(p_token, p_platform)
-- Reassigns token to current authenticated user if previously held by another account
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token text,
  p_platform text
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
  END IF;

  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'INVALID_TOKEN: Push token is required';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, last_seen)
  VALUES (v_user_id, trim(p_token), p_platform, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = v_user_id,
        platform = EXCLUDED.platform,
        last_seen = now();

  RETURN jsonb_build_object('success', true, 'token', p_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC: unregister_device_token(p_token)
-- Deletes device token on logout
CREATE OR REPLACE FUNCTION public.unregister_device_token(
  p_token text
)
RETURNS jsonb AS $$
BEGIN
  DELETE FROM public.device_tokens
  WHERE token = trim(p_token) AND user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RPC: list_notifications(p_shop_id, p_limit, p_cursor)
-- Keyset pagination with cursor and unread count
CREATE OR REPLACE FUNCTION public.list_notifications(
  p_shop_id uuid,
  p_limit int DEFAULT 30,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_unread_count int;
  v_items jsonb;
  v_has_more boolean := false;
  v_next_cursor timestamptz := null;
  v_limit int := coalesce(p_limit, 30);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
  END IF;

  -- Calculate total unread count for this user in this shop
  SELECT count(*) INTO v_unread_count
  FROM public.notifications
  WHERE user_id = v_user_id
    AND shop_id = p_shop_id
    AND read_at IS NULL;

  -- Select items with limit + 1 to detect has_more
  WITH paginated AS (
    SELECT 
      n.id,
      n.user_id,
      n.shop_id,
      n.type,
      n.category,
      n.title,
      n.body,
      n.data,
      n.is_critical,
      n.read_at,
      n.created_at
    FROM public.notifications n
    WHERE n.user_id = v_user_id
      AND n.shop_id = p_shop_id
      AND (p_cursor IS NULL OR n.created_at < p_cursor)
    ORDER BY n.created_at DESC
    LIMIT (v_limit + 1)
  ),
  counted AS (
    SELECT * FROM paginated LIMIT v_limit
  )
  SELECT 
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'userId', c.user_id,
        'shopId', c.shop_id,
        'type', c.type,
        'category', c.category,
        'title', c.title,
        'body', c.body,
        'data', c.data,
        'isCritical', c.is_critical,
        'readAt', c.read_at,
        'createdAt', c.created_at
      ) ORDER BY c.created_at DESC
    ), '[]'::jsonb),
    (SELECT count(*) > v_limit FROM paginated),
    (SELECT min(c.created_at) FROM counted c)
  INTO v_items, v_has_more, v_next_cursor
  FROM counted c;

  RETURN jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'unreadCount', v_unread_count,
    'hasMore', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. RPC: mark_notification_read(p_notification_id)
CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_unread_count int;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = v_user_id AND read_at IS NULL
  RETURNING shop_id INTO v_shop_id;

  IF v_shop_id IS NOT NULL THEN
    SELECT count(*) INTO v_unread_count
    FROM public.notifications
    WHERE user_id = v_user_id AND shop_id = v_shop_id AND read_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'notificationId', p_notification_id,
    'unreadCount', coalesce(v_unread_count, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. RPC: mark_all_notifications_read(p_shop_id)
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_shop_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = v_user_id 
      AND shop_id = p_shop_id 
      AND read_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'shopId', p_shop_id,
    'markedCount', v_count,
    'unreadCount', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 10. RPC: get_notification_preferences(p_shop_id)
CREATE OR REPLACE FUNCTION public.get_notification_preferences(
  p_shop_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prefs record;
BEGIN
  SELECT * INTO v_prefs
  FROM public.notification_preferences
  WHERE user_id = v_user_id AND shop_id = p_shop_id;

  IF NOT FOUND THEN
    -- Insert default preferences
    INSERT INTO public.notification_preferences (user_id, shop_id)
    VALUES (v_user_id, p_shop_id)
    RETURNING * INTO v_prefs;
  END IF;

  RETURN jsonb_build_object(
    'ordersEnabled', v_prefs.orders_enabled,
    'deliveryEnabled', v_prefs.delivery_enabled,
    'paymentsEnabled', v_prefs.payments_enabled,
    'offersEnabled', v_prefs.offers_enabled,
    'messagesEnabled', v_prefs.messages_enabled,
    'quietHoursEnabled', v_prefs.quiet_hours_enabled,
    'quietHoursStart', v_prefs.quiet_hours_start,
    'quietHoursEnd', v_prefs.quiet_hours_end,
    'timezone', v_prefs.timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 11. RPC: upsert_notification_preferences(p_shop_id, p_prefs)
CREATE OR REPLACE FUNCTION public.upsert_notification_preferences(
  p_shop_id uuid,
  p_prefs jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated record;
BEGIN
  INSERT INTO public.notification_preferences (
    user_id, shop_id,
    orders_enabled, delivery_enabled, payments_enabled, offers_enabled, messages_enabled,
    quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, updated_at
  ) VALUES (
    v_user_id, p_shop_id,
    coalesce((p_prefs->>'ordersEnabled')::boolean, true),
    coalesce((p_prefs->>'deliveryEnabled')::boolean, true),
    coalesce((p_prefs->>'paymentsEnabled')::boolean, true),
    coalesce((p_prefs->>'offersEnabled')::boolean, true),
    coalesce((p_prefs->>'messagesEnabled')::boolean, true),
    coalesce((p_prefs->>'quietHoursEnabled')::boolean, true),
    coalesce(p_prefs->>'quietHoursStart', '22:00'),
    coalesce(p_prefs->>'quietHoursEnd', '08:00'),
    coalesce(p_prefs->>'timezone', 'Asia/Karachi'),
    now()
  )
  ON CONFLICT (user_id, shop_id) DO UPDATE SET
    orders_enabled = coalesce((p_prefs->>'ordersEnabled')::boolean, public.notification_preferences.orders_enabled),
    delivery_enabled = coalesce((p_prefs->>'deliveryEnabled')::boolean, public.notification_preferences.delivery_enabled),
    payments_enabled = coalesce((p_prefs->>'paymentsEnabled')::boolean, public.notification_preferences.payments_enabled),
    offers_enabled = coalesce((p_prefs->>'offersEnabled')::boolean, public.notification_preferences.offers_enabled),
    messages_enabled = coalesce((p_prefs->>'messagesEnabled')::boolean, public.notification_preferences.messages_enabled),
    quiet_hours_enabled = coalesce((p_prefs->>'quietHoursEnabled')::boolean, public.notification_preferences.quiet_hours_enabled),
    quiet_hours_start = coalesce(p_prefs->>'quietHoursStart', public.notification_preferences.quiet_hours_start),
    quiet_hours_end = coalesce(p_prefs->>'quietHoursEnd', public.notification_preferences.quiet_hours_end),
    timezone = coalesce(p_prefs->>'timezone', public.notification_preferences.timezone),
    updated_at = now()
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'ordersEnabled', v_updated.orders_enabled,
    'deliveryEnabled', v_updated.delivery_enabled,
    'paymentsEnabled', v_updated.payments_enabled,
    'offersEnabled', v_updated.offers_enabled,
    'messagesEnabled', v_updated.messages_enabled,
    'quietHoursEnabled', v_updated.quiet_hours_enabled,
    'quietHoursStart', v_updated.quiet_hours_start,
    'quietHoursEnd', v_updated.quiet_hours_end,
    'timezone', v_updated.timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 12. RPC: dispatch_notification(...)
-- Helper to create notification row and return recipients for push notification Edge Function
CREATE OR REPLACE FUNCTION public.dispatch_notification(
  p_shop_id uuid,
  p_user_id uuid,
  p_type text,
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'::jsonb,
  p_is_critical boolean DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_role text;
  v_prefs record;
  v_notification_id uuid;
  v_category_allowed boolean := true;
BEGIN
  -- Verify shop membership and check role restriction
  SELECT public.shop_role(p_shop_id)::text INTO v_role;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'User not a member of shop');
  END IF;

  -- ROLE FILTER: Owner-only categories (payments) must NOT be sent to staff or manager
  IF p_category = 'payments' AND v_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Category restricted to owner');
  END IF;

  -- Check user notification preferences
  SELECT * INTO v_prefs 
  FROM public.notification_preferences 
  WHERE user_id = p_user_id AND shop_id = p_shop_id;

  IF FOUND THEN
    IF p_category = 'orders' AND v_prefs.orders_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'delivery' AND v_prefs.delivery_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'payments' AND v_prefs.payments_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'offers' AND v_prefs.offers_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'messages' AND v_prefs.messages_enabled = false THEN v_category_allowed := false; END IF;
  END IF;

  IF NOT v_category_allowed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Category disabled by user preference');
  END IF;

  -- Insert notification
  INSERT INTO public.notifications (
    user_id, shop_id, type, category, title, body, data, is_critical
  ) VALUES (
    p_user_id, p_shop_id, p_type, p_category, p_title, p_body, p_data, p_is_critical
  )
  RETURNING id INTO v_notification_id;

  RETURN jsonb_build_object(
    'success', true,
    'notificationId', v_notification_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 13. Enable Realtime Replication for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
