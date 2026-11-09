-- ==============================================================================
-- Migration: Check Account Exists RPC
-- Description:
-- Adds check_account_exists(p_email, p_phone) RPC to allow the frontend
-- to verify if an email or mobile number is already registered before signup,
-- returning exact status: exists_email, exists_phone, or not_found.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_account_exists(
  p_email text,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean_email text;
  v_clean_phone text;
  v_email_exists boolean := false;
  v_phone_exists boolean := false;
BEGIN
  v_clean_email := lower(trim(coalesce(p_email, '')));
  v_clean_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  -- Check email in auth.users or profiles
  IF v_clean_email <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email
      UNION
      SELECT 1 FROM public.profiles WHERE lower(email) = v_clean_email
    ) INTO v_email_exists;
  END IF;

  -- Check phone in auth.users (phone column) or profiles
  IF v_clean_phone <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_clean_phone
      UNION
      SELECT 1 FROM public.profiles WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_clean_phone
    ) INTO v_phone_exists;
  END IF;

  RETURN jsonb_build_object(
    'exists', (v_email_exists OR v_phone_exists),
    'email_exists', v_email_exists,
    'phone_exists', v_phone_exists
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_account_exists(text, text) TO anon, authenticated;
