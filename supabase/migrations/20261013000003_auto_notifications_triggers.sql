-- ==============================================================================
-- Migration: Automatic In-App Notification Triggers for Messages and Orders
-- Description:
-- 1. Updates RLS on profiles and shop_users so wholesalers can access them.
-- 2. Trigger on public.messages:
--    - When a customer sends a message -> creates notification for wholesaler.
--    - When the wholesaler sends a message -> creates notification for customer.
-- 3. Trigger on public.orders:
--    - On INSERT (new order placed) -> creates notification for wholesaler & customer.
--    - On UPDATE of status (accepted/processing, out_for_delivery, delivered, cancelled)
--      -> creates status notification for customer.
-- ==============================================================================

-- 1. Grant wholesaler access to view all profiles and shop_users
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_wholesaler()
  );

DROP POLICY IF EXISTS "shop_users_select_own" ON public.shop_users;
DROP POLICY IF EXISTS "shop_users_select_policy" ON public.shop_users;
CREATE POLICY "shop_users_select_policy"
  ON public.shop_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_wholesaler()
  );

-- Ensure authenticated users can select and insert notifications
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_wholesaler());

DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Trigger Function: notify_on_new_message()
CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv record;
  v_shop_name text := 'Customer Shop';
  v_wholesaler_id uuid;
  v_customer_id uuid;
  v_preview text;
BEGIN
  -- Retrieve conversation details
  SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Message text preview
  v_preview := COALESCE(NULLIF(TRIM(NEW.text), ''), 'Sent an attachment');
  IF length(v_preview) > 80 THEN
    v_preview := substr(v_preview, 1, 77) || '...';
  END IF;

  -- A. Customer sent a message -> Notify Wholesaler
  IF NEW.sender_role = 'customer' THEN
    -- Get shop name
    SELECT name INTO v_shop_name FROM public.shops WHERE id = v_conv.shop_id;
    IF v_shop_name IS NULL OR v_shop_name = '' THEN
      v_shop_name := 'Customer Shop';
    END IF;

    -- Find wholesaler(s)
    FOR v_wholesaler_id IN
      SELECT id FROM public.profiles WHERE role IN ('wholesaler', 'admin', 'seller')
    LOOP
      -- Avoid self-notification if wholesaler sent message in test
      IF v_wholesaler_id <> NEW.sender_id THEN
        INSERT INTO public.notifications (
          user_id,
          shop_id,
          type,
          category,
          title,
          body,
          data,
          is_critical,
          created_at
        ) VALUES (
          v_wholesaler_id,
          v_conv.shop_id,
          'customer_message',
          'messages',
          '💬 New Message from ' || v_shop_name,
          v_preview,
          jsonb_build_object(
            'conversationId', NEW.conversation_id,
            'messageId', NEW.id,
            'shopId', v_conv.shop_id,
            'senderRole', 'customer'
          ),
          false,
          now()
        );
      END IF;
    END LOOP;

  -- B. Wholesaler / Seller replied -> Notify Customer
  ELSIF NEW.sender_role IN ('seller', 'admin', 'wholesaler') THEN
    -- Find customer user ID from conversation created_by or shop owner
    v_customer_id := v_conv.created_by;

    IF v_customer_id IS NULL THEN
      SELECT user_id INTO v_customer_id
      FROM public.shop_users
      WHERE shop_id = v_conv.shop_id
      LIMIT 1;
    END IF;

    IF v_customer_id IS NOT NULL AND v_customer_id <> NEW.sender_id THEN
      INSERT INTO public.notifications (
        user_id,
        shop_id,
        type,
        category,
        title,
        body,
        data,
        is_critical,
        created_at
      ) VALUES (
        v_customer_id,
        v_conv.shop_id,
        'seller_message',
        'messages',
        '💬 Message from Beverage Wholesaler',
        v_preview,
        jsonb_build_object(
          'conversationId', NEW.conversation_id,
          'messageId', NEW.id,
          'shopId', v_conv.shop_id,
          'senderRole', 'seller'
        ),
        false,
        now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_new_message ON public.messages;
CREATE TRIGGER trg_notify_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_message();


-- 3. Trigger Function: notify_on_order_status_change()
CREATE OR REPLACE FUNCTION public.notify_on_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_name text := 'Customer Shop';
  v_wholesaler_id uuid;
  v_order_num_str text;
  v_total_str text;
  v_customer_id uuid;
  v_status_title text;
  v_status_body text;
  v_is_critical boolean := false;
BEGIN
  v_order_num_str := CASE WHEN NEW.order_number IS NOT NULL THEN '#' || NEW.order_number::text ELSE '' END;
  v_total_str := 'Rs. ' || COALESCE(NEW.grand_total, 0)::text;

  -- Get shop name
  IF NEW.shop_id IS NOT NULL THEN
    SELECT name INTO v_shop_name FROM public.shops WHERE id = NEW.shop_id;
  END IF;
  IF v_shop_name IS NULL OR v_shop_name = '' THEN
    v_shop_name := 'Customer Shop';
  END IF;

  v_customer_id := NEW.user_id;

  -- Fallback customer user lookup from shop_users if order user_id is null
  IF v_customer_id IS NULL AND NEW.shop_id IS NOT NULL THEN
    SELECT user_id INTO v_customer_id
    FROM public.shop_users
    WHERE shop_id = NEW.shop_id
    LIMIT 1;
  END IF;

  -- -----------------------------------------------------------------
  -- EVENT: INSERT (New Order Placed)
  -- -----------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- 1. Notify Wholesaler about new incoming order
    FOR v_wholesaler_id IN
      SELECT id FROM public.profiles WHERE role IN ('wholesaler', 'admin', 'seller')
    LOOP
      INSERT INTO public.notifications (
        user_id,
        shop_id,
        type,
        category,
        title,
        body,
        data,
        is_critical,
        created_at
      ) VALUES (
        v_wholesaler_id,
        COALESCE(NEW.shop_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'order_status',
        'orders',
        '🔔 New Order ' || v_order_num_str || ' Received!',
        v_shop_name || ' placed an order for ' || v_total_str,
        jsonb_build_object(
          'orderId', NEW.id,
          'orderNumber', NEW.order_number,
          'shopId', NEW.shop_id,
          'status', NEW.status
        ),
        true,
        now()
      );
    END LOOP;

    -- 2. Notify Customer that order was placed & confirmed
    IF v_customer_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        shop_id,
        type,
        category,
        title,
        body,
        data,
        is_critical,
        created_at
      ) VALUES (
        v_customer_id,
        COALESCE(NEW.shop_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'order_status',
        'orders',
        '✅ Order ' || v_order_num_str || ' Confirmed!',
        'Your order for ' || v_total_str || ' is placed and confirmed. We are preparing it.',
        jsonb_build_object(
          'orderId', NEW.id,
          'orderNumber', NEW.order_number,
          'shopId', NEW.shop_id,
          'status', NEW.status
        ),
        false,
        now()
      );
    END IF;

  -- -----------------------------------------------------------------
  -- EVENT: UPDATE of order status (Accept, Dispatch, Deliver, Cancel)
  -- -----------------------------------------------------------------
  ELSIF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    
    -- Format status message for customer
    IF NEW.status = 'processing' THEN
      v_status_title := '📦 Order ' || v_order_num_str || ' Accepted';
      v_status_body := 'The wholesaler has accepted your order and is packing drinks.';
    ELSIF NEW.status = 'out_for_delivery' THEN
      v_status_title := '🚚 Order ' || v_order_num_str || ' Out for Delivery';
      v_status_body := 'Your beverage delivery is on the way to your shop!';
    ELSIF NEW.status = 'delivered' THEN
      v_status_title := '🎉 Order ' || v_order_num_str || ' Delivered';
      v_status_body := 'Your order has been delivered successfully. Thank you for your business!';
    ELSIF NEW.status = 'cancelled' THEN
      v_status_title := '❌ Order ' || v_order_num_str || ' Cancelled';
      v_status_body := 'Your order ' || v_order_num_str || ' has been cancelled.';
      v_is_critical := true;
    ELSE
      v_status_title := '📦 Order ' || v_order_num_str || ' Updated';
      v_status_body := 'Status updated to ' || NEW.status::text;
    END IF;

    -- Notify Customer
    IF v_customer_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        shop_id,
        type,
        category,
        title,
        body,
        data,
        is_critical,
        created_at
      ) VALUES (
        v_customer_id,
        COALESCE(NEW.shop_id, '00000000-0000-0000-0000-000000000000'::uuid),
        'order_status',
        'orders',
        v_status_title,
        v_status_body,
        jsonb_build_object(
          'orderId', NEW.id,
          'orderNumber', NEW.order_number,
          'shopId', NEW.shop_id,
          'status', NEW.status
        ),
        v_is_critical,
        now()
      );
    END IF;

    -- Also notify Wholesaler if customer cancelled or status changed from outside
    IF NEW.status = 'cancelled' THEN
      FOR v_wholesaler_id IN
        SELECT id FROM public.profiles WHERE role IN ('wholesaler', 'admin', 'seller')
      LOOP
        INSERT INTO public.notifications (
          user_id,
          shop_id,
          type,
          category,
          title,
          body,
          data,
          is_critical,
          created_at
        ) VALUES (
          v_wholesaler_id,
          COALESCE(NEW.shop_id, '00000000-0000-0000-0000-000000000000'::uuid),
          'order_status',
          'orders',
          '⚠️ Order ' || v_order_num_str || ' Cancelled',
          v_shop_name || ' cancelled order ' || v_order_num_str,
          jsonb_build_object(
            'orderId', NEW.id,
            'orderNumber', NEW.order_number,
            'shopId', NEW.shop_id,
            'status', NEW.status
          ),
          true,
          now()
        );
      END LOOP;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_order_status_change ON public.orders;
CREATE TRIGGER trg_notify_on_order_status_change
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_status_change();
