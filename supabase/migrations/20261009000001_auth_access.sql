-- ==============================================================================
-- Migration: Auth and Account Access (C1-A)
-- Features:
-- 1. account_status enum: pending_approval, active, suspended, deactivated
-- 2. profiles.account_status column with proper defaults
-- 3. account_deletion_requests table
-- 4. invitations table (for invited signup)
-- 5. otp_rate_limits table (server-side rate limiting: 60s resend, 5 max attempts)
-- 6. Helper RPCs for self-registration, invitation acceptance, and deletion request
-- 7. Strict RLS ensuring users read only their own profile and shop_users rows
-- ==============================================================================

-- 1. Account status enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('pending_approval', 'active', 'suspended', 'deactivated');
  end if;
end;
$$;

-- Add account_status column to profiles if not exists
alter table public.profiles
  add column if not exists account_status public.account_status not null default 'pending_approval';

-- Add suspension_reason / deactivation_reason
alter table public.profiles
  add column if not exists status_reason text;

-- Update existing profiles to active
update public.profiles
set account_status = 'active'
where account_status = 'pending_approval' and email != '';

-- 2. Account deletion requests table
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deletion_requests_user on public.account_deletion_requests (user_id);

-- 3. Invitations table (for invited signup)
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  shop_id uuid not null references public.shops(id) on delete cascade,
  phone text,
  email text,
  role text not null check (role in ('owner', 'manager', 'staff')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_invitations_code on public.invitations (code);
create index if not exists idx_invitations_phone on public.invitations (phone);
create index if not exists idx_invitations_email on public.invitations (email);

-- 4. Server-side OTP rate limiting
create table if not exists public.otp_rate_limits (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  attempts_in_window integer not null default 1,
  verify_attempts integer not null default 0,
  window_start timestamptz not null default now(),
  last_request_at timestamptz not null default now(),
  cooldown_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_rate_phone on public.otp_rate_limits (phone);

-- Function: Server-side OTP Rate Limiting Check
create or replace function public.check_otp_rate_limit(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_now timestamptz := now();
  v_cooldown_duration interval := interval '10 minutes';
  v_window_duration interval := interval '10 minutes';
  v_resend_interval interval := interval '60 seconds';
begin
  select * into v_rec from public.otp_rate_limits where phone = p_phone;

  if not found then
    -- First request for phone
    insert into public.otp_rate_limits (
      phone, attempts_in_window, verify_attempts, window_start, last_request_at, cooldown_until
    ) values (
      p_phone, 1, 0, v_now, v_now, null
    );

    return jsonb_build_object(
      'allowed', true,
      'wait_seconds', 0,
      'attempts_left', 5,
      'resend_available_at', (v_now + v_resend_interval)
    );
  end if;

  -- 1. Check if currently in cooldown
  if v_rec.cooldown_until is not null and v_rec.cooldown_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'wait_seconds', extract(epoch from (v_rec.cooldown_until - v_now))::integer,
      'cooldown_message', 'Too many attempts. Try again in 10 minutes.',
      'resend_available_at', v_rec.cooldown_until
    );
  end if;

  -- 2. Check 60-second resend limit
  if (v_now - v_rec.last_request_at) < v_resend_interval then
    return jsonb_build_object(
      'allowed', false,
      'wait_seconds', extract(epoch from ((v_rec.last_request_at + v_resend_interval) - v_now))::integer,
      'cooldown_message', 'Please wait 60 seconds before requesting another code.',
      'resend_available_at', (v_rec.last_request_at + v_resend_interval)
    );
  end if;

  -- 3. Check window reset
  if (v_now - v_rec.window_start) > v_window_duration then
    -- Reset window
    update public.otp_rate_limits
    set attempts_in_window = 1,
        verify_attempts = 0,
        window_start = v_now,
        last_request_at = v_now,
        cooldown_until = null
    where phone = p_phone;

    return jsonb_build_object(
      'allowed', true,
      'wait_seconds', 0,
      'attempts_left', 4,
      'resend_available_at', (v_now + v_resend_interval)
    );
  end if;

  -- 4. Check if max attempts reached (max 5)
  if v_rec.attempts_in_window >= 5 then
    update public.otp_rate_limits
    set cooldown_until = v_now + v_cooldown_duration
    where phone = p_phone;

    return jsonb_build_object(
      'allowed', false,
      'wait_seconds', extract(epoch from v_cooldown_duration)::integer,
      'cooldown_message', 'Too many attempts. Try again in 10 minutes.',
      'resend_available_at', (v_now + v_cooldown_duration)
    );
  end if;

  -- Increment attempt in current window
  update public.otp_rate_limits
  set attempts_in_window = attempts_in_window + 1,
      last_request_at = v_now
  where phone = p_phone;

  return jsonb_build_object(
    'allowed', true,
    'wait_seconds', 0,
    'attempts_left', (5 - (v_rec.attempts_in_window + 1)),
    'resend_available_at', (v_now + v_resend_interval)
  );
end;
$$;

-- Function: Record verification failure attempt
create or replace function public.record_otp_verification_failure(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_now timestamptz := now();
  v_new_attempts integer;
begin
  select * into v_rec from public.otp_rate_limits where phone = p_phone;
  if not found then
    return jsonb_build_object('attempts_left', 4, 'is_locked', false);
  end if;

  v_new_attempts := v_rec.verify_attempts + 1;

  if v_new_attempts >= 5 then
    update public.otp_rate_limits
    set verify_attempts = v_new_attempts,
        cooldown_until = v_now + interval '10 minutes'
    where phone = p_phone;

    return jsonb_build_object(
      'attempts_left', 0,
      'is_locked', true,
      'cooldown_message', 'Too many attempts. Try again in 10 minutes.'
    );
  end if;

  update public.otp_rate_limits
  set verify_attempts = v_new_attempts
  where phone = p_phone;

  return jsonb_build_object(
    'attempts_left', (5 - v_new_attempts),
    'is_locked', false,
    'message', 'That code is incorrect. ' || (5 - v_new_attempts) || ' attempts left.'
  );
end;
$$;

-- Function: Reset OTP rate limit on successful verify
create or replace function public.reset_otp_rate_limit(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.otp_rate_limits where phone = p_phone;
end;
$$;

-- 5. Atomic self-registration with business (pending approval)
create or replace function public.register_self_with_business(
  p_user_id uuid,
  p_email text,
  p_phone text,
  p_full_name text,
  p_business_name text,
  p_shop_name text,
  p_shop_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_shop_id uuid;
begin
  -- Upsert profile with pending_approval
  insert into public.profiles (id, email, phone, full_name, account_status)
  values (p_user_id, p_email, p_phone, p_full_name, 'pending_approval')
  on conflict (id) do update
  set email = excluded.email,
      phone = excluded.phone,
      full_name = excluded.full_name,
      account_status = 'pending_approval';

  -- Create business
  insert into public.businesses (name, owner_id)
  values (p_business_name, p_user_id)
  returning id into v_business_id;

  -- Create shop
  insert into public.shops (business_id, name, address, phone, is_active)
  values (v_business_id, p_shop_name, p_shop_address, p_phone, true)
  returning id into v_shop_id;

  -- Associate user with shop as owner
  insert into public.shop_users (shop_id, user_id, role)
  values (v_shop_id, p_user_id, 'owner')
  on conflict (shop_id, user_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'account_status', 'pending_approval',
    'business_id', v_business_id,
    'shop_id', v_shop_id
  );
end;
$$;

-- 6. Atomic invitation signup
create or replace function public.accept_invitation(
  p_code text,
  p_user_id uuid,
  p_email text,
  p_phone text,
  p_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  select * into v_invite
  from public.invitations
  where code = upper(trim(p_code))
    and used_at is null
    and expires_at > now();

  if not found then
    raise exception 'INVALID_INVITATION: Invitation code is invalid or has expired.';
  end if;

  -- Upsert profile as active
  insert into public.profiles (id, email, phone, full_name, account_status)
  values (p_user_id, p_email, p_phone, p_full_name, 'active')
  on conflict (id) do update
  set email = excluded.email,
      phone = excluded.phone,
      full_name = excluded.full_name,
      account_status = 'active';

  -- Add user to the invited shop
  insert into public.shop_users (shop_id, user_id, role)
  values (v_invite.shop_id, p_user_id, v_invite.role)
  on conflict (shop_id, user_id) do update
  set role = excluded.role;

  -- Mark invitation as used
  update public.invitations
  set used_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'success', true,
    'shop_id', v_invite.shop_id,
    'role', v_invite.role,
    'account_status', 'active'
  );
end;
$$;

-- 7. Submit account deletion request
create or replace function public.submit_account_deletion_request(
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED: You must be logged in to request account deletion.';
  end if;

  insert into public.account_deletion_requests (user_id, reason, status)
  values (v_uid, p_reason, 'pending')
  returning id into v_req_id;

  -- Set status to deactivated
  update public.profiles
  set account_status = 'deactivated',
      status_reason = coalesce(p_reason, 'Account deletion requested by user')
  where id = v_uid;

  return jsonb_build_object(
    'success', true,
    'request_id', v_req_id,
    'account_status', 'deactivated'
  );
end;
$$;

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

alter table public.otp_rate_limits enable row level security;
alter table public.otp_rate_limits force row level security;

-- Account deletion requests: A user reads and inserts only their own requests
create policy "deletion_requests_select_own"
  on public.account_deletion_requests
  for select
  using (user_id = auth.uid());

create policy "deletion_requests_insert_own"
  on public.account_deletion_requests
  for insert
  with check (user_id = auth.uid());

-- Invitations: Shop owners can manage invitations; invitees can lookup valid invitation by code
create policy "invitations_shop_owner_manage"
  on public.invitations
  for all
  using (
    public.is_shop_member(shop_id) and public.shop_role(shop_id) = 'owner'
  )
  with check (
    public.is_shop_member(shop_id) and public.shop_role(shop_id) = 'owner'
  );

create policy "invitations_lookup_public"
  on public.invitations
  for select
  using (used_at is null and expires_at > now());

-- Refined Profiles Policy: A user reads only their own profile
drop policy if exists "profiles_select_policy" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (id = auth.uid());

-- Refined Shop Users Policy: A user reads only their own shop_users rows
drop policy if exists "shop_users_select_policy" on public.shop_users;
create policy "shop_users_select_own"
  on public.shop_users
  for select
  using (user_id = auth.uid());
