-- Migration: Allow 'opening_stock' in stock_adjustments check constraint

ALTER TABLE public.stock_adjustments
DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;

ALTER TABLE public.stock_adjustments
ADD CONSTRAINT stock_adjustments_adjustment_type_check
CHECK (adjustment_type IN ('opening_stock', 'damage', 'expiry', 'breakage', 'count_correction', 'return'));
