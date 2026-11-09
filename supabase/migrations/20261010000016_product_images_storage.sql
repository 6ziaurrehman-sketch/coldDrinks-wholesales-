-- Migration: Create public product-images storage bucket and policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access product-images" ON storage.objects;
CREATE POLICY "Public Access product-images" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Upload product-images" ON storage.objects;
CREATE POLICY "Public Upload product-images" ON storage.objects
FOR INSERT TO public
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Update product-images" ON storage.objects;
CREATE POLICY "Public Update product-images" ON storage.objects
FOR UPDATE TO public
USING (bucket_id = 'product-images');
