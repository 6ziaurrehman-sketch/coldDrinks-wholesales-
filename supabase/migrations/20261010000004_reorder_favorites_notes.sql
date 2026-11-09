-- 20261010000004_reorder_favorites_notes.sql
-- C13 & C14: Reorder preview/apply, Favorites, Recent Products, and Order Notes

SET timezone = 'Asia/Karachi';

-------------------------------------------------------------------------------
-- 1. Favorites Table and Toggle RPC
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (shop_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_shop ON public.favorites(shop_id);
CREATE INDEX IF NOT EXISTS idx_favorites_variant ON public.favorites(variant_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read favorites" ON public.favorites;
CREATE POLICY "Shop members read favorites" ON public.favorites
    FOR SELECT TO authenticated
    USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS "Shop members write favorites" ON public.favorites;
CREATE POLICY "Shop members write favorites" ON public.favorites
    FOR ALL TO authenticated
    USING (public.is_shop_member(shop_id));

DROP FUNCTION IF EXISTS public.toggle_favorite(uuid, uuid);
CREATE OR REPLACE FUNCTION public.toggle_favorite(p_shop_id uuid, p_variant_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_exists boolean;
BEGIN
    IF NOT public.is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id;
        RETURN jsonb_build_object('is_favorite', false, 'variant_id', p_variant_id);
    ELSE
        INSERT INTO public.favorites (shop_id, variant_id, user_id)
        VALUES (p_shop_id, p_variant_id, auth.uid());
        RETURN jsonb_build_object('is_favorite', true, 'variant_id', p_variant_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 2. Recent Products (Recency + Frequency Scoring Formula)
-- Formula: score = (order_frequency * 2.0) * exp(-0.04 * days_since_last_order)
-- Higher order frequency boosts ranking; decay penalty applies as days increase.
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recent_products(p_shop_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    IF NOT public.is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
    END IF;

    WITH aggregated AS (
        SELECT 
            oi.variant_id,
            count(DISTINCT o.id)::numeric as order_frequency,
            max(o.created_at) as last_ordered_at,
            (EXTRACT(EPOCH FROM (now() - max(o.created_at))) / 86400.0) as days_ago
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.shop_id = p_shop_id
          AND oi.variant_id IS NOT NULL
          AND o.order_status NOT IN ('cancelled', 'rejected')
        GROUP BY oi.variant_id
    ),
    scored AS (
        SELECT 
            a.variant_id,
            a.order_frequency,
            a.last_ordered_at,
            a.days_ago,
            -- Recency + frequency decay scoring formula
            round(((a.order_frequency * 2.0) * exp(-0.04 * a.days_ago))::numeric, 4) as ranking_score,
            pv.price as current_price,
            pv.sale_unit,
            pv.pieces_per_unit,
            pv.stock_status,
            pv.min_qty,
            pv.max_qty,
            pv.qty_multiple,
            p.name as product_name,
            p.image_url,
            p.is_active as is_product_active,
            pv.is_active as is_variant_active,
            b.name as brand_name
        FROM aggregated a
        JOIN public.product_variants pv ON pv.id = a.variant_id
        JOIN public.products p ON p.id = pv.product_id
        LEFT JOIN public.brands b ON b.id = p.brand_id
        ORDER BY ranking_score DESC, a.last_ordered_at DESC
        LIMIT coalesce(p_limit, 20)
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'variantId', s.variant_id,
            'productName', s.product_name,
            'brandName', s.brand_name,
            'imageUrl', s.image_url,
            'saleUnit', s.sale_unit,
            'piecesPerUnit', s.pieces_per_unit,
            'currentPrice', s.current_price,
            'stockStatus', s.stock_status,
            'isAvailable', (s.is_product_active AND s.is_variant_active AND s.stock_status = 'in_stock'),
            'minQty', s.min_qty,
            'maxQty', s.max_qty,
            'qtyMultiple', s.qty_multiple,
            'orderFrequency', s.order_frequency,
            'lastOrderedAt', s.last_ordered_at,
            'rankingScore', s.ranking_score
        )
    ), '[]'::jsonb)
    INTO v_res
    FROM scored s;

    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 3. Reorder Preview RPC
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_preview(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_role text;
    v_lines jsonb;
    v_total_items int := 0;
    v_avail_items int := 0;
    v_unavail_items int := 0;
    v_adjusted_items int := 0;
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
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff can only reorder their own orders';
    END IF;

    -- Analyze each line item
    WITH analyzed_lines AS (
        SELECT 
            oi.id as line_id,
            oi.variant_id,
            oi.product_name,
            oi.brand,
            oi.sale_unit as original_sale_unit,
            oi.unit_price as original_unit_price,
            oi.qty as original_qty,
            pv.price as current_price,
            pv.sale_unit as current_sale_unit,
            pv.min_qty,
            pv.max_qty,
            pv.qty_multiple,
            pv.stock_status,
            (pv.id IS NOT NULL AND pv.is_active = true AND p.is_active = true AND pv.stock_status = 'in_stock') as is_available,
            p.category_id,
            p.brand_id
        FROM public.order_items oi
        LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
        LEFT JOIN public.products p ON p.id = pv.product_id
        WHERE oi.order_id = p_order_id
    ),
    adjusted_lines AS (
        SELECT 
            al.*,
            -- Calculate adjusted quantity if quantity rules changed
            CASE 
                WHEN NOT al.is_available THEN al.original_qty
                ELSE (
                    -- Clamp between min and max
                    LEAST(
                        coalesce(al.max_qty, 999),
                        GREATEST(
                            coalesce(al.min_qty, 1),
                            -- Adjust to multiple
                            ceil(al.original_qty::numeric / coalesce(al.qty_multiple, 1)) * coalesce(al.qty_multiple, 1)
                        )
                    )
                )
            END as adjusted_qty,
            -- Suggested replacements if unavailable
            CASE 
                WHEN NOT al.is_available THEN (
                    SELECT coalesce(jsonb_agg(
                        jsonb_build_object(
                            'variantId', rep_pv.id,
                            'productName', rep_p.name,
                            'saleUnit', rep_pv.sale_unit,
                            'currentPrice', rep_pv.price,
                            'stockStatus', rep_pv.stock_status
                        )
                    ), '[]'::jsonb)
                    FROM public.product_variants rep_pv
                    JOIN public.products rep_p ON rep_p.id = rep_pv.product_id
                    WHERE (rep_p.category_id = al.category_id OR rep_p.brand_id = al.brand_id)
                      AND rep_pv.id <> coalesce(al.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                      AND rep_pv.is_active = true
                      AND rep_p.is_active = true
                      AND rep_pv.stock_status = 'in_stock'
                    LIMIT 3
                )
                ELSE '[]'::jsonb
            END as suggested_replacements
        FROM analyzed_lines al
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'lineId', al.line_id,
            'variantId', al.variant_id,
            'productName', al.product_name,
            'brand', al.brand,
            'saleUnit', coalesce(al.current_sale_unit, al.original_sale_unit),
            'originalQty', al.original_qty,
            'adjustedQty', al.adjusted_qty,
            'originalPrice', al.original_unit_price,
            'currentPrice', coalesce(al.current_price, al.original_unit_price),
            'isAvailable', al.is_available,
            'stockStatus', al.stock_status,
            'minQty', al.min_qty,
            'maxQty', al.max_qty,
            'qtyMultiple', al.qty_multiple,
            'flags', jsonb_build_object(
                'available', al.is_available,
                'unavailable', NOT al.is_available,
                'qty_adjusted', (al.adjusted_qty <> al.original_qty),
                'price_changed', (al.current_price IS NOT NULL AND al.current_price <> al.original_unit_price)
            ),
            'qtyAdjustedReason', CASE 
                WHEN al.original_qty < al.min_qty THEN 'Quantity increased to meet minimum rule'
                WHEN al.original_qty > al.max_qty THEN 'Quantity reduced to maximum allowed'
                WHEN (al.original_qty % al.qty_multiple) <> 0 THEN 'Quantity adjusted to match order multiple'
                ELSE NULL
            END,
            'suggestedReplacements', al.suggested_replacements
        )
    ), '[]'::jsonb)
    INTO v_lines
    FROM adjusted_lines al;

    -- Calculate count metrics
    SELECT 
        count(*),
        count(*) FILTER (WHERE is_available = true),
        count(*) FILTER (WHERE is_available = false),
        count(*) FILTER (WHERE adjusted_qty <> original_qty)
    INTO v_total_items, v_avail_items, v_unavail_items, v_adjusted_items
    FROM adjusted_lines;

    RETURN jsonb_build_object(
        'orderId', p_order_id,
        'orderNumber', v_order.order_number,
        'shopId', v_order.shop_id,
        'totalItems', v_total_items,
        'availableItems', v_avail_items,
        'unavailableItems', v_unavail_items,
        'adjustedItems', v_adjusted_items,
        'lines', v_lines
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 4. Reorder Apply RPC (Idempotent Merge into Cart)
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_apply(
    p_order_id uuid,
    p_selections jsonb -- Array of { variantId, qty, skip }
)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_role text;
    v_cart_id uuid;
    v_item jsonb;
    v_variant_id uuid;
    v_qty int;
    v_skip boolean;
    v_curr_price numeric(12,2);
    v_added_count int := 0;
    v_skipped_count int := 0;
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
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff can only reorder their own orders';
    END IF;

    -- Find or create open cart for this shop
    SELECT id INTO v_cart_id FROM public.carts WHERE shop_id = v_order.shop_id AND status = 'open' LIMIT 1;
    IF v_cart_id IS NULL THEN
        INSERT INTO public.carts (shop_id, user_id, status)
        VALUES (v_order.shop_id, auth.uid(), 'open')
        RETURNING id INTO v_cart_id;
    END IF;

    -- Process selections
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_selections)
    LOOP
        v_variant_id := (v_item->>'variantId')::uuid;
        v_qty := (v_item->>'qty')::int;
        v_skip := coalesce((v_item->>'skip')::boolean, false);

        IF v_skip OR v_variant_id IS NULL OR v_qty <= 0 THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Verify variant is currently available and get current price
        SELECT price INTO v_curr_price
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        WHERE pv.id = v_variant_id AND pv.is_active = true AND p.is_active = true AND pv.stock_status = 'in_stock';

        IF NOT FOUND THEN
            -- Item not currently available
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Idempotent merge: merge quantity with existing cart line if present
        INSERT INTO public.cart_items (cart_id, variant_id, qty, added_price)
        VALUES (v_cart_id, v_variant_id, v_qty, v_curr_price)
        ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET qty = public.cart_items.qty + v_qty,
            added_price = v_curr_price,
            updated_at = now();

        v_added_count := v_added_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'cartId', v_cart_id,
        'addedCount', v_added_count,
        'skippedCount', v_skipped_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 5. C14: Order Notes Table and RPC add_or_edit_note
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    author_role text,
    text text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order ON public.order_notes(order_id);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read order notes" ON public.order_notes;
CREATE POLICY "Shop members read order notes" ON public.order_notes
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_notes.order_id AND public.is_shop_member(o.shop_id))
    );

DROP POLICY IF EXISTS "Shop members insert order notes" ON public.order_notes;
CREATE POLICY "Shop members insert order notes" ON public.order_notes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_notes.order_id AND public.is_shop_member(o.shop_id))
    );

CREATE OR REPLACE FUNCTION public.add_or_edit_note(
    p_order_id uuid,
    p_text text,
    p_note_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_clean_text text;
    v_role text;
    v_note_id uuid;
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
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff can only edit notes on their own orders';
    END IF;

    -- REJECT edits once order_status is confirmed or later
    IF v_order.order_status NOT IN ('placed') THEN
        RAISE EXCEPTION 'NOTE_LOCKED: Notes cannot be changed after the seller confirms. Use Help with this order.';
    END IF;

    -- Sanitize text: strip control characters (preserve emojis and Urdu/Arabic characters)
    v_clean_text := regexp_replace(trim(p_text), '[\x00-\x1F\x7F]', '', 'g');

    -- Validate length
    IF length(v_clean_text) = 0 THEN
        RAISE EXCEPTION 'EMPTY_NOTE: Note cannot be empty';
    END IF;

    IF length(v_clean_text) > 500 THEN
        RAISE EXCEPTION 'NOTE_TOO_LONG: Note exceeds maximum length of 500 characters';
    END IF;

    -- Insert or edit note
    IF p_note_id IS NOT NULL THEN
        UPDATE public.order_notes
        SET text = v_clean_text,
            updated_at = now()
        WHERE id = p_note_id AND order_id = p_order_id
        RETURNING id INTO v_note_id;
    ELSE
        INSERT INTO public.order_notes (order_id, user_id, author_role, text)
        VALUES (p_order_id, auth.uid(), v_role, v_clean_text)
        RETURNING id INTO v_note_id;
    END IF;

    -- Sync back to orders.notes for delivery slip / seller visibility
    UPDATE public.orders
    SET notes = v_clean_text,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'noteId', v_note_id,
        'orderId', p_order_id,
        'text', v_clean_text,
        'authorRole', v_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
