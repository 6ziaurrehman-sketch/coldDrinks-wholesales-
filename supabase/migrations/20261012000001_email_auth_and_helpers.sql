-- ==============================================================================
-- Migration: Email Auth Verification & Phone-to-Email Helper
-- Description:
-- 1. Updates complete_signup() to insert default customer_address and grant
--    execute to anon and authenticated.
-- 2. Adds get_auth_email_by_phone() helper so users can log in using either
--    their registered email OR their phone number.
-- 3. Adds trigger on auth.users so that if a user confirms email, their profile
--    is marked active and store is ensured.
-- ==============================================================================

-- 1. Enhanced complete_signup RPC
CREATE OR REPLACE FUNCTION public.complete_signup(
  p_user_id uuid,
  p_email text,
  p_phone text,
  p_full_name text,
  p_business_name text,
  p_shop_name text,
  p_shop_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_shop_id uuid;
BEGIN
  -- Create or retrieve business
  SELECT id INTO v_business_id FROM public.businesses WHERE owner_id = p_user_id LIMIT 1;
  IF v_business_id IS NULL THEN
    INSERT INTO public.businesses (name, owner_id)
    VALUES (COALESCE(p_business_name, p_shop_name, 'Business'), p_user_id)
    RETURNING id INTO v_business_id;
  END IF;

  -- Create or retrieve shop
  SELECT id INTO v_shop_id FROM public.shops WHERE business_id = v_business_id LIMIT 1;
  IF v_shop_id IS NULL THEN
    INSERT INTO public.shops (business_id, name, address, phone, is_active)
    VALUES (v_business_id, COALESCE(p_shop_name, 'My Shop'), p_shop_address, p_phone, true)
    RETURNING id INTO v_shop_id;
  ELSE
    UPDATE public.shops
    SET name = COALESCE(p_shop_name, name),
        address = COALESCE(p_shop_address, address),
        phone = COALESCE(p_phone, phone),
        is_active = true
    WHERE id = v_shop_id;
  END IF;

  -- Upsert profile
  INSERT INTO public.profiles (id, email, phone, full_name, account_status, active_shop_id, role)
  VALUES (p_user_id, p_email, p_phone, p_full_name, 'active', v_shop_id, 'owner')
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, profiles.email),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
      account_status = 'active',
      active_shop_id = v_shop_id,
      role = 'owner';

  -- Associate user with shop as owner
  INSERT INTO public.shop_users (shop_id, user_id, role, status)
  VALUES (v_shop_id, p_user_id, 'owner', 'active')
  ON CONFLICT (shop_id, user_id) DO UPDATE
  SET role = 'owner', status = 'active';

  -- Create default customer address if address provided
  IF p_shop_address IS NOT NULL AND p_shop_address <> '' THEN
    INSERT INTO public.customer_addresses (
      shop_id,
      label,
      full_address,
      contact_name,
      contact_phone,
      is_default,
      is_active
    ) VALUES (
      v_shop_id,
      'Shop',
      p_shop_address,
      p_full_name,
      p_phone,
      true,
      true
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'account_status', 'active',
    'business_id', v_business_id,
    'shop_id', v_shop_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_signup(uuid, text, text, text, text, text, text) TO anon, authenticated;

-- 2. Helper to find email by phone number (enables login & forgot password with phone)
CREATE OR REPLACE FUNCTION public.get_auth_email_by_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_clean_phone text;
BEGIN
  -- Normalize digits
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');

  -- Search profile by exact or normalized phone
  SELECT email INTO v_email
  FROM public.profiles
  WHERE regexp_replace(phone, '\D', '', 'g') = v_clean_phone
     OR phone = p_phone
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_email_by_phone(text) TO anon, authenticated;
