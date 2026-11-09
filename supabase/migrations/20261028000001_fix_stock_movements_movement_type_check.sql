-- Migration: Fix stock_movements check constraint and stock adjustment RPC
-- Issue: Inserting 'count_correction' or 'return' failed with check constraint violation on stock_movements (error 23514).

-- 1. Update check constraint on stock_movements to allow all inventory movement & adjustment types
ALTER TABLE public.stock_movements
DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
ADD CONSTRAINT stock_movements_movement_type_check
CHECK (movement_type IN (
  'opening_stock',
  'purchase',
  'sale',
  'damage',
  'expiry',
  'breakage',
  'customer_return',
  'adjustment',
  'count_correction',
  'return'
));

-- 2. Update check constraint on stock_adjustments to be equally comprehensive
ALTER TABLE public.stock_adjustments
DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;

ALTER TABLE public.stock_adjustments
ADD CONSTRAINT stock_adjustments_adjustment_type_check
CHECK (adjustment_type IN (
  'opening_stock',
  'damage',
  'expiry',
  'breakage',
  'count_correction',
  'return',
  'adjustment'
));

-- 3. Replace wholesaler_record_stock_adjustment RPC with resilient type normalization
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
  v_movement_type text;
  v_adjustment_type text;
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

  -- Safe normalization for stock_movements
  v_movement_type := CASE
    WHEN p_type IN ('opening_stock', 'purchase', 'sale', 'damage', 'expiry', 'breakage', 'customer_return', 'adjustment', 'count_correction', 'return') THEN p_type
    ELSE 'adjustment'
  END;

  -- Safe normalization for stock_adjustments
  v_adjustment_type := CASE
    WHEN p_type IN ('opening_stock', 'damage', 'expiry', 'breakage', 'count_correction', 'return', 'adjustment') THEN p_type
    ELSE 'count_correction'
  END;

  INSERT INTO public.stock_movements (
    variant_id, movement_type, change_units, balance_units_after, reason
  ) VALUES (
    p_variant_id, v_movement_type, p_units_delta, v_new_units, p_reason
  );

  INSERT INTO public.stock_adjustments (
    variant_id, adjustment_type, units_delta, reason, notes
  ) VALUES (
    p_variant_id, v_adjustment_type, p_units_delta, p_reason, p_notes
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

-- 4. Explicit permissions for Data API access (Supabase best practices)
GRANT EXECUTE ON FUNCTION public.wholesaler_record_stock_adjustment(uuid, text, integer, text, text) TO authenticated, service_role, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated, service_role;
