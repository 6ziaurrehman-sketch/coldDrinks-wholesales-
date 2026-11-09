-- Migration: Fix get_home_feed RPC aggregation query

DROP FUNCTION IF EXISTS public.get_home_feed(uuid);
CREATE OR REPLACE FUNCTION get_home_feed(p_shop_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := jsonb_build_object(
        'active_orders', '[]'::jsonb,
        'last_order_summary', NULL,
        'credit_alert', NULL,
        'banners', coalesce((SELECT jsonb_agg(b) FROM banners b WHERE b.active = true), '[]'::jsonb),
        'recent_and_favorites', '[]'::jsonb,
        'popular_products', coalesce((
            SELECT jsonb_agg(item) FROM (
                SELECT jsonb_build_object(
                    'variant_id', pv.id,
                    'product_id', p.id,
                    'brand', coalesce(b.name, 'Cold Drinks'),
                    'name', p.name,
                    'image_url', coalesce(pv.image_url, p.image_url),
                    'sale_unit', pv.sale_unit::text,
                    'pieces_per_unit', pv.pieces_per_unit,
                    'normal_price', pv.price,
                    'shop_price', pv.price,
                    'availability', pv.stock_status::text,
                    'min_qty', pv.min_qty,
                    'max_qty', pv.max_qty,
                    'qty_multiple', pv.qty_multiple
                ) as item
                FROM product_variants pv
                JOIN products p ON p.id = pv.product_id
                LEFT JOIN brands b ON b.id = p.brand_id
                WHERE p.is_active = true AND pv.is_active = true
                ORDER BY b.sort_order ASC, p.name ASC
                LIMIT 12
            ) popular_sub
        ), '[]'::jsonb),
        'brands', coalesce((SELECT jsonb_agg(br) FROM (SELECT * FROM brands WHERE is_active = true ORDER BY sort_order ASC) br), '[]'::jsonb),
        'categories', coalesce((SELECT jsonb_agg(c) FROM (SELECT * FROM categories WHERE is_active = true ORDER BY sort_order ASC) c), '[]'::jsonb)
    );
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
