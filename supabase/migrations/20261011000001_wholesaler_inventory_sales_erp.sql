-- Migration: Wholesaler Inventory & Sales Management ERP
-- Implements single-business beverage wholesale operations:
-- Dual-unit inventory (cartons & loose bottles), suppliers, purchases, customer register,
-- atomic sales with stock deduction, sales slips, khata/ledger, and damage/adjustments.

--------------------------------------------------------------------------------
-- 1. EXTEND PRODUCTS & PRODUCT_VARIANTS FOR WHOLESALER PACKAGING & COSTING
--------------------------------------------------------------------------------

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS packaging_type text DEFAULT 'carton',
ADD COLUMN IF NOT EXISTS barcode text,
ADD COLUMN IF NOT EXISTS supplier_notes text;

ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_sale_price numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS packaging_type text DEFAULT 'carton',
ADD COLUMN IF NOT EXISTS barcode text;

--------------------------------------------------------------------------------
-- 2. INVENTORY & STOCK MOVEMENTS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid UNIQUE NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  total_units integer NOT NULL DEFAULT 0 CHECK (total_units >= 0),
  low_stock_threshold integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('opening_stock', 'purchase', 'sale', 'damage', 'expiry', 'breakage', 'customer_return', 'adjustment')),
  change_units integer NOT NULL,
  balance_units_after integer NOT NULL CHECK (balance_units_after >= 0),
  reference_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON public.stock_movements(variant_id, created_at DESC);

-- Initialize inventory rows for all existing product variants if not present
INSERT INTO public.inventory (variant_id, total_units, low_stock_threshold)
SELECT id, 0, 24
FROM public.product_variants
ON CONFLICT (variant_id) DO NOTHING;

--------------------------------------------------------------------------------
-- 3. SUPPLIERS & PURCHASES TABLES
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  address text,
  notes text,
  balance_payable numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  invoice_no text NOT NULL,
  purchase_date date NOT NULL DEFAULT current_date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  transport_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (transport_cost >= 0),
  total_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'credit')),
  invoice_image_url text,
  notes text,
  status text NOT NULL DEFAULT 'finalized' CHECK (status IN ('draft', 'finalized', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  pieces_per_carton integer NOT NULL DEFAULT 1 CHECK (pieces_per_carton > 0),
  cartons_qty integer NOT NULL DEFAULT 0 CHECK (cartons_qty >= 0),
  loose_units_qty integer NOT NULL DEFAULT 0 CHECK (loose_units_qty >= 0),
  total_units integer NOT NULL CHECK (total_units > 0),
  cost_per_carton numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_per_carton >= 0),
  cost_per_unit numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0)
);

--------------------------------------------------------------------------------
-- 4. CUSTOMERS (RETAIL SHOPS REGISTER) TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, -- e.g. "Al-Rehman General Store"
  owner_name text,   -- Contact person
  phone text,
  address text,
  area text,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  current_balance numeric(12,2) NOT NULL DEFAULT 0, -- Outstanding balance owed
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- Seed initial customer from existing shop if present
INSERT INTO public.customers (id, name, owner_name, phone, address, area, current_balance, is_active)
SELECT id, name, owner_name, phone, address, area, 0, true
FROM public.shops
ON CONFLICT (id) DO NOTHING;

-- Also add sample frequent shop customer if empty
INSERT INTO public.customers (name, owner_name, phone, address, area, current_balance, is_active)
SELECT 'Al-Rehman General Store', 'Muhammad Rehman', '03001234567', 'Main Market, Shop #12', 'Gulberg', 0, true
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE name = 'Al-Rehman General Store');

--------------------------------------------------------------------------------
-- 5. SALES & SALE ITEMS (SALES SLIPS) TABLES
--------------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.sales_receipt_seq START 1;

CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text UNIQUE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name_snapshot text NOT NULL,
  customer_phone_snapshot text,
  sale_date timestamptz NOT NULL DEFAULT now(),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_due numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  previous_balance_snapshot numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'credit', 'partial', 'other')),
  notes text,
  status text NOT NULL DEFAULT 'finalized' CHECK (status IN ('draft', 'finalized', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON public.sales(receipt_no);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  size_label_snapshot text NOT NULL,
  packaging_type_snapshot text NOT NULL DEFAULT 'carton',
  pieces_per_carton integer NOT NULL DEFAULT 1 CHECK (pieces_per_carton > 0),
  cartons_qty integer NOT NULL DEFAULT 0 CHECK (cartons_qty >= 0),
  loose_units_qty integer NOT NULL DEFAULT 0 CHECK (loose_units_qty >= 0),
  total_units integer NOT NULL CHECK (total_units > 0),
  price_per_carton numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_per_carton >= 0),
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0 CHECK (price_per_unit >= 0),
  line_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0)
);

--------------------------------------------------------------------------------
-- 6. CUSTOMER PAYMENTS & WHOLESALER CUSTOMER LEDGER
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date timestamptz NOT NULL DEFAULT now(),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'other')),
  reference_no text,
  proof_image_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wholesaler_customer_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('opening_balance', 'sale', 'payment', 'return', 'adjustment')),
  reference_id text,
  debit numeric(12,2) NOT NULL DEFAULT 0,   -- Increases debt (sale)
  credit numeric(12,2) NOT NULL DEFAULT 0,  -- Decreases debt (payment)
  running_balance numeric(12,2) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wholesaler_customer_ledger ON public.wholesaler_customer_ledger(customer_id, created_at ASC);

--------------------------------------------------------------------------------
-- 7. STOCK ADJUSTMENTS & DAMAGE TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('damage', 'expiry', 'breakage', 'count_correction', 'return')),
  units_delta integer NOT NULL, -- negative for damage/expiry, positive or negative for count correction
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (Allow Wholesaler Owner Access)
--------------------------------------------------------------------------------

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesaler_customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full operations, and anon read for development/local tests
CREATE POLICY "Wholesaler full access inventory" ON public.inventory FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access stock_movements" ON public.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access suppliers" ON public.suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access purchases" ON public.purchases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access purchase_items" ON public.purchase_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access customers" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access sale_items" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access customer_payments" ON public.customer_payments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access customer_ledger" ON public.wholesaler_customer_ledger FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Wholesaler full access stock_adjustments" ON public.stock_adjustments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 9. ATOMIC RPC: GET INVENTORY (With Cartons + Loose Bottles Conversion)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wholesaler_get_inventory(p_search text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_res jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT 
      pv.id AS variant_id,
      p.id AS product_id,
      p.name AS product_name,
      coalesce(b.name, 'Cold Drinks') AS brand_name,
      coalesce(c.name, 'Beverages') AS category_name,
      coalesce(pv.image_url, p.image_url) AS image_url,
      coalesce(pv.size_label, 'Regular') AS size_label,
      coalesce(pv.packaging_type, p.packaging_type, 'carton') AS packaging_type,
      greatest(coalesce(pv.pieces_per_unit, 1), 1) AS pieces_per_carton,
      coalesce(pv.price, 0) AS price_per_carton,
      coalesce(pv.unit_sale_price, round(coalesce(pv.price, 0) / greatest(coalesce(pv.pieces_per_unit, 1), 1), 2)) AS price_per_unit,
      coalesce(pv.cost_price, 0) AS cost_per_carton,
      round(coalesce(pv.cost_price, 0) / greatest(coalesce(pv.pieces_per_unit, 1), 1), 2) AS cost_per_unit,
      coalesce(i.total_units, 0) AS total_units,
      floor(coalesce(i.total_units, 0) / greatest(coalesce(pv.pieces_per_unit, 1), 1))::int AS available_cartons,
      (coalesce(i.total_units, 0) % greatest(coalesce(pv.pieces_per_unit, 1), 1))::int AS available_loose_units,
      coalesce(i.low_stock_threshold, 24) AS low_stock_threshold,
      (coalesce(i.total_units, 0) <= coalesce(i.low_stock_threshold, 24)) AS is_low_stock,
      (coalesce(i.total_units, 0) = 0) AS is_out_of_stock,
      round((coalesce(i.total_units, 0) * (coalesce(pv.cost_price, 0) / greatest(coalesce(pv.pieces_per_unit, 1), 1))), 2) AS stock_value
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.inventory i ON i.variant_id = pv.id
    WHERE p.is_active = true AND pv.is_active = true
      AND (
        p_search IS NULL 
        OR p_search = '' 
        OR p.name ILIKE '%' || p_search || '%' 
        OR coalesce(b.name, '') ILIKE '%' || p_search || '%'
        OR coalesce(pv.barcode, '') ILIKE '%' || p_search || '%'
      )
    ORDER BY b.sort_order ASC, p.name ASC
  ) t;

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 10. ATOMIC RPC: RECORD OPENING STOCK OR ADJUSTMENT
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wholesaler_record_stock_adjustment(
  p_variant_id uuid,
  p_type text,
  p_units_delta integer,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_current_units int;
  v_new_units int;
BEGIN
  -- Lock inventory row
  SELECT coalesce(total_units, 0) INTO v_current_units
  FROM public.inventory
  WHERE variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (variant_id, total_units)
    VALUES (p_variant_id, 0)
    RETURNING total_units INTO v_current_units;
  END IF;

  v_new_units := v_current_units + p_units_delta;
  IF v_new_units < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Adjustment would result in negative inventory (% units available, delta %)', v_current_units, p_units_delta;
  END IF;

  UPDATE public.inventory
  SET total_units = v_new_units, updated_at = now()
  WHERE variant_id = p_variant_id;

  INSERT INTO public.stock_movements (
    variant_id, movement_type, change_units, balance_units_after, reason
  ) VALUES (
    p_variant_id, p_type, p_units_delta, v_new_units, p_reason
  );

  INSERT INTO public.stock_adjustments (
    variant_id, adjustment_type, units_delta, reason, notes
  ) VALUES (
    p_variant_id, p_type, p_units_delta, p_reason, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'variant_id', p_variant_id,
    'previous_units', v_current_units,
    'new_units', v_new_units,
    'delta', p_units_delta
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 11. ATOMIC RPC: FINALIZE SUPPLIER PURCHASE
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wholesaler_finalize_purchase(
  p_supplier_id uuid,
  p_invoice_no text,
  p_purchase_date date,
  p_transport_cost numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_purchase_id uuid;
  v_subtotal numeric := 0;
  v_total_cost numeric := 0;
  v_balance_amount numeric := 0;
  v_item jsonb;
  v_var_id uuid;
  v_cartons int;
  v_loose int;
  v_pieces int;
  v_total_units int;
  v_cost_carton numeric;
  v_cost_unit numeric;
  v_line_subtotal numeric;
  v_name text;
  v_cur_stock int;
  v_new_stock int;
BEGIN
  -- 1. Create Purchase Record
  INSERT INTO public.purchases (
    supplier_id, invoice_no, purchase_date, subtotal, transport_cost, total_cost, paid_amount, balance_amount, payment_method, notes, status
  ) VALUES (
    p_supplier_id, p_invoice_no, p_purchase_date, 0, p_transport_cost, 0, p_paid_amount, 0, p_payment_method, p_notes, 'finalized'
  ) RETURNING id INTO v_purchase_id;

  -- 2. Process Purchase Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_var_id := (v_item->>'variant_id')::uuid;
    v_cartons := coalesce((v_item->>'cartons_qty')::int, 0);
    v_loose := coalesce((v_item->>'loose_units_qty')::int, 0);
    v_cost_carton := coalesce((v_item->>'cost_per_carton')::numeric, 0);

    -- Get variant pieces
    SELECT pv.pieces_per_unit, p.name 
    INTO v_pieces, v_name
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_var_id;

    v_pieces := greatest(coalesce(v_pieces, 1), 1);
    v_total_units := (v_cartons * v_pieces) + v_loose;
    v_cost_unit := round(v_cost_carton / v_pieces, 2);
    v_line_subtotal := round((v_cartons * v_cost_carton) + (v_loose * v_cost_unit), 2);
    v_subtotal := v_subtotal + v_line_subtotal;

    -- Insert purchase item
    INSERT INTO public.purchase_items (
      purchase_id, variant_id, product_name_snapshot, pieces_per_carton,
      cartons_qty, loose_units_qty, total_units, cost_per_carton, cost_per_unit, subtotal
    ) VALUES (
      v_purchase_id, v_var_id, v_name, v_pieces,
      v_cartons, v_loose, v_total_units, v_cost_carton, v_cost_unit, v_line_subtotal
    );

    -- Atomically increase inventory
    SELECT coalesce(total_units, 0) INTO v_cur_stock
    FROM public.inventory WHERE variant_id = v_var_id FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.inventory (variant_id, total_units) VALUES (v_var_id, 0);
      v_cur_stock := 0;
    END IF;

    v_new_stock := v_cur_stock + v_total_units;
    UPDATE public.inventory SET total_units = v_new_stock, updated_at = now() WHERE variant_id = v_var_id;

    -- Update variant cost price
    IF v_cost_carton > 0 THEN
      UPDATE public.product_variants SET cost_price = v_cost_carton WHERE id = v_var_id;
    END IF;

    -- Record movement audit
    INSERT INTO public.stock_movements (
      variant_id, movement_type, change_units, balance_units_after, reference_id, reason
    ) VALUES (
      v_var_id, 'purchase', v_total_units, v_new_stock, v_purchase_id::text, 'Purchase invoice ' || p_invoice_no
    );
  END LOOP;

  -- 3. Finalize Totals & Supplier Balance
  v_total_cost := v_subtotal + coalesce(p_transport_cost, 0);
  v_balance_amount := v_total_cost - coalesce(p_paid_amount, 0);

  UPDATE public.purchases
  SET subtotal = v_subtotal, total_cost = v_total_cost, balance_amount = v_balance_amount
  WHERE id = v_purchase_id;

  -- If unpaid balance, update supplier balance payable
  IF v_balance_amount > 0 THEN
    UPDATE public.suppliers
    SET balance_payable = balance_payable + v_balance_amount, updated_at = now()
    WHERE id = p_supplier_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'invoice_no', p_invoice_no,
    'total_cost', v_total_cost,
    'paid_amount', p_paid_amount,
    'balance_amount', v_balance_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 12. ATOMIC RPC: FINALIZE SALE (Stock Validation, Deduction & Slip Generation)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wholesaler_finalize_sale(
  p_customer_id uuid,
  p_sale_date timestamptz,
  p_discount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_notes text,
  p_items jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_sale_id uuid;
  v_receipt_no text;
  v_customer_name text;
  v_customer_phone text;
  v_prev_balance numeric := 0;
  v_new_cust_balance numeric := 0;
  v_subtotal numeric := 0;
  v_total_amount numeric := 0;
  v_balance_due numeric := 0;
  v_item jsonb;
  v_var_id uuid;
  v_cartons int;
  v_loose int;
  v_pieces int;
  v_total_units int;
  v_price_carton numeric;
  v_price_unit numeric;
  v_line_total numeric;
  v_prod_name text;
  v_size_label text;
  v_packaging text;
  v_cur_stock int;
  v_new_stock int;
  v_seq_val bigint;
BEGIN
  -- 1. Validate customer
  IF p_customer_id IS NOT NULL THEN
    SELECT name, phone, current_balance 
    INTO v_customer_name, v_customer_phone, v_prev_balance
    FROM public.customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: Customer ID % does not exist', p_customer_id;
    END IF;
  ELSE
    v_customer_name := 'Counter Cash Customer';
    v_customer_phone := NULL;
    v_prev_balance := 0;
  END IF;

  -- 2. Pre-validate stock for ALL items before making any modifications
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_var_id := (v_item->>'variant_id')::uuid;
    v_cartons := coalesce((v_item->>'cartons_qty')::int, 0);
    v_loose := coalesce((v_item->>'loose_units_qty')::int, 0);

    SELECT pv.pieces_per_unit, p.name
    INTO v_pieces, v_prod_name
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_var_id;

    v_pieces := greatest(coalesce(v_pieces, 1), 1);
    v_total_units := (v_cartons * v_pieces) + v_loose;

    SELECT coalesce(total_units, 0) INTO v_cur_stock
    FROM public.inventory
    WHERE variant_id = v_var_id
    FOR UPDATE;

    IF v_cur_stock IS NULL OR v_cur_stock < v_total_units THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: % has only % units available (requested %)', v_prod_name, coalesce(v_cur_stock, 0), v_total_units;
    END IF;
  END LOOP;

  -- 3. Generate Sequential Receipt Number
  SELECT nextval('public.sales_receipt_seq') INTO v_seq_val;
  v_receipt_no := 'SLIP-' || to_char(coalesce(p_sale_date, now()), 'YYYY') || '-' || lpad(v_seq_val::text, 5, '0');

  -- 4. Calculate Subtotal and Create Sale Record
  INSERT INTO public.sales (
    receipt_no, customer_id, customer_name_snapshot, customer_phone_snapshot,
    sale_date, subtotal, discount, total_amount, paid_amount, balance_due,
    previous_balance_snapshot, payment_method, notes, status
  ) VALUES (
    v_receipt_no, p_customer_id, v_customer_name, v_customer_phone,
    coalesce(p_sale_date, now()), 0, coalesce(p_discount, 0), 0, coalesce(p_paid_amount, 0), 0,
    v_prev_balance, p_payment_method, p_notes, 'finalized'
  ) RETURNING id INTO v_sale_id;

  -- 5. Insert Items, Deduct Inventory, Record Movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_var_id := (v_item->>'variant_id')::uuid;
    v_cartons := coalesce((v_item->>'cartons_qty')::int, 0);
    v_loose := coalesce((v_item->>'loose_units_qty')::int, 0);
    v_price_carton := coalesce((v_item->>'price_per_carton')::numeric, 0);

    SELECT pv.pieces_per_unit, p.name, pv.size_label, coalesce(pv.packaging_type, p.packaging_type, 'carton'), pv.unit_sale_price
    INTO v_pieces, v_prod_name, v_size_label, v_packaging, v_price_unit
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.id = v_var_id;

    v_pieces := greatest(coalesce(v_pieces, 1), 1);
    v_total_units := (v_cartons * v_pieces) + v_loose;

    -- If price_per_unit not specified on line item, derive from carton price
    IF v_item->>'price_per_unit' IS NOT NULL THEN
      v_price_unit := (v_item->>'price_per_unit')::numeric;
    ELSE
      v_price_unit := round(v_price_carton / v_pieces, 2);
    END IF;

    v_line_total := round((v_cartons * v_price_carton) + (v_loose * v_price_unit), 2);
    v_subtotal := v_subtotal + v_line_total;

    -- Insert sale item
    INSERT INTO public.sale_items (
      sale_id, variant_id, product_name_snapshot, size_label_snapshot, packaging_type_snapshot,
      pieces_per_carton, cartons_qty, loose_units_qty, total_units,
      price_per_carton, price_per_unit, line_total
    ) VALUES (
      v_sale_id, v_var_id, v_prod_name, coalesce(v_size_label, 'Regular'), v_packaging,
      v_pieces, v_cartons, v_loose, v_total_units,
      v_price_carton, v_price_unit, v_line_total
    );

    -- Deduct stock
    SELECT total_units INTO v_cur_stock FROM public.inventory WHERE variant_id = v_var_id FOR UPDATE;
    v_new_stock := v_cur_stock - v_total_units;
    UPDATE public.inventory SET total_units = v_new_stock, updated_at = now() WHERE variant_id = v_var_id;

    -- Stock movement audit
    INSERT INTO public.stock_movements (
      variant_id, movement_type, change_units, balance_units_after, reference_id, reason
    ) VALUES (
      v_var_id, 'sale', -v_total_units, v_new_stock, v_sale_id::text, 'Sale slip ' || v_receipt_no
    );
  END LOOP;

  -- 6. Finalize Sale Totals
  v_total_amount := greatest(v_subtotal - coalesce(p_discount, 0), 0);
  v_balance_due := greatest(v_total_amount - coalesce(p_paid_amount, 0), 0);

  UPDATE public.sales
  SET subtotal = v_subtotal, total_amount = v_total_amount, balance_due = v_balance_due
  WHERE id = v_sale_id;

  -- 7. Update Customer Khata & Record Ledger
  IF p_customer_id IS NOT NULL THEN
    v_new_cust_balance := v_prev_balance + v_balance_due;
    UPDATE public.customers SET current_balance = v_new_cust_balance, updated_at = now() WHERE id = p_customer_id;

    -- Debit entry for sale
    INSERT INTO public.wholesaler_customer_ledger (
      customer_id, entry_type, reference_id, debit, credit, running_balance, description
    ) VALUES (
      p_customer_id, 'sale', v_sale_id::text, v_total_amount, 0, v_prev_balance + v_total_amount, 'Sales Slip ' || v_receipt_no
    );

    -- Credit entry if paid anything immediately
    IF coalesce(p_paid_amount, 0) > 0 THEN
      INSERT INTO public.wholesaler_customer_ledger (
        customer_id, entry_type, reference_id, debit, credit, running_balance, description
      ) VALUES (
        p_customer_id, 'payment', v_sale_id::text, 0, p_paid_amount, v_new_cust_balance, 'Payment at sale ' || v_receipt_no
      );

      INSERT INTO public.customer_payments (
        customer_id, sale_id, amount, payment_date, payment_method, notes
      ) VALUES (
        p_customer_id, v_sale_id, p_paid_amount, coalesce(p_sale_date, now()), p_payment_method, 'Payment for ' || v_receipt_no
      );
    END IF;
  END IF;

  -- 8. Return complete receipt payload
  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'receipt_no', v_receipt_no,
    'customer_name', v_customer_name,
    'customer_phone', v_customer_phone,
    'sale_date', coalesce(p_sale_date, now()),
    'subtotal', v_subtotal,
    'discount', coalesce(p_discount, 0),
    'total_amount', v_total_amount,
    'paid_amount', coalesce(p_paid_amount, 0),
    'balance_due', v_balance_due,
    'previous_balance', v_prev_balance,
    'current_total_balance', v_new_cust_balance,
    'payment_method', p_payment_method,
    'notes', p_notes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 13. ATOMIC RPC: RECORD CUSTOMER PAYMENT (KHATA RECOVERY)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wholesaler_record_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_cur_bal numeric;
  v_new_bal numeric;
  v_pay_id uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be greater than zero';
  END IF;

  SELECT current_balance INTO v_cur_bal
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: Customer ID % does not exist', p_customer_id;
  END IF;

  v_new_bal := v_cur_bal - p_amount;
  UPDATE public.customers SET current_balance = v_new_bal, updated_at = now() WHERE id = p_customer_id;

  INSERT INTO public.customer_payments (
    customer_id, amount, payment_date, payment_method, reference_no, notes
  ) VALUES (
    p_customer_id, p_amount, now(), p_payment_method, p_reference_no, p_notes
  ) RETURNING id INTO v_pay_id;

  INSERT INTO public.wholesaler_customer_ledger (
    customer_id, entry_type, reference_id, debit, credit, running_balance, description
  ) VALUES (
    p_customer_id, 'payment', v_pay_id::text, 0, p_amount, v_new_bal, 'Payment received (' || p_payment_method || ')'
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_pay_id,
    'previous_balance', v_cur_bal,
    'amount_paid', p_amount,
    'new_balance', v_new_bal
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 14. ATOMIC RPC: DASHBOARD METRICS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wholesaler_get_dashboard_metrics()
RETURNS jsonb AS $$
DECLARE
  v_res jsonb;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Karachi');
BEGIN
  v_res := jsonb_build_object(
    'total_active_products', (SELECT count(*) FROM public.products WHERE is_active = true),
    'total_variants', (SELECT count(*) FROM public.product_variants WHERE is_active = true),
    'low_stock_count', (
      SELECT count(*) FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      WHERE i.total_units > 0 AND i.total_units <= i.low_stock_threshold
    ),
    'out_of_stock_count', (
      SELECT count(*) FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      WHERE i.total_units = 0
    ),
    'total_stock_value', coalesce((
      SELECT round(sum(i.total_units * (pv.cost_price / greatest(pv.pieces_per_unit, 1))), 2)
      FROM public.inventory i
      JOIN public.product_variants pv ON pv.id = i.variant_id
    ), 0),
    'today_sales_count', (
      SELECT count(*) FROM public.sales
      WHERE sale_date >= v_today_start AND status = 'finalized'
    ),
    'today_sales_amount', coalesce((
      SELECT sum(total_amount) FROM public.sales
      WHERE sale_date >= v_today_start AND status = 'finalized'
    ), 0),
    'today_cash_collected', coalesce((
      SELECT sum(amount) FROM public.customer_payments
      WHERE payment_date >= v_today_start
    ), 0),
    'today_credit_sales', coalesce((
      SELECT sum(balance_due) FROM public.sales
      WHERE sale_date >= v_today_start AND status = 'finalized'
    ), 0),
    'total_customer_receivables', coalesce((
      SELECT sum(current_balance) FROM public.customers WHERE current_balance > 0
    ), 0),
    'total_supplier_payables', coalesce((
      SELECT sum(balance_payable) FROM public.suppliers WHERE balance_payable > 0
    ), 0)
  );

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
