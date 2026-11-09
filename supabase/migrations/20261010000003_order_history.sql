-- 20261010000003_order_history.sql
-- Order History: RPC list_orders with keyset pagination, RPC get_order_detail with role-based masking, returns table

SET timezone = 'Asia/Karachi';

-- 1. Ensure invoice_url exists on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_url text;

-- 2. Create order_returns table if not exists
CREATE TABLE IF NOT EXISTS public.order_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'completed')),
    reason text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb,
    refund_amount numeric(12,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_returns_order ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_shop ON public.order_returns(shop_id);

ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read order returns" ON public.order_returns;
CREATE POLICY "Shop members read order returns" ON public.order_returns
    FOR SELECT TO authenticated
    USING (
        public.is_shop_member(shop_id) AND (
            public.shop_role(shop_id) IN ('owner', 'manager') OR user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Shop members insert order returns" ON public.order_returns;
CREATE POLICY "Shop members insert order returns" ON public.order_returns
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_shop_member(shop_id)
    );

-- 3. RPC list_orders(p_shop_id, p_from, p_to, p_status, p_search, p_cursor, p_limit)
-- Keyset pagination based on (created_at, id) descending
CREATE OR REPLACE FUNCTION public.list_orders(
    p_shop_id uuid,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_status text[] DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_cursor text DEFAULT NULL, -- Format: ISO timestamp + '|' + UUID
    p_limit int DEFAULT 20
)
RETURNS jsonb AS $$
DECLARE
    v_role text;
    v_clean_search text;
    v_cursor_created_at timestamptz;
    v_cursor_id uuid;
    v_orders jsonb;
    v_has_more boolean := false;
    v_next_cursor text := NULL;
    v_is_financial_auth boolean;
BEGIN
    -- Permission check
    IF NOT public.is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied to shop orders';
    END IF;

    SELECT public.shop_role(p_shop_id)::text INTO v_role;
    v_is_financial_auth := (v_role IN ('owner', 'manager'));

    -- Validate date range
    IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to < p_from THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE: End date cannot be before start date';
    END IF;

    -- Parse cursor if provided
    IF p_cursor IS NOT NULL AND position('|' in p_cursor) > 0 THEN
        v_cursor_created_at := split_part(p_cursor, '|', 1)::timestamptz;
        v_cursor_id := split_part(p_cursor, '|', 2)::uuid;
    END IF;

    -- Clean search string: remove commas (e.g. '14,500' -> '14500') and trim
    IF p_search IS NOT NULL THEN
        v_clean_search := trim(replace(p_search, ',', ''));
    END IF;

    -- Query orders with limit + 1 for hasMore detection
    WITH filtered AS (
        SELECT 
            o.id,
            o.order_number,
            o.shop_id,
            o.user_id,
            o.order_status,
            o.payment_status,
            o.delivery_status,
            o.delivery_eta,
            o.grand_total,
            o.created_at,
            o.updated_at,
            (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) as item_count
        FROM public.orders o
        WHERE o.shop_id = p_shop_id
          -- Staff can only see their own orders
          AND (v_role IN ('owner', 'manager') OR o.user_id = auth.uid())
          -- Date range filters
          AND (p_from IS NULL OR o.created_at >= p_from)
          AND (p_to IS NULL OR o.created_at <= p_to)
          -- Status filter
          AND (p_status IS NULL OR cardinality(p_status) = 0 OR o.order_status::text = ANY(p_status))
          -- Search filter: matches order number or total (with commas stripped)
          AND (
              v_clean_search IS NULL OR v_clean_search = '' OR
              o.order_number::text ILIKE '%' || v_clean_search || '%' OR
              o.grand_total::text ILIKE '%' || v_clean_search || '%'
          )
          -- Keyset pagination cursor
          AND (
              v_cursor_created_at IS NULL OR
              (o.created_at < v_cursor_created_at) OR
              (o.created_at = v_cursor_created_at AND o.id < v_cursor_id)
          )
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT (coalesce(p_limit, 20) + 1)
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', f.id,
            'orderNumber', f.order_number,
            'shopId', f.shop_id,
            'orderStatus', f.order_status,
            'paymentStatus', f.payment_status,
            'deliveryStatus', f.delivery_status,
            'deliveryEta', f.delivery_eta,
            -- Mask grand_total if caller is staff and not authorized for financial details
            'grandTotal', CASE WHEN v_is_financial_auth THEN f.grand_total ELSE NULL END,
            'isFinancialAuthorized', v_is_financial_auth,
            'createdAt', f.created_at,
            'updatedAt', f.updated_at,
            'itemCount', f.item_count
        )
    ), '[]'::jsonb)
    INTO v_orders
    FROM (
        SELECT * FROM filtered LIMIT coalesce(p_limit, 20)
    ) f;

    -- Determine hasMore
    IF (SELECT count(*) FROM filtered) > coalesce(p_limit, 20) THEN
        v_has_more := true;
        SELECT (o.created_at::text || '|' || o.id::text)
        INTO v_next_cursor
        FROM (SELECT * FROM filtered LIMIT coalesce(p_limit, 20)) o
        ORDER BY o.created_at ASC, o.id ASC
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'orders', v_orders,
        'hasMore', v_has_more,
        'nextCursor', v_next_cursor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RPC get_order_detail(p_order_id)
-- Returns items, snapshot quantities, prices (role restricted), status history, payment, invoice link, notes, returns
CREATE OR REPLACE FUNCTION public.get_order_detail(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_role text;
    v_is_financial_auth boolean;
    v_items jsonb;
    v_history jsonb;
    v_returns jsonb;
    v_payment jsonb;
    v_invoice_available boolean;
    v_invoice_url text;
BEGIN
    SELECT 
        o.id,
        o.order_number,
        o.shop_id,
        o.user_id,
        o.order_status,
        o.payment_method,
        o.payment_status,
        o.delivery_status,
        o.delivery_eta,
        o.delivery_failure_reason,
        o.subtotal,
        o.discount_total,
        o.tax_total,
        o.delivery_fee,
        o.grand_total,
        o.notes,
        o.invoice_url,
        o.created_at,
        o.updated_at,
        s.name as shop_name,
        ca.full_address as delivery_address,
        ca.contact_name,
        ca.contact_phone
    INTO v_order
    FROM public.orders o
    JOIN public.shops s ON s.id = o.shop_id
    LEFT JOIN public.customer_addresses ca ON ca.id = o.address_id
    WHERE o.id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
    END IF;

    IF NOT public.is_shop_member(v_order.shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied to this order';
    END IF;

    SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
    v_is_financial_auth := (v_role IN ('owner', 'manager'));

    -- Staff can ONLY view their own orders
    IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only view their own orders';
    END IF;

    -- Items snapshot: even if original product was deleted, snapshot data remains intact
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', oi.id,
            'variantId', oi.variant_id,
            'productName', oi.product_name,
            'brand', oi.brand,
            'saleUnit', oi.sale_unit,
            'piecesPerUnit', oi.pieces_per_unit,
            'orderedQty', oi.qty,
            'deliveredQty', coalesce(oi.delivered_qty, 0),
            'shortfallQty', GREATEST(0, oi.qty - coalesce(oi.delivered_qty, 0)),
            -- Role restriction: only owner and manager see unit_price and line_total
            'unitPrice', CASE WHEN v_is_financial_auth THEN oi.unit_price ELSE NULL END,
            'lineTotal', CASE WHEN v_is_financial_auth THEN oi.line_total ELSE NULL END
        )
    ), '[]'::jsonb)
    INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    -- Status history
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', h.id,
            'status', h.status,
            'statusType', h.status_type,
            'notes', h.notes,
            'createdAt', h.created_at,
            'actorRole', h.actor_role
        ) ORDER BY h.created_at ASC
    ), '[]'::jsonb)
    INTO v_history
    FROM public.order_status_history h
    WHERE h.order_id = p_order_id;

    -- Order returns
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'status', r.status,
            'reason', r.reason,
            'refundAmount', CASE WHEN v_is_financial_auth THEN r.refund_amount ELSE NULL END,
            'createdAt', r.created_at
        ) ORDER BY r.created_at DESC
    ), '[]'::jsonb)
    INTO v_returns
    FROM public.order_returns r
    WHERE r.order_id = p_order_id;

    -- Payment details
    v_payment := jsonb_build_object(
        'paymentMethod', v_order.payment_method,
        'paymentStatus', v_order.payment_status,
        'subtotal', CASE WHEN v_is_financial_auth THEN v_order.subtotal ELSE NULL END,
        'discountTotal', CASE WHEN v_is_financial_auth THEN v_order.discount_total ELSE NULL END,
        'taxTotal', CASE WHEN v_is_financial_auth THEN v_order.tax_total ELSE NULL END,
        'deliveryFee', CASE WHEN v_is_financial_auth THEN v_order.delivery_fee ELSE NULL END,
        'grandTotal', CASE WHEN v_is_financial_auth THEN v_order.grand_total ELSE NULL END
    );

    -- Invoice availability: generated and available only when order is delivered, and only for owner/manager
    v_invoice_available := (v_order.order_status = 'delivered' AND v_order.invoice_url IS NOT NULL);
    v_invoice_url := CASE WHEN (v_is_financial_auth AND v_invoice_available) THEN v_order.invoice_url ELSE NULL END;

    RETURN jsonb_build_object(
        'id', v_order.id,
        'orderNumber', v_order.order_number,
        'shopId', v_order.shop_id,
        'shopName', v_order.shop_name,
        'orderStatus', v_order.order_status,
        'paymentStatus', v_order.payment_status,
        'deliveryStatus', v_order.delivery_status,
        'deliveryEta', v_order.delivery_eta,
        'deliveryAddress', v_order.delivery_address,
        'contactName', v_order.contact_name,
        'contactPhone', v_order.contact_phone,
        'notes', v_order.notes,
        'isFinancialAuthorized', v_is_financial_auth,
        'grandTotal', CASE WHEN v_is_financial_auth THEN v_order.grand_total ELSE NULL END,
        'invoiceUrl', v_invoice_url,
        'isInvoiceAvailable', v_invoice_available,
        'createdAt', v_order.created_at,
        'updatedAt', v_order.updated_at,
        'items', v_items,
        'statusHistory', v_history,
        'payment', v_payment,
        'returns', v_returns
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
