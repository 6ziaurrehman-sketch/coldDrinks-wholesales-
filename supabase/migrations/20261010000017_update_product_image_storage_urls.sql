-- Migration: Update image URLs to use Supabase Storage public CDN URLs

UPDATE public.products
SET image_url = 'https://qtzkuonkcfgdhxuvazha.supabase.co/storage/v1/object/public/product-images' || substring(image_url from 8)
WHERE image_url LIKE '/images/%';

UPDATE public.product_variants
SET image_url = 'https://qtzkuonkcfgdhxuvazha.supabase.co/storage/v1/object/public/product-images' || substring(image_url from 8)
WHERE image_url LIKE '/images/%';

UPDATE public.brands
SET logo_url = 'https://qtzkuonkcfgdhxuvazha.supabase.co/storage/v1/object/public/product-images' || substring(logo_url from 8)
WHERE logo_url LIKE '/images/%';
