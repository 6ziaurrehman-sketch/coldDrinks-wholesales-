-- ==============================================================================
-- Migration: Fix product_variants.sale_unit NOT NULL failure on Add Drink
-- Cause:
--   public.product_variants.sale_unit (sale_unit_enum NOT NULL) had no DEFAULT,
--   and wholesalerService.addProduct inserted packaging_type without sale_unit,
--   raising SQLSTATE 23502 on insert.
-- Fixes:
--   1. Set column DEFAULT 'carton'::public.sale_unit_enum on product_variants.sale_unit
--   2. Add BEFORE INSERT/UPDATE guard trigger if sale_unit is explicitly passed as NULL
--   3. Clean up orphan products rows created by previous failed product_variants inserts
--   4. Ensure grants on products, product_variants, inventory
-- ==============================================================================

-- 1. Set safe column default on product_variants.sale_unit
ALTER TABLE public.product_variants
  ALTER COLUMN sale_unit SET DEFAULT 'carton'::public.sale_unit_enum;

-- 2. Trigger fallback when sale_unit is explicitly NULL
CREATE OR REPLACE FUNCTION public.ensure_product_variant_sale_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pkg text;
BEGIN
  IF NEW.sale_unit IS NULL THEN
    v_pkg := lower(trim(coalesce(NEW.packaging_type, 'carton')));
    NEW.sale_unit := CASE
      WHEN v_pkg IN ('carton', 'case', 'shrink', 'pack', 'single') THEN v_pkg::public.sale_unit_enum
      WHEN v_pkg IN ('crate', 'tray', 'box') THEN 'case'::public.sale_unit_enum
      WHEN v_pkg IN ('bottle', 'can', 'unit', 'piece') THEN 'single'::public.sale_unit_enum
      ELSE 'carton'::public.sale_unit_enum
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_product_variant_sale_unit ON public.product_variants;
CREATE TRIGGER trg_ensure_product_variant_sale_unit
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_product_variant_sale_unit();

-- 3. Remove orphan products with zero variants left behind by failed Add Drink saves
DELETE FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id
);

-- 4. Explicit Data API grants
GRANT SELECT ON public.categories, public.brands TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.product_variants, public.inventory TO authenticated, service_role;
