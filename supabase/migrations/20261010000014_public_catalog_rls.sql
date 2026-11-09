-- Migration: Allow public/anon read access to catalog data (categories, brands, products, variants, banners)

DROP POLICY IF EXISTS "Categories readable by anon" ON public.categories;
CREATE POLICY "Categories readable by anon" ON public.categories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Brands readable by anon" ON public.brands;
CREATE POLICY "Brands readable by anon" ON public.brands FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Products readable by anon" ON public.products;
CREATE POLICY "Products readable by anon" ON public.products FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Variants readable by anon" ON public.product_variants;
CREATE POLICY "Variants readable by anon" ON public.product_variants FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Banners readable by anon" ON public.banners;
CREATE POLICY "Banners readable by anon" ON public.banners FOR SELECT TO anon USING (true);
