-- ==============================================================================
-- Migration: Admin Danger Zone Cascades & Atomic Purge RPCs
-- Fixes:
-- 1. "customer_payments_customer_id_fkey" violation when deleting customers/stores/users
-- 2. "ORDER_ALREADY_FINALIZED" error and failure to permanently delete orders
-- 3. Missing DELETE RLS policies and cascading foreign keys
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX FOREIGN KEY CONSTRAINTS (ENABLE ON DELETE CASCADE)
-- ------------------------------------------------------------------------------

-- customer_payments: ensure deleting a customer cascades cleanly to payment records
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'customer_payments_customer_id_fkey' 
      AND table_name = 'customer_payments'
  ) THEN
    ALTER TABLE public.customer_payments DROP CONSTRAINT customer_payments_customer_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'customer_payments' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.customer_payments
      ADD CONSTRAINT customer_payments_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ledger_entries: ensure order and shop deletions cascade cleanly
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_ledger_order' 
      AND table_name = 'ledger_entries'
  ) THEN
    ALTER TABLE public.ledger_entries DROP CONSTRAINT fk_ledger_order;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ledger_entries' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT fk_ledger_order
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ledger_entries_shop_id_fkey' 
      AND table_name = 'ledger_entries'
  ) THEN
    ALTER TABLE public.ledger_entries DROP CONSTRAINT ledger_entries_shop_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ledger_entries' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_entries_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. RLS DELETE POLICIES
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Orders DELETE policy
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete orders" ON public.orders;
    CREATE POLICY "Allow delete orders" ON public.orders FOR DELETE TO authenticated, anon USING (true);
  END IF;

  -- Order Items DELETE policy
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete order_items" ON public.order_items;
    CREATE POLICY "Allow delete order_items" ON public.order_items FOR DELETE TO authenticated, anon USING (true);
  END IF;

  -- Customers DELETE policy
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete customers" ON public.customers;
    CREATE POLICY "Allow delete customers" ON public.customers FOR DELETE TO authenticated, anon USING (true);
  END IF;

  -- Profiles DELETE policy
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete profiles" ON public.profiles;
    CREATE POLICY "Allow delete profiles" ON public.profiles FOR DELETE TO authenticated, anon USING (true);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ATOMIC DANGER ZONE RPCS (SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- (A) Permanently Delete an Order
CREATE OR REPLACE FUNCTION public.admin_danger_delete_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- Child records
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.order_tracking WHERE order_id = p_order_id;
  DELETE FROM public.order_status_history WHERE order_id = p_order_id;
  DELETE FROM public.cancellation_requests WHERE order_id = p_order_id;
  DELETE FROM public.ledger_entries WHERE order_id = p_order_id;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_feedback' AND table_schema = 'public') THEN
    DELETE FROM public.order_feedback WHERE order_id = p_order_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reorder_items' AND table_schema = 'public') THEN
    DELETE FROM public.reorder_items WHERE order_id = p_order_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_returns' AND table_schema = 'public') THEN
    DELETE FROM public.customer_returns WHERE order_id = p_order_id;
  END IF;

  UPDATE public.chat_threads SET order_id = NULL WHERE order_id = p_order_id;
  UPDATE public.support_tickets SET order_id = NULL WHERE order_id = p_order_id;

  DELETE FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'message', 'Order permanently deleted', 'order_id', p_order_id);
END;
$$;

-- (B) Bulk Purge Cancelled Orders
CREATE OR REPLACE FUNCTION public.admin_danger_clear_cancelled_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_order_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_order_ids
  FROM public.orders
  WHERE status = 'cancelled';

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'deleted_count', 0, 'message', 'No cancelled orders found');
  END IF;

  v_count := array_length(v_order_ids, 1);

  DELETE FROM public.order_items WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.order_tracking WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.order_status_history WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.cancellation_requests WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.ledger_entries WHERE order_id = ANY(v_order_ids);

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_feedback' AND table_schema = 'public') THEN
    DELETE FROM public.order_feedback WHERE order_id = ANY(v_order_ids);
  END IF;

  UPDATE public.chat_threads SET order_id = NULL WHERE order_id = ANY(v_order_ids);
  UPDATE public.support_tickets SET order_id = NULL WHERE order_id = ANY(v_order_ids);

  DELETE FROM public.orders WHERE id = ANY(v_order_ids);

  RETURN jsonb_build_object('success', true, 'deleted_count', v_count, 'message', format('%s cancelled order(s) purged permanently', v_count));
END;
$$;

-- (C) Permanently Delete a Store & Customer
CREATE OR REPLACE FUNCTION public.admin_danger_delete_store(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_name text;
BEGIN
  SELECT name INTO v_shop_name FROM public.customers WHERE id = p_store_id;
  IF v_shop_name IS NULL THEN
    SELECT name INTO v_shop_name FROM public.shops WHERE id = p_store_id;
  END IF;

  -- 1. Payments and ledger
  DELETE FROM public.customer_payments WHERE customer_id = p_store_id;
  DELETE FROM public.wholesaler_customer_ledger WHERE customer_id = p_store_id;

  -- 2. Unlink sales
  UPDATE public.sales SET customer_id = NULL WHERE customer_id = p_store_id;

  -- 3. Delete from customers table
  DELETE FROM public.customers WHERE id = p_store_id;

  -- 4. Clean shop references if shop exists with same ID
  IF EXISTS (SELECT 1 FROM public.shops WHERE id = p_store_id) THEN
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = p_store_id);
    DELETE FROM public.order_tracking WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = p_store_id);
    DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = p_store_id);
    DELETE FROM public.cancellation_requests WHERE shop_id = p_store_id;
    DELETE FROM public.orders WHERE shop_id = p_store_id;

    DELETE FROM public.credit_accounts WHERE shop_id = p_store_id;
    DELETE FROM public.ledger_entries WHERE shop_id = p_store_id;
    DELETE FROM public.shop_users WHERE shop_id = p_store_id;
    DELETE FROM public.customer_addresses WHERE shop_id = p_store_id;
    DELETE FROM public.invoices WHERE shop_id = p_store_id;
    DELETE FROM public.audit_logs WHERE shop_id = p_store_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_threads' AND table_schema = 'public') THEN
      DELETE FROM public.chat_threads WHERE shop_id = p_store_id;
    END IF;

    DELETE FROM public.shops WHERE id = p_store_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', format('Store %s purged successfully', COALESCE(v_shop_name, p_store_id::text)));
END;
$$;

-- (D) Permanently Delete a User Profile
CREATE OR REPLACE FUNCTION public.admin_danger_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_ids uuid[];
BEGIN
  -- 1. Find any shops owned by this user
  SELECT array_agg(id) INTO v_shop_ids
  FROM public.shops
  WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = p_user_id);

  IF v_shop_ids IS NOT NULL AND array_length(v_shop_ids, 1) > 0 THEN
    DELETE FROM public.customer_payments WHERE customer_id = ANY(v_shop_ids);
    DELETE FROM public.wholesaler_customer_ledger WHERE customer_id = ANY(v_shop_ids);
    UPDATE public.sales SET customer_id = NULL WHERE customer_id = ANY(v_shop_ids);
    DELETE FROM public.customers WHERE id = ANY(v_shop_ids);

    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = ANY(v_shop_ids));
    DELETE FROM public.orders WHERE shop_id = ANY(v_shop_ids);
    DELETE FROM public.credit_accounts WHERE shop_id = ANY(v_shop_ids);
    DELETE FROM public.ledger_entries WHERE shop_id = ANY(v_shop_ids);
    DELETE FROM public.shops WHERE id = ANY(v_shop_ids);
  END IF;

  -- 2. Unlink user records
  DELETE FROM public.shop_users WHERE user_id = p_user_id;
  DELETE FROM public.businesses WHERE owner_id = p_user_id;
  UPDATE public.orders SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.audit_logs SET user_id = NULL WHERE user_id = p_user_id;

  -- 3. Delete from profiles
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 4. Remove from auth.users if accessible
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'message', format('User %s purged successfully', p_user_id));
END;
$$;

-- (E) Permanently Delete Inventory / Product
CREATE OR REPLACE FUNCTION public.admin_danger_delete_inventory(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_variant_ids
  FROM public.product_variants
  WHERE product_id = p_product_id;

  IF v_variant_ids IS NOT NULL AND array_length(v_variant_ids, 1) > 0 THEN
    DELETE FROM public.inventory WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.stock_movements WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.stock_adjustments WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.sale_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.purchase_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.order_items WHERE variant_id = ANY(v_variant_ids);
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cart_items' AND table_schema = 'public') THEN
      DELETE FROM public.cart_items WHERE variant_id = ANY(v_variant_ids);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'price_list_items' AND table_schema = 'public') THEN
      DELETE FROM public.price_list_items WHERE variant_id = ANY(v_variant_ids);
    END IF;

    DELETE FROM public.product_variants WHERE product_id = p_product_id;
  END IF;

  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'message', format('Product %s purged successfully', p_product_id));
END;
$$;

-- (F) Permanently Delete Sales Slip
CREATE OR REPLACE FUNCTION public.admin_danger_delete_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;
  DELETE FROM public.customer_payments WHERE sale_id = p_sale_id;
  DELETE FROM public.wholesaler_customer_ledger WHERE reference_id = p_sale_id::text;
  DELETE FROM public.sales WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true, 'message', format('Sale %s purged successfully', p_sale_id));
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. GRANTS
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_order(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_clear_cancelled_orders() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_store(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_user(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_inventory(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_sale(uuid) TO authenticated, service_role, anon;
