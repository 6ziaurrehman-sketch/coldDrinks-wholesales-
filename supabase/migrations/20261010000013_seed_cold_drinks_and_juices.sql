-- Migration: Seed Cold Drinks and Juices Catalog Products & RPCs
-- Adds variant details, categories, brands, products, variants, and full catalog RPC implementations

--------------------------------------------------------------------------------
-- 1. ADD COLUMNS TO PRODUCT_VARIANTS
--------------------------------------------------------------------------------
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS variant_name text,
ADD COLUMN IF NOT EXISTS size_label text,
ADD COLUMN IF NOT EXISTS image_url text;

--------------------------------------------------------------------------------
-- 2. CATEGORIES SEED
--------------------------------------------------------------------------------
INSERT INTO public.categories (id, name, sort_order, icon_name, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Cold Drinks', 1, 'water-outline', true),
  ('c0000000-0000-0000-0000-000000000002', 'Juices', 2, 'nutrition-outline', true),
  ('c0000000-0000-0000-0000-000000000003', 'Energy Drinks', 3, 'flash-outline', true)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  icon_name = EXCLUDED.icon_name,
  is_active = EXCLUDED.is_active;

--------------------------------------------------------------------------------
-- 3. BRANDS SEED
--------------------------------------------------------------------------------
INSERT INTO public.brands (id, name, logo_url, sort_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000001', '7Up', '/images/7up/1.5l.png', 1, true),
  ('b0000000-0000-0000-0000-000000000002', 'Coca-Cola', '/images/cocalCola/1.5l.png', 2, true),
  ('b0000000-0000-0000-0000-000000000003', 'Mountain Dew', '/images/dew/1.5l.png', 3, true),
  ('b0000000-0000-0000-0000-000000000004', 'Fanta', '/images/fanta/1.5l.png', 4, true),
  ('b0000000-0000-0000-0000-000000000005', 'Fizup', '/images/fiza/1.5l.png', 5, true),
  ('b0000000-0000-0000-0000-000000000006', 'Gourmet', '/images/gourmetCola/1.5l.png', 6, true),
  ('b0000000-0000-0000-0000-000000000007', 'Next Cola', '/images/next/1.5l.png', 7, true),
  ('b0000000-0000-0000-0000-000000000008', 'Pepsi', '/images/pepsi/1.5l.png', 8, true),
  ('b0000000-0000-0000-0000-000000000009', 'Sprite', '/images/sprit/1.5l.png', 9, true),
  ('b0000000-0000-0000-0000-000000000010', 'Nestle', '/images/nestle.png', 10, true),
  ('b0000000-0000-0000-0000-000000000011', 'Slice', '/images/slice.png', 11, true),
  ('b0000000-0000-0000-0000-000000000012', 'Smiley', '/images/smily.png', 12, true),
  ('b0000000-0000-0000-0000-000000000013', 'Sting', '/images/sting.png', 13, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  logo_url = EXCLUDED.logo_url,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

--------------------------------------------------------------------------------
-- 4. PRODUCTS & VARIANTS SEED
--------------------------------------------------------------------------------

-- Helper macro function to upsert product and its variants
CREATE OR REPLACE FUNCTION _seed_product_and_variant(
  p_prod_id uuid,
  p_brand_id uuid,
  p_name text,
  p_sku text,
  p_cat_id uuid,
  p_img text,
  p_desc text,
  p_var_id uuid,
  p_sale_unit sale_unit_enum,
  p_pieces int,
  p_price numeric,
  p_min int,
  p_max int,
  p_mult int,
  p_size text
) RETURNS void AS $$
BEGIN
  INSERT INTO public.products (id, brand_id, name, sku, category_id, image_url, description, is_active)
  VALUES (p_prod_id, p_brand_id, p_name, p_sku, p_cat_id, p_img, p_desc, true)
  ON CONFLICT (sku) DO UPDATE SET
    brand_id = EXCLUDED.brand_id,
    name = EXCLUDED.name,
    category_id = EXCLUDED.category_id,
    image_url = EXCLUDED.image_url,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

  INSERT INTO public.product_variants (
    id, product_id, sale_unit, pieces_per_unit, price, min_qty, max_qty, qty_multiple, is_active, stock_status, variant_name, size_label, image_url
  )
  VALUES (
    p_var_id, p_prod_id, p_sale_unit, p_pieces, p_price, p_min, p_max, p_mult, true, 'in_stock'::stock_status_enum, p_size, p_size, p_img
  )
  ON CONFLICT (id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    sale_unit = EXCLUDED.sale_unit,
    pieces_per_unit = EXCLUDED.pieces_per_unit,
    price = EXCLUDED.price,
    min_qty = EXCLUDED.min_qty,
    max_qty = EXCLUDED.max_qty,
    qty_multiple = EXCLUDED.qty_multiple,
    is_active = EXCLUDED.is_active,
    variant_name = EXCLUDED.variant_name,
    size_label = EXCLUDED.size_label,
    image_url = EXCLUDED.image_url;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- 7UP
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '7Up 300ml', '7UP-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/7up/300ml.png', '7Up 300ml Can / Regular Bottle', '20000000-0000-0000-0000-000000000001', 'carton', 24, 1800, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '7Up 500ml', '7UP-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/7up/500ml.png', '7Up 500ml PET Bottle', '20000000-0000-0000-0000-000000000002', 'pack', 12, 1200, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '7Up 1L', '7UP-1L', 'c0000000-0000-0000-0000-000000000001', '/images/7up/1l.png', '7Up 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000003', 'pack', 6, 850, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', '7Up 1.5L', '7UP-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/7up/1.5l.png', '7Up 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000004', 'pack', 6, 1100, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', '7Up 2.5L', '7UP-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/7up/2.5l.png', '7Up 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000005', 'pack', 6, 1450, 1, 500, 1, '2.5L');

  -- COCA-COLA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 300ml', 'COKE-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/300ml.png', 'Coca-Cola 300ml Can / Regular', '20000000-0000-0000-0000-000000000006', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 500ml', 'COKE-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/500ml.png', 'Coca-Cola 500ml PET Bottle', '20000000-0000-0000-0000-000000000007', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 1L', 'COKE-1L', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/1l.png', 'Coca-Cola 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000008', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 1.5L', 'COKE-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/1.5l.png', 'Coca-Cola 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000009', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 2.5L', 'COKE-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/2.5l.png', 'Coca-Cola 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000010', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- MOUNTAIN DEW
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 300ml', 'DEW-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/dew/300ml.png', 'Mountain Dew 300ml Can / Regular', '20000000-0000-0000-0000-000000000011', 'carton', 24, 1800, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 500ml', 'DEW-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/dew/500ml.png', 'Mountain Dew 500ml PET Bottle', '20000000-0000-0000-0000-000000000012', 'pack', 12, 1200, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 1L', 'DEW-1L', 'c0000000-0000-0000-0000-000000000001', '/images/dew/1l.png', 'Mountain Dew 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000013', 'pack', 6, 850, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 1.5L', 'DEW-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/dew/1.5l.png', 'Mountain Dew 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000014', 'pack', 6, 1100, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000015', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 2.5L', 'DEW-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/dew/2.5l.png', 'Mountain Dew 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000015', 'pack', 6, 1450, 1, 500, 1, '2.5L');

  -- FANTA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000016', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 300ml', 'FANTA-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/300ml.png', 'Fanta Orange 300ml Can / Regular', '20000000-0000-0000-0000-000000000016', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000017', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 500ml', 'FANTA-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/500ml.png', 'Fanta Orange 500ml PET Bottle', '20000000-0000-0000-0000-000000000017', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000018', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 1L', 'FANTA-1L', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/1l.png', 'Fanta Orange 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000018', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000019', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 1.5L', 'FANTA-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/1.5l.png', 'Fanta Orange 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000019', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 2.5L', 'FANTA-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/2.5l.png', 'Fanta Orange 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000020', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- FIZUP / FIZA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000005', 'Fizup 300ml', 'FIZA-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/300ml.png', 'Fizup 300ml Can / Regular', '20000000-0000-0000-0000-000000000021', 'carton', 24, 1400, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000005', 'Fizup 500ml', 'FIZA-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/500ml.png', 'Fizup 500ml PET Bottle', '20000000-0000-0000-0000-000000000022', 'pack', 12, 950, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000005', 'Fizup 1L', 'FIZA-1L', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/1l.png', 'Fizup 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000023', 'pack', 6, 700, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000024', 'b0000000-0000-0000-0000-000000000005', 'Fizup 1.5L', 'FIZA-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/1.5l.png', 'Fizup 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000024', 'pack', 6, 900, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000025', 'b0000000-0000-0000-0000-000000000005', 'Fizup 2.5L', 'FIZA-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/2.5l.png', 'Fizup 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000025', 'pack', 6, 1200, 1, 500, 1, '2.5L');

  -- GOURMET COLA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000026', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 300ml', 'GOURMET-COLA-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/300ml.png', 'Gourmet Cola 300ml Can / Regular', '20000000-0000-0000-0000-000000000026', 'carton', 24, 1350, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000027', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 500ml', 'GOURMET-COLA-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/500ml.png', 'Gourmet Cola 500ml PET Bottle', '20000000-0000-0000-0000-000000000027', 'pack', 12, 900, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000028', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 1L', 'GOURMET-COLA-1L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/1l.png', 'Gourmet Cola 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000028', 'pack', 6, 680, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000029', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 1.5L', 'GOURMET-COLA-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/1.5l.png', 'Gourmet Cola 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000029', 'pack', 6, 870, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 2.5L', 'GOURMET-COLA-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/2.5l.png', 'Gourmet Cola 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000030', 'pack', 6, 1150, 1, 500, 1, '2.5L');

  -- GOURMET ORANGE
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000031', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 300ml', 'GOURMET-ORANGE-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/300ml.png', 'Gourmet Orange 300ml Can / Regular', '20000000-0000-0000-0000-000000000031', 'carton', 24, 1350, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000032', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 500ml', 'GOURMET-ORANGE-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/500ml.png', 'Gourmet Orange 500ml PET Bottle', '20000000-0000-0000-0000-000000000032', 'pack', 12, 900, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000033', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 1.5L', 'GOURMET-ORANGE-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/1.5l.png', 'Gourmet Orange 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000033', 'pack', 6, 870, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000034', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 2.5L', 'GOURMET-ORANGE-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/2.5l.png', 'Gourmet Orange 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000034', 'pack', 6, 1150, 1, 500, 1, '2.5L');

  -- GOURMET LEMON UP / SPRIT
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000035', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 300ml', 'GOURMET-SPRIT-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/300ml.png', 'Gourmet Lemon Up 300ml Can / Regular', '20000000-0000-0000-0000-000000000035', 'carton', 24, 1350, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000036', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 500ml', 'GOURMET-SPRIT-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/500ml.png', 'Gourmet Lemon Up 500ml PET Bottle', '20000000-0000-0000-0000-000000000036', 'pack', 12, 900, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000037', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 1L', 'GOURMET-SPRIT-1L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/1l.png', 'Gourmet Lemon Up 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000037', 'pack', 6, 680, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000038', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 1.5L', 'GOURMET-SPRIT-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/1.5l.png', 'Gourmet Lemon Up 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000038', 'pack', 6, 870, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000039', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 2.5L', 'GOURMET-SPRIT-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/2.5l.png', 'Gourmet Lemon Up 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000039', 'pack', 6, 1150, 1, 500, 1, '2.5L');

  -- NEXT COLA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 300ml', 'NEXT-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/next/300ml.png', 'Next Cola 300ml Can / Regular', '20000000-0000-0000-0000-000000000040', 'carton', 24, 1500, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 500ml', 'NEXT-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/next/500ml.png', 'Next Cola 500ml PET Bottle', '20000000-0000-0000-0000-000000000041', 'pack', 12, 1050, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000042', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 1L', 'NEXT-1L', 'c0000000-0000-0000-0000-000000000001', '/images/next/1l.png', 'Next Cola 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000042', 'pack', 6, 750, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 1.5L', 'NEXT-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/next/1.5l.png', 'Next Cola 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000043', 'pack', 6, 980, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000044', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 2.5L', 'NEXT-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/next/2.5l.png', 'Next Cola 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000044', 'pack', 6, 1300, 1, 500, 1, '2.5L');

  -- PEPSI
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000045', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 300ml', 'PEPSI-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/300ml.png', 'Pepsi 300ml Can / Regular', '20000000-0000-0000-0000-000000000045', 'carton', 24, 1800, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000046', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 500ml', 'PEPSI-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/500ml.png', 'Pepsi 500ml PET Bottle', '20000000-0000-0000-0000-000000000046', 'pack', 12, 1200, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000047', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 1L', 'PEPSI-1L', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/1l.png', 'Pepsi 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000047', 'pack', 6, 850, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000048', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 1.5L', 'PEPSI-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/1.5l.png', 'Pepsi 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000048', 'pack', 6, 1100, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000049', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 2.5L', 'PEPSI-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/2.5l.png', 'Pepsi 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000049', 'pack', 6, 1450, 1, 500, 1, '2.5L');

  -- RANGO NEXT (ORANGE)
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000050', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 300ml', 'RANGO-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/300ml.png', 'Rango Next Orange 300ml Can / Regular', '20000000-0000-0000-0000-000000000050', 'carton', 24, 1500, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 500ml', 'RANGO-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/500ml.png', 'Rango Next Orange 500ml PET Bottle', '20000000-0000-0000-0000-000000000051', 'pack', 12, 1050, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 1L', 'RANGO-1L', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/1l.png', 'Rango Next Orange 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000052', 'pack', 6, 750, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000053', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 1.5L', 'RANGO-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/1.5l.png', 'Rango Next Orange 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000053', 'pack', 6, 980, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000054', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 2.5L', 'RANGO-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/2.5l.png', 'Rango Next Orange 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000054', 'pack', 6, 1300, 1, 500, 1, '2.5L');

  -- SPRITE
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000055', 'b0000000-0000-0000-0000-000000000009', 'Sprite 300ml', 'SPRITE-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/300ml.png', 'Sprite 300ml Can / Regular', '20000000-0000-0000-0000-000000000055', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000056', 'b0000000-0000-0000-0000-000000000009', 'Sprite 500ml', 'SPRITE-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/500ml.png', 'Sprite 500ml PET Bottle', '20000000-0000-0000-0000-000000000056', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000057', 'b0000000-0000-0000-0000-000000000009', 'Sprite 1L', 'SPRITE-1L', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/1l.png', 'Sprite 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000057', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000058', 'b0000000-0000-0000-0000-000000000009', 'Sprite 1.5L', 'SPRITE-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/1.5l.png', 'Sprite 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000058', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000059', 'b0000000-0000-0000-0000-000000000009', 'Sprite 2.5L', 'SPRITE-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/2.5l.png', 'Sprite 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000059', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- SPRITE MINT
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000060', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 300ml', 'SPRITE-MINT-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/300ml.png', 'Sprite Mint 300ml Can / Regular', '20000000-0000-0000-0000-000000000060', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000061', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 500ml', 'SPRITE-MINT-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/500ml.png', 'Sprite Mint 500ml PET Bottle', '20000000-0000-0000-0000-000000000061', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000062', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 1L', 'SPRITE-MINT-1L', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/1l.png', 'Sprite Mint 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000062', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000063', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 1.5L', 'SPRITE-MINT-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/1.5l.png', 'Sprite Mint 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000063', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000064', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 2.5L', 'SPRITE-MINT-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/2.5l.png', 'Sprite Mint 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000064', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- JUICES: NESTLÉ FRUITA VITALS
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000065', 'b0000000-0000-0000-0000-000000000010', 'Nestlé Fruita Vitals 1L', 'NESTLE-1L', 'c0000000-0000-0000-0000-000000000002', '/images/nestle.png', 'Nestlé Fruita Vitals Premium 1 Litre Nectar', '20000000-0000-0000-0000-000000000065', 'carton', 12, 3400, 1, 200, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000066', 'b0000000-0000-0000-0000-000000000010', 'Nestlé Fruita Vitals 200ml', 'NESTLE-200ML', 'c0000000-0000-0000-0000-000000000002', '/images/nestle.png', 'Nestlé Fruita Vitals 200ml Tetra Pack', '20000000-0000-0000-0000-000000000066', 'carton', 24, 2150, 1, 200, 1, '200ml');

  -- JUICES: SLICE MANGO
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000067', 'b0000000-0000-0000-0000-000000000011', 'Slice Mango 1L', 'SLICE-1L', 'c0000000-0000-0000-0000-000000000002', '/images/slice.png', 'Slice Mango Drink 1 Litre Bottle', '20000000-0000-0000-0000-000000000067', 'carton', 12, 3200, 1, 200, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000068', 'b0000000-0000-0000-0000-000000000011', 'Slice Mango 250ml', 'SLICE-250ML', 'c0000000-0000-0000-0000-000000000002', '/images/slice.png', 'Slice Mango Drink 250ml Tetra Pack', '20000000-0000-0000-0000-000000000068', 'carton', 24, 1950, 1, 200, 1, '250ml');

  -- JUICES: SMILEY JUICE
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000069', 'b0000000-0000-0000-0000-000000000012', 'Smiley Juice 1L', 'SMILY-1L', 'c0000000-0000-0000-0000-000000000002', '/images/smily.png', 'Smiley Natural Fruit Juice 1 Litre Pack', '20000000-0000-0000-0000-000000000069', 'carton', 12, 2600, 1, 200, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000070', 'b0000000-0000-0000-0000-000000000012', 'Smiley Juice 250ml', 'SMILY-250ML', 'c0000000-0000-0000-0000-000000000002', '/images/smily.png', 'Smiley Fruit Juice 250ml Pack', '20000000-0000-0000-0000-000000000070', 'carton', 24, 1600, 1, 200, 1, '250ml');

  -- ENERGY DRINK: STING
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000071', 'b0000000-0000-0000-0000-000000000013', 'Sting Berry Blast 300ml', 'STING-300ML', 'c0000000-0000-0000-0000-000000000003', '/images/sting.png', 'Sting Energy Drink Berry Blast 300ml Can', '20000000-0000-0000-0000-000000000071', 'carton', 24, 2200, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000072', 'b0000000-0000-0000-0000-000000000013', 'Sting Berry Blast 500ml', 'STING-500ML', 'c0000000-0000-0000-0000-000000000003', '/images/sting.png', 'Sting Energy Drink Red 500ml PET Bottle', '20000000-0000-0000-0000-000000000072', 'pack', 12, 1350, 1, 500, 1, '500ml');
END;
$$;

DROP FUNCTION IF EXISTS _seed_product_and_variant;

--------------------------------------------------------------------------------
-- 5. RPC IMPLEMENTATIONS (CATALOG, PRODUCT DETAIL, HOME FEED)
--------------------------------------------------------------------------------

-- catalog_for_shop
DROP FUNCTION IF EXISTS public.catalog_for_shop(uuid, text, uuid, uuid, text, text, uuid, integer);
CREATE OR REPLACE FUNCTION catalog_for_shop(
    p_shop_id uuid,
    p_query text DEFAULT NULL,
    p_brand_id uuid DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_availability text DEFAULT NULL,
    p_sort text DEFAULT 'popularity',
    p_cursor uuid DEFAULT NULL,
    p_limit int DEFAULT 50
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT 
            pv.id AS variant_id,
            p.id AS product_id,
            coalesce(b.name, 'Cold Drinks') AS brand_name,
            p.name AS product_name,
            coalesce(pv.image_url, p.image_url) AS image_url,
            coalesce(c.name, 'Beverages') AS category_name,
            pv.sale_unit::text AS sale_unit,
            pv.pieces_per_unit,
            pv.price AS normal_price,
            pv.price AS shop_price,
            pv.stock_status::text AS availability,
            pv.min_qty,
            pv.max_qty,
            pv.qty_multiple,
            EXISTS (
                SELECT 1 FROM customer_favorites cf 
                WHERE cf.shop_id = p_shop_id AND cf.variant_id = pv.id AND cf.user_id = auth.uid()
            ) AS is_favorite,
            pv.id::text AS cursor
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true 
          AND pv.is_active = true
          AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_availability IS NULL OR pv.stock_status::text = p_availability)
          AND (
              p_query IS NULL 
              OR p_query = '' 
              OR p.name ILIKE '%' || p_query || '%'
              OR coalesce(p.sku, '') ILIKE '%' || p_query || '%'
              OR coalesce(b.name, '') ILIKE '%' || p_query || '%'
              OR coalesce(pv.variant_name, '') ILIKE '%' || p_query || '%'
          )
        ORDER BY 
            CASE WHEN p_sort = 'price_asc' THEN pv.price END ASC,
            CASE WHEN p_sort = 'price_desc' THEN pv.price END DESC,
            CASE WHEN p_sort = 'name_asc' THEN p.name END ASC,
            CASE WHEN p_sort = 'name_desc' THEN p.name END DESC,
            b.sort_order ASC,
            p.name ASC
        LIMIT coalesce(p_limit, 50)
    ) t;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_product_detail
DROP FUNCTION IF EXISTS public.get_product_detail(uuid, uuid);
CREATE OR REPLACE FUNCTION get_product_detail(p_variant_id uuid, p_shop_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    SELECT jsonb_build_object(
        'variantId', pv.id,
        'productId', p.id,
        'brand', coalesce(b.name, 'Cold Drinks'),
        'name', p.name,
        'images', jsonb_build_array(coalesce(pv.image_url, p.image_url)),
        'saleUnit', pv.sale_unit::text,
        'piecesPerUnit', pv.pieces_per_unit,
        'normalPrice', pv.price,
        'shopPrice', pv.price,
        'discountBadge', NULL,
        'bulkTiers', '[]'::jsonb,
        'minQty', pv.min_qty,
        'maxQty', pv.max_qty,
        'qtyMultiple', pv.qty_multiple,
        'availability', pv.stock_status::text,
        'depositInfo', NULL,
        'isFavorite', EXISTS (
            SELECT 1 FROM customer_favorites cf 
            WHERE cf.shop_id = p_shop_id AND cf.variant_id = pv.id AND cf.user_id = auth.uid()
        ),
        'category', coalesce(c.name, 'Beverages')
    )
    INTO v_res
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE pv.id = p_variant_id;

    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_home_feed
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
            SELECT jsonb_agg(jsonb_build_object(
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
            ))
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            LEFT JOIN brands b ON b.id = p.brand_id
            WHERE p.is_active = true AND pv.is_active = true
            ORDER BY b.sort_order ASC, p.name ASC
            LIMIT 12
        ), '[]'::jsonb),
        'brands', coalesce((SELECT jsonb_agg(br) FROM brands br WHERE br.is_active = true ORDER BY br.sort_order ASC), '[]'::jsonb),
        'categories', coalesce((SELECT jsonb_agg(c) FROM categories c WHERE c.is_active = true ORDER BY c.sort_order ASC), '[]'::jsonb)
    );
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
