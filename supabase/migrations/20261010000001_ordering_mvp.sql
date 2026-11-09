-- 20261010000001_ordering_mvp.sql
-- Ordering MVP (C4 - C10)

SET timezone = 'Asia/Karachi';

-------------------------------------------------------------------------------
-- C4: Banners
-------------------------------------------------------------------------------
CREATE TABLE banners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    body text,
    image_url text NOT NULL,
    link_type text,
    link_target text,
    priority int DEFAULT 0,
    starts_at timestamptz,
    ends_at timestamptz,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banners are readable by all authenticated users" ON banners FOR SELECT TO authenticated USING (true);

-------------------------------------------------------------------------------
-- C5: Products & Catalog
-------------------------------------------------------------------------------
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    parent_id uuid REFERENCES categories(id),
    sort_order int DEFAULT 0,
    icon_name text,
    is_active boolean DEFAULT true
);

CREATE TABLE brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    logo_url text,
    sort_order int DEFAULT 0,
    is_active boolean DEFAULT true
);

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid REFERENCES brands(id),
    name text NOT NULL,
    sku text UNIQUE,
    category_id uuid REFERENCES categories(id),
    subcategory_id uuid REFERENCES categories(id),
    image_url text,
    description text,
    is_active boolean DEFAULT true,
    fts tsvector,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TYPE sale_unit_enum AS ENUM ('carton', 'case', 'shrink', 'pack', 'single');
CREATE TYPE stock_status_enum AS ENUM ('in_stock', 'low_stock', 'out_of_stock');

CREATE TABLE product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    sale_unit sale_unit_enum NOT NULL,
    pieces_per_unit int NOT NULL DEFAULT 1,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    min_qty int DEFAULT 1,
    max_qty int DEFAULT 999,
    qty_multiple int DEFAULT 1,
    is_active boolean DEFAULT true,
    stock_status stock_status_enum DEFAULT 'in_stock',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE customer_favorites (
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (shop_id, variant_id, user_id)
);

CREATE TABLE stock_notifications (
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (shop_id, variant_id, user_id)
);

-- Full-text search trigger and indexes
CREATE INDEX products_fts_idx ON products USING GIN (fts);

CREATE OR REPLACE FUNCTION products_fts_update() RETURNS trigger AS $$
BEGIN
    NEW.fts := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
               setweight(to_tsvector('english', coalesce(NEW.sku, '')), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_fts_trigger BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION products_fts_update();

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories readable by auth" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Brands readable by auth" ON brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Products readable by auth" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Variants readable by auth" ON product_variants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Shop members can read favorites" ON customer_favorites FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members can manage favorites" ON customer_favorites FOR ALL TO authenticated USING (is_shop_member(shop_id));

CREATE POLICY "Shop members can read notifications" ON stock_notifications FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members can manage notifications" ON stock_notifications FOR ALL TO authenticated USING (is_shop_member(shop_id));

-------------------------------------------------------------------------------
-- C7: Pricing Engine
-------------------------------------------------------------------------------
CREATE TABLE price_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    tier text
);

CREATE TABLE price_list_items (
    price_list_id uuid REFERENCES price_lists(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    UNIQUE (price_list_id, variant_id)
);

CREATE TABLE shop_price_list (
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    price_list_id uuid REFERENCES price_lists(id) ON DELETE CASCADE,
    PRIMARY KEY (shop_id, price_list_id)
);

CREATE TABLE customer_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    valid_from timestamptz DEFAULT now(),
    valid_to timestamptz,
    created_by uuid REFERENCES auth.users(id),
    UNIQUE NULLS NOT DISTINCT (shop_id, variant_id, valid_to)
);

CREATE TYPE promo_type_enum AS ENUM ('percentage', 'fixed_amount', 'buy_x_get_y');

CREATE TABLE promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type promo_type_enum NOT NULL,
    value numeric CHECK (value >= 0),
    min_qty int DEFAULT 1,
    variant_ids uuid[],
    category_ids uuid[],
    brand_ids uuid[],
    starts_at timestamptz,
    ends_at timestamptz,
    is_active boolean DEFAULT true,
    stackable boolean DEFAULT false,
    priority int DEFAULT 0
);

CREATE TABLE bulk_discounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    min_qty int NOT NULL,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    is_active boolean DEFAULT true,
    UNIQUE (variant_id, min_qty)
);

ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing readable by auth" ON price_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pricing items readable by auth" ON price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shop pricing list readable by shop members" ON shop_price_list FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Customer prices readable by shop members" ON customer_prices FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Promos readable by auth" ON promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Bulk discounts readable by auth" ON bulk_discounts FOR SELECT TO authenticated USING (true);


CREATE OR REPLACE FUNCTION resolve_price(p_shop_id uuid, p_variant_id uuid, p_qty int DEFAULT 1)
RETURNS jsonb AS $$
DECLARE
    v_base_price numeric(12,2);
    v_unit_price numeric(12,2);
    v_normal_price numeric(12,2);
    v_price_source text := 'normal';
    v_custom_price numeric(12,2);
    v_list_price numeric(12,2);
    v_bulk_price numeric(12,2);
BEGIN
    -- 1. Get Normal Price
    SELECT price INTO v_normal_price FROM product_variants WHERE id = p_variant_id;
    v_base_price := v_normal_price;

    -- 2. Check Customer Prices
    SELECT price INTO v_custom_price FROM customer_prices
    WHERE shop_id = p_shop_id AND variant_id = p_variant_id
      AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
    ORDER BY valid_from DESC LIMIT 1;

    IF v_custom_price IS NOT NULL THEN
        v_base_price := v_custom_price;
        v_price_source := 'customer_price';
    ELSE
        -- 3. Check Price List
        SELECT pli.price INTO v_list_price
        FROM shop_price_list spl
        JOIN price_list_items pli ON spl.price_list_id = pli.price_list_id
        WHERE spl.shop_id = p_shop_id AND pli.variant_id = p_variant_id LIMIT 1;
        
        IF v_list_price IS NOT NULL THEN
            v_base_price := v_list_price;
            v_price_source := 'price_list';
        END IF;
    END IF;

    -- 4. Check Bulk Discounts
    SELECT price INTO v_bulk_price FROM bulk_discounts
    WHERE variant_id = p_variant_id AND min_qty <= p_qty AND is_active = true
    ORDER BY min_qty DESC LIMIT 1;

    IF v_bulk_price IS NOT NULL AND v_bulk_price < v_base_price THEN
        v_base_price := v_bulk_price;
        v_price_source := 'bulk_discount';
    END IF;

    -- Note: simplified promo application
    v_unit_price := v_base_price;

    RETURN jsonb_build_object(
        'unit_price', v_unit_price,
        'normal_price', v_normal_price,
        'line_total', round(v_unit_price * p_qty, 2),
        'price_source', v_price_source,
        'applied_discounts', '[]'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- C8: Cart
-------------------------------------------------------------------------------
CREATE TYPE cart_status_enum AS ENUM ('open', 'checked_out', 'abandoned');

CREATE TABLE carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    status cart_status_enum DEFAULT 'open',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_cart_shop_open ON carts(shop_id) WHERE status = 'open';

CREATE TABLE cart_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id uuid REFERENCES carts(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    qty int CHECK (qty > 0),
    added_price numeric(12,2) CHECK (added_price >= 0),
    added_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (cart_id, variant_id)
);

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop members can read carts" ON carts FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members can update carts" ON carts FOR ALL TO authenticated USING (is_shop_member(shop_id));

CREATE POLICY "Shop members can read cart items" ON cart_items FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM carts WHERE id = cart_items.cart_id AND is_shop_member(shop_id))
);
CREATE POLICY "Shop members can update cart items" ON cart_items FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM carts WHERE id = cart_items.cart_id AND is_shop_member(shop_id))
);


-------------------------------------------------------------------------------
-- C9: Checkout & Orders
-------------------------------------------------------------------------------
CREATE TYPE payment_method_enum AS ENUM ('cash', 'credit', 'bank_transfer');
CREATE TYPE payment_status_enum AS ENUM ('unpaid', 'paid', 'partial', 'refunded');
CREATE TYPE order_status_enum AS ENUM ('pending_owner_approval', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'returned');
CREATE TYPE ledger_type_enum AS ENUM ('credit_used', 'credit_payment', 'credit_adjustment');
CREATE TYPE proof_status_enum AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE delivery_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date date NOT NULL,
    label text NOT NULL,
    cutoff_time timetz NOT NULL,
    capacity int NOT NULL,
    booked int DEFAULT 0,
    zone_id uuid REFERENCES delivery_zones(id),
    is_active boolean DEFAULT true
);

CREATE TABLE credit_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
    credit_limit numeric(12,2) CHECK (credit_limit >= 0) DEFAULT 0,
    used numeric(12,2) DEFAULT 0,
    overdue boolean DEFAULT false
);

CREATE TABLE ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid REFERENCES shops(id),
    order_id uuid, -- FK added below
    type ledger_type_enum NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number serial,
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    address_id uuid REFERENCES customer_addresses(id),
    delivery_slot_id uuid REFERENCES delivery_slots(id),
    payment_method payment_method_enum NOT NULL,
    payment_status payment_status_enum DEFAULT 'unpaid',
    status order_status_enum DEFAULT 'confirmed',
    subtotal numeric(12,2) CHECK (subtotal >= 0) DEFAULT 0,
    discount_total numeric(12,2) CHECK (discount_total >= 0) DEFAULT 0,
    tax_total numeric(12,2) CHECK (tax_total >= 0) DEFAULT 0,
    delivery_fee numeric(12,2) CHECK (delivery_fee >= 0) DEFAULT 0,
    deposit_total numeric(12,2) CHECK (deposit_total >= 0) DEFAULT 0,
    grand_total numeric(12,2) CHECK (grand_total >= 0) DEFAULT 0,
    notes text,
    discount_request text,
    idempotency_key text UNIQUE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_order FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id),
    product_name text NOT NULL,
    brand text,
    sale_unit text,
    pieces_per_unit int,
    unit_price numeric(12,2) CHECK (unit_price >= 0) NOT NULL,
    qty int CHECK (qty > 0) NOT NULL,
    line_total numeric(12,2) CHECK (line_total >= 0) NOT NULL,
    discount_amount numeric(12,2) CHECK (discount_amount >= 0) DEFAULT 0,
    is_deposit_item boolean DEFAULT false
);

CREATE TABLE order_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    status text NOT NULL,
    changed_by uuid REFERENCES auth.users(id),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE stock_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id),
    qty int NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE payment_proofs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    status proof_status_enum DEFAULT 'pending',
    uploaded_at timestamptz DEFAULT now(),
    verified_by uuid REFERENCES auth.users(id),
    verified_at timestamptz
);

-- Enable RLS for all C9 tables
ALTER TABLE delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Slots readable by auth" ON delivery_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shop members read credit" ON credit_accounts FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members read ledger" ON ledger_entries FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members read orders" ON orders FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members read order items" ON order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND is_shop_member(shop_id)));
CREATE POLICY "Shop members read order status" ON order_status_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = order_status_history.order_id AND is_shop_member(shop_id)));
CREATE POLICY "Shop members read reservations" ON stock_reservations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = stock_reservations.order_id AND is_shop_member(shop_id)));
CREATE POLICY "Shop members read payment proofs" ON payment_proofs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = payment_proofs.order_id AND is_shop_member(shop_id)));

-------------------------------------------------------------------------------
-- RPCs
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_home_feed(p_shop_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop';
    END IF;
    
    v_res := jsonb_build_object(
        'active_orders', '[]'::jsonb,
        'last_order_summary', NULL,
        'credit_alert', NULL,
        'banners', (SELECT jsonb_agg(b) FROM banners b WHERE b.active = true),
        'recent_and_favorites', '[]'::jsonb,
        'popular_products', '[]'::jsonb,
        'brands', (SELECT jsonb_agg(br) FROM brands br WHERE br.is_active = true),
        'categories', (SELECT jsonb_agg(c) FROM categories c WHERE c.is_active = true)
    );
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION catalog_for_shop(
    p_shop_id uuid, p_query text DEFAULT NULL, p_brand_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL,
    p_availability text DEFAULT NULL, p_sort text DEFAULT 'name_asc', p_cursor uuid DEFAULT NULL, p_limit int DEFAULT 20
) RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('data', '[]'::jsonb, 'next_cursor', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION toggle_favorite(p_shop_id uuid, p_variant_id uuid)
RETURNS boolean AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    IF EXISTS (SELECT 1 FROM customer_favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid()) THEN
        DELETE FROM customer_favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid();
        RETURN false;
    ELSE
        INSERT INTO customer_favorites (shop_id, variant_id, user_id) VALUES (p_shop_id, p_variant_id, auth.uid());
        RETURN true;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION toggle_notify_me(p_shop_id uuid, p_variant_id uuid)
RETURNS boolean AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    IF EXISTS (SELECT 1 FROM stock_notifications WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid()) THEN
        DELETE FROM stock_notifications WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid();
        RETURN false;
    ELSE
        INSERT INTO stock_notifications (shop_id, variant_id, user_id) VALUES (p_shop_id, p_variant_id, auth.uid());
        RETURN true;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_product_detail(p_variant_id uuid, p_shop_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('detail', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION cart_upsert_item(p_shop_id uuid, p_variant_id uuid, p_qty int)
RETURNS void AS $$
DECLARE
    v_cart_id uuid;
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    
    SELECT id INTO v_cart_id FROM carts WHERE shop_id = p_shop_id AND status = 'open';
    IF NOT FOUND THEN
        INSERT INTO carts (shop_id, user_id) VALUES (p_shop_id, auth.uid()) RETURNING id INTO v_cart_id;
    END IF;

    IF p_qty = 0 THEN
        DELETE FROM cart_items WHERE cart_id = v_cart_id AND variant_id = p_variant_id;
    ELSE
        INSERT INTO cart_items (cart_id, variant_id, qty, added_price)
        VALUES (v_cart_id, p_variant_id, p_qty, (resolve_price(p_shop_id, p_variant_id, p_qty)->>'unit_price')::numeric)
        ON CONFLICT (cart_id, variant_id) DO UPDATE SET qty = p_qty, added_price = EXCLUDED.added_price, updated_at = now();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION cart_remove_item(p_shop_id uuid, p_variant_id uuid)
RETURNS void AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE shop_id = p_shop_id AND status = 'open') AND variant_id = p_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION cart_clear(p_shop_id uuid)
RETURNS void AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE shop_id = p_shop_id AND status = 'open');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_cart_validated(p_shop_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('subtotal', 0, 'total', 0, 'items', '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION place_order(
    p_shop_id uuid, p_address_id uuid, p_delivery_slot_id uuid, p_payment_method text,
    p_notes text, p_discount_request text, p_idempotency_key text
) RETURNS jsonb AS $$
DECLARE
    v_order_id uuid;
    v_order_num int;
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    
    INSERT INTO orders (shop_id, user_id, address_id, delivery_slot_id, payment_method, notes, discount_request, idempotency_key)
    VALUES (p_shop_id, auth.uid(), p_address_id, p_delivery_slot_id, p_payment_method::payment_method_enum, p_notes, p_discount_request, p_idempotency_key)
    RETURNING id, order_number INTO v_order_id, v_order_num;
    
    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_num, 'total', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_available_slots(p_zone_id uuid, p_date_from date, p_date_to date)
RETURNS jsonb AS $$
BEGIN
    RETURN '[]'::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_checkout_quote(p_shop_id uuid, p_address_id uuid, p_slot_id uuid, p_payment_method text)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('total', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_order_confirmation(p_order_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('order_number', 'ORD-001', 'total', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-------------------------------------------------------------------------------
-- Seed Data (with ON CONFLICT DO NOTHING)
-------------------------------------------------------------------------------
INSERT INTO categories (name, sort_order) VALUES ('Beverages', 1) ON CONFLICT DO NOTHING;
INSERT INTO brands (name) VALUES ('Coca-Cola') ON CONFLICT DO NOTHING;
