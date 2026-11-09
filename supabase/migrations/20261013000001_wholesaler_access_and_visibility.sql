-- ==============================================================================
-- Migration: Wholesaler Cross-Shop Visibility for Orders, Chats, and Profiles
-- Description:
-- 1. Sets up public.is_wholesaler() helper function.
-- 2. Sets role = 'wholesaler' for the main business owner Zia (ziaurrehman666666@gmail.com).
-- 3. Updates RLS policies on orders, order_items, shops, conversations, and messages
--    so wholesalers can view and manage all incoming orders and customer chats.
-- ==============================================================================

-- 1. Helper function to check if current authenticated user is a wholesaler / admin
CREATE OR REPLACE FUNCTION public.is_wholesaler()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('wholesaler', 'admin', 'seller')
        OR id IN (SELECT owner_id FROM public.businesses WHERE name = 'colddrinks' OR id = 'b8ac7d43-3f36-488e-9580-187c1875c710')
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_wholesaler() TO authenticated, anon;

-- 2. Ensure main business owner is assigned role = 'wholesaler'
UPDATE public.profiles
SET role = 'wholesaler'
WHERE email = 'ziaurrehman666666@gmail.com'
   OR id IN (SELECT owner_id FROM public.businesses WHERE name = 'colddrinks');

-- 3. Update SHOPS table RLS: wholesaler can view all shops
DROP POLICY IF EXISTS "shops_select_policy" ON public.shops;
CREATE POLICY "shops_select_policy"
  ON public.shops FOR SELECT
  TO authenticated
  USING (
    public.is_wholesaler()
    OR public.is_shop_member(id)
  );

-- 4. Update ORDERS table RLS: wholesaler can view and update all customer orders
DROP POLICY IF EXISTS "Shop members read orders" ON public.orders;
CREATE POLICY "Shop members read orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    public.is_wholesaler()
    OR public.is_shop_member(shop_id) 
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Shop members can update orders" ON public.orders;
CREATE POLICY "Shop members can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    public.is_wholesaler()
    OR public.is_shop_member(shop_id) 
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_wholesaler()
    OR public.is_shop_member(shop_id) 
    OR user_id = auth.uid()
  );

-- 5. Update ORDER_ITEMS table RLS: wholesaler can view all order line items
DROP POLICY IF EXISTS "Shop members read order items" ON public.order_items;
CREATE POLICY "Shop members read order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    public.is_wholesaler()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (public.is_shop_member(o.shop_id) OR o.user_id = auth.uid())
    )
  );

-- 6. Update CONVERSATIONS table RLS: wholesaler can view and participate in all chats
DROP POLICY IF EXISTS "Role-based conversation access" ON public.conversations;
CREATE POLICY "Role-based conversation access"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    public.is_wholesaler()
    OR public.can_access_conversation(id)
  );

DROP POLICY IF EXISTS "Wholesaler can update conversations" ON public.conversations;
CREATE POLICY "Wholesaler can update conversations"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    public.is_wholesaler()
    OR public.can_access_conversation(id)
  );

-- 7. Update MESSAGES table RLS: wholesaler can view all messages and insert replies
DROP POLICY IF EXISTS "Conversation member can view messages" ON public.messages;
CREATE POLICY "Conversation member can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    public.is_wholesaler()
    OR public.can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "Conversation participants can insert messages" ON public.messages;
CREATE POLICY "Conversation participants can insert messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_wholesaler()
    OR public.can_access_conversation(conversation_id)
  );
