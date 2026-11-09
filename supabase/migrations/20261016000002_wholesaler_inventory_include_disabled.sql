-- ============================================================================
-- Migration: Wholesaler Inventory Include Disabled Products & Status
-- Returns all products to the wholesaler ERP with explicit is_active and status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.wholesaler_get_inventory(p_search text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_res jsonb;
  v_clean text;
  v_compact text;
BEGIN
  v_clean := lower(trim(coalesce(p_search, '')));
  -- Map cartoon / cartoons to carton
  v_clean := regexp_replace(v_clean, 'cartoons?', 'carton', 'gi');
  v_clean := regexp_replace(v_clean, 'ctns?', 'carton', 'gi');
  v_clean := regexp_replace(v_clean, 'coke', 'coca-cola', 'gi');
  -- Compact version: remove spaces, dots, hyphens, parentheses
  v_compact := regexp_replace(v_clean, '[\s\.\-_/\\(),]+', '', 'g');

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
      round((coalesce(i.total_units, 0) * (coalesce(pv.cost_price, 0) / greatest(coalesce(pv.pieces_per_unit, 1), 1))), 2) AS stock_value,
      (coalesce(p.is_active, true) AND coalesce(pv.is_active, true)) AS is_active,
      CASE 
        WHEN NOT (coalesce(p.is_active, true) AND coalesce(pv.is_active, true)) THEN 'disabled'
        WHEN coalesce(i.total_units, 0) = 0 THEN 'out_of_stock'
        ELSE 'active'
      END AS status
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.inventory i ON i.variant_id = pv.id
    WHERE (
        v_clean = ''
        -- 1. Combined text search (name, size, brand, packaging)
        OR (p.name || ' ' || coalesce(pv.size_label, '') || ' ' || coalesce(b.name, '') || ' ' || coalesce(c.name, '') || ' ' || coalesce(pv.packaging_type, 'carton')) ILIKE '%' || v_clean || '%'
        -- 2. Compact no-space search (matches '7up1.5l', '7up15l', etc.)
        OR regexp_replace(lower(p.name || coalesce(pv.size_label, '') || coalesce(b.name, '') || coalesce(pv.packaging_type, 'carton')), '[\s\.\-_/\\(),]+', '', 'g') ILIKE '%' || v_compact || '%'
        -- 3. Barcode search
        OR coalesce(pv.barcode, '') ILIKE '%' || v_clean || '%'
        -- 4. Carton search: if query contains carton/cartoons, match all products packaged in cartons
        OR (v_clean = 'carton' AND (coalesce(pv.packaging_type, 'carton') = 'carton' OR coalesce(i.total_units, 0) > 0))
      )
    ORDER BY b.sort_order ASC, p.name ASC
  ) t;

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
