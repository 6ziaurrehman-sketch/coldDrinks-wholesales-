-- Migration: Auto-activate signups and add admin approval function

-- 1. Helper function to approve any user by email
CREATE OR REPLACE FUNCTION public.admin_approve_user(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_shop_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE email = p_email;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  SELECT shop_id INTO v_shop_id FROM public.shop_users WHERE user_id = v_user_id LIMIT 1;

  UPDATE public.profiles
  SET account_status = 'active',
      active_shop_id = coalesce(active_shop_id, v_shop_id),
      role = coalesce(role, 'owner')
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'User approved and activated',
    'email', p_email,
    'shop_id', v_shop_id
  );
END;
$$;

-- 2. Update complete_signup to activate signups and set active_shop_id directly
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
  -- Create business
  INSERT INTO public.businesses (name, owner_id)
  VALUES (p_business_name, p_user_id)
  RETURNING id INTO v_business_id;

  -- Create shop
  INSERT INTO public.shops (business_id, name, address, phone, is_active)
  VALUES (v_business_id, p_shop_name, p_shop_address, p_phone, true)
  RETURNING id INTO v_shop_id;

  -- Upsert profile with active status and active_shop_id
  INSERT INTO public.profiles (id, email, phone, full_name, account_status, active_shop_id, role)
  VALUES (p_user_id, p_email, p_phone, p_full_name, 'active', v_shop_id, 'owner')
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      full_name = EXCLUDED.full_name,
      account_status = 'active',
      active_shop_id = v_shop_id,
      role = 'owner';

  -- Associate user with shop as owner
  INSERT INTO public.shop_users (shop_id, user_id, role, status)
  VALUES (v_shop_id, p_user_id, 'owner', 'active')
  ON CONFLICT (shop_id, user_id) DO UPDATE
  SET role = 'owner', status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'account_status', 'active',
    'business_id', v_business_id,
    'shop_id', v_shop_id
  );
END;
$$;
