-- ==============================================================================
-- Migration: Include stock_reservations in admin_danger_delete_inventory RPC
-- Prevents FK violation if a product variant had order stock reservations
-- ==============================================================================

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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_reservations' AND table_schema = 'public') THEN
      DELETE FROM public.stock_reservations WHERE variant_id = ANY(v_variant_ids);
    END IF;
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

GRANT EXECUTE ON FUNCTION public.admin_danger_delete_inventory(uuid) TO authenticated, service_role, anon;
