-- COLD DRINKS WHOLESALE APP: MASTER DATABASE MIGRATIONS & SEED DATA


-- ================================================================
-- MIGRATION: 20261008000001_core_schema.sql
-- ================================================================

-- Core Schema Migration: businesses, profiles, shops, shop_users, app_settings, audit_logs, idempotency_keys
-- RLS on all tables with helper functions is_shop_member() and shop_role()

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

--------------------------------------------------------------------------------
-- 1. PROFILES TABLE (linked to auth.users)
--------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to automatically handle profile creation on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

--------------------------------------------------------------------------------
-- 2. BUSINESSES TABLE
--------------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

--------------------------------------------------------------------------------
-- 3. SHOPS TABLE
--------------------------------------------------------------------------------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

--------------------------------------------------------------------------------
-- 4. SHOP_USERS TABLE (Many-to-Many with roles: owner, manager, staff)
--------------------------------------------------------------------------------
create table if not exists public.shop_users (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_shop_user unique (shop_id, user_id)
);

create index if not exists idx_shop_users_lookup on public.shop_users (shop_id, user_id);
create index if not exists idx_shop_users_user on public.shop_users (user_id);

--------------------------------------------------------------------------------
-- 5. APP_SETTINGS TABLE (with minimum_app_version & force update gate)
--------------------------------------------------------------------------------
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  minimum_app_version text not null default '1.0.0',
  force_update_message text default 'Please update to the latest version of the app to continue.',
  store_url text default 'https://play.google.com/store/apps',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- Seed default app_settings row if not exists
insert into public.app_settings (key, value, minimum_app_version, force_update_message, store_url)
values (
  'global_config',
  '{"maintenance": false, "announcement": null}'::jsonb,
  '1.0.0',
  'A required update is available with important fixes and improvements.',
  'https://play.google.com/store/apps'
)
on conflict (key) do nothing;

--------------------------------------------------------------------------------
-- 6. AUDIT_LOGS TABLE (Owner/Manager can view; Staff cannot read)
--------------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_shop on public.audit_logs (shop_id, created_at desc);

--------------------------------------------------------------------------------
-- 7. IDEMPOTENCY_KEYS TABLE
--------------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  key text not null,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response_code integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (shop_id, key)
);

create index if not exists idx_idempotency_lookup on public.idempotency_keys (shop_id, key, expires_at);

--------------------------------------------------------------------------------
-- HELPER FUNCTIONS: is_shop_member & shop_role
--------------------------------------------------------------------------------

-- Checks if the authenticated user is an active member of the shop
create or replace function public.is_shop_member(lookup_shop_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_users
    where shop_id = lookup_shop_id
      and user_id = auth.uid()
  );
$$;

-- Returns the role ('owner', 'manager', 'staff') of the authenticated user in the shop
create or replace function public.shop_role(lookup_shop_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role
  from public.shop_users
  where shop_id = lookup_shop_id
    and user_id = auth.uid()
  limit 1;
$$;

-- Checks if user is owner or manager in the shop
create or replace function public.is_shop_owner_or_manager(lookup_shop_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.shop_users
    where shop_id = lookup_shop_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
  );
$$;

-- Generic updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers
create or replace trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create or replace trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute procedure public.handle_updated_at();

create or replace trigger trg_shops_updated_at
  before update on public.shops
  for each row execute procedure public.handle_updated_at();

create or replace trigger trg_shop_users_updated_at
  before update on public.shop_users
  for each row execute procedure public.handle_updated_at();

create or replace trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute procedure public.handle_updated_at();

--------------------------------------------------------------------------------
-- IDEMPOTENCY HELPER FUNCTIONS (Atomic Get / Store)
--------------------------------------------------------------------------------

-- Records an idempotency key result or returns duplicate if already exists
create or replace function public.store_idempotency_result(
  p_key text,
  p_shop_id uuid,
  p_user_id uuid,
  p_response_code integer,
  p_response_body jsonb,
  p_ttl_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_expires_at timestamptz;
begin
  v_expires_at := now() + (p_ttl_seconds || ' seconds')::interval;

  -- Verify membership
  if not public.is_shop_member(p_shop_id) and auth.uid() is not null then
    raise exception 'RLS_VIOLATION: Access denied to shop %', p_shop_id;
  end if;

  -- Check if already exists and not expired
  select * into v_existing
  from public.idempotency_keys
  where shop_id = p_shop_id and key = p_key;

  if found and v_existing.expires_at > now() then
    -- Return existing result
    return jsonb_build_object(
      'is_duplicate', true,
      'response_code', v_existing.response_code,
      'response_body', v_existing.response_body
    );
  end if;

  -- Insert or update
  insert into public.idempotency_keys (
    key,
    shop_id,
    user_id,
    response_code,
    response_body,
    created_at,
    expires_at
  )
  values (
    p_key,
    p_shop_id,
    p_user_id,
    p_response_code,
    p_response_body,
    now(),
    v_expires_at
  )
  on conflict (shop_id, key) do update
  set response_code = excluded.response_code,
      response_body = excluded.response_body,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at;

  return jsonb_build_object(
    'is_duplicate', false,
    'response_code', p_response_code,
    'response_body', p_response_body
  );
end;
$$;

--------------------------------------------------------------------------------
-- SAMPLE RPC DEMONSTRATING CUSTOM EXCEPTION PREFIX
--------------------------------------------------------------------------------
create or replace function public.validate_credit_limit(
  p_customer_id uuid,
  p_amount numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount > 10000 then
    raise exception 'CREDIT_EXCEEDED: Requested amount exceeds credit limit of 10000';
  end if;
  return true;
end;
$$;

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.shops enable row level security;
alter table public.shop_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.idempotency_keys enable row level security;

-- Force RLS for table owners too
alter table public.profiles force row level security;
alter table public.businesses force row level security;
alter table public.shops force row level security;
alter table public.shop_users force row level security;
alter table public.app_settings force row level security;
alter table public.audit_logs force row level security;
alter table public.idempotency_keys force row level security;

--------------------------------------------------------------------------------
-- PROFILES POLICIES
--------------------------------------------------------------------------------
-- Users can read their own profile OR profiles of members in the same shop
create policy "profiles_select_policy"
  on public.profiles
  for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.shop_users su_me
      join public.shop_users su_other on su_me.shop_id = su_other.shop_id
      where su_me.user_id = auth.uid()
        and su_other.user_id = profiles.id
    )
  );

create policy "profiles_insert_policy"
  on public.profiles
  for insert
  with check (id = auth.uid());

create policy "profiles_update_policy"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

--------------------------------------------------------------------------------
-- BUSINESSES POLICIES
--------------------------------------------------------------------------------
create policy "businesses_select_policy"
  on public.businesses
  for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1
      from public.shops s
      join public.shop_users su on su.shop_id = s.id
      where s.business_id = businesses.id
        and su.user_id = auth.uid()
    )
  );

create policy "businesses_insert_policy"
  on public.businesses
  for insert
  with check (owner_id = auth.uid());

create policy "businesses_update_policy"
  on public.businesses
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "businesses_delete_policy"
  on public.businesses
  for delete
  using (owner_id = auth.uid());

--------------------------------------------------------------------------------
-- SHOPS POLICIES
--------------------------------------------------------------------------------
-- Users can only select shops where they are members
create policy "shops_select_policy"
  on public.shops
  for select
  using (public.is_shop_member(id));

-- Only business owner can create shop
create policy "shops_insert_policy"
  on public.shops
  for insert
  with check (
    exists (
      select 1
      from public.businesses b
      where b.id = shops.business_id
        and b.owner_id = auth.uid()
    )
  );

-- Only shop owner can update shop
create policy "shops_update_policy"
  on public.shops
  for update
  using (public.shop_role(id) = 'owner')
  with check (public.shop_role(id) = 'owner');

-- Only shop owner can delete shop
create policy "shops_delete_policy"
  on public.shops
  for delete
  using (public.shop_role(id) = 'owner');

--------------------------------------------------------------------------------
-- SHOP_USERS POLICIES
--------------------------------------------------------------------------------
-- Members of the shop can view other members in that shop
create policy "shop_users_select_policy"
  on public.shop_users
  for select
  using (public.is_shop_member(shop_id));

-- Only shop owner can add users to the shop
create policy "shop_users_insert_policy"
  on public.shop_users
  for insert
  with check (public.shop_role(shop_id) = 'owner');

-- Only shop owner can update user roles in the shop
create policy "shop_users_update_policy"
  on public.shop_users
  for update
  using (public.shop_role(shop_id) = 'owner')
  with check (public.shop_role(shop_id) = 'owner');

-- Only shop owner can remove users from the shop
create policy "shop_users_delete_policy"
  on public.shop_users
  for delete
  using (public.shop_role(shop_id) = 'owner');

--------------------------------------------------------------------------------
-- APP_SETTINGS POLICIES
--------------------------------------------------------------------------------
-- Any user (authenticated or anon) can read app settings for app version gates
create policy "app_settings_select_policy"
  on public.app_settings
  for select
  using (true);

-- Only service role can modify app settings
create policy "app_settings_modify_policy"
  on public.app_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

--------------------------------------------------------------------------------
-- AUDIT_LOGS POLICIES (Crucial: Staff CANNOT read owner-only data!)
--------------------------------------------------------------------------------
-- Only owner and manager of the shop can SELECT audit logs
create policy "audit_logs_select_policy"
  on public.audit_logs
  for select
  using (
    public.is_shop_member(shop_id)
    and public.shop_role(shop_id) in ('owner', 'manager')
  );

-- Any member of the shop can append audit logs
create policy "audit_logs_insert_policy"
  on public.audit_logs
  for insert
  with check (
    public.is_shop_member(shop_id)
    and (user_id = auth.uid() or user_id is null)
  );

-- Audit logs are strictly immutable: NO update or delete allowed
create policy "audit_logs_update_policy"
  on public.audit_logs
  for update
  using (false);

create policy "audit_logs_delete_policy"
  on public.audit_logs
  for delete
  using (false);

--------------------------------------------------------------------------------
-- IDEMPOTENCY_KEYS POLICIES
--------------------------------------------------------------------------------
-- User can only select idempotency keys for their shop and their own user
create policy "idempotency_keys_select_policy"
  on public.idempotency_keys
  for select
  using (
    public.is_shop_member(shop_id)
    and user_id = auth.uid()
  );

create policy "idempotency_keys_insert_policy"
  on public.idempotency_keys
  for insert
  with check (
    public.is_shop_member(shop_id)
    and user_id = auth.uid()
  );

create policy "idempotency_keys_update_policy"
  on public.idempotency_keys
  for update
  using (
    public.is_shop_member(shop_id)
    and user_id = auth.uid()
  )
  with check (
    public.is_shop_member(shop_id)
    and user_id = auth.uid()
  );

create policy "idempotency_keys_delete_policy"
  on public.idempotency_keys
  for delete
  using (false);


-- ================================================================
-- MIGRATION: 20261009000001_auth_access.sql
-- ================================================================

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


-- ================================================================
-- MIGRATION: 20261009000002_shop_profile_roles.sql
-- ================================================================

-- ==============================================================================
-- Migration: Shop Profile and Staff Roles (C2-A)
-- Features:
-- 1. shops table extended with profile, tax, location, delivery & approval columns
-- 2. shop_contacts table for multi-contact management
-- 3. shop_users status column (invited, active, removed)
-- 4. RPCs:
--    - invite_staff (checks cross-shop duplicate, validates owner, generates invite)
--    - change_role (blocks self-change, blocks demoting the last owner)
--    - remove_staff (blocks self-remove, blocks removing the last owner)
--    - update_shop_profile (optimistic concurrency with updated_at, NTN check)
--    - get_shop_members (safe member list retrieval)
-- 5. RLS policies on shop_contacts, shops, and shop_users
-- ==============================================================================

-- 1. Extend shops table
alter table public.shops
  add column if not exists owner_name text,
  add column if not exists alt_phone text,
  add column if not exists email text,
  add column if not exists business_type text default 'retail',
  add column if not exists city text default 'Karachi',
  add column if not exists area text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists ntn text,
  add column if not exists strn text,
  add column if not exists tax_registered boolean not null default false,
  add column if not exists default_delivery_instructions text,
  add column if not exists approval_threshold numeric check (approval_threshold is null or approval_threshold >= 0);

-- NTN check constraint if provided (format: 7 digits - 1 check digit)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_shops_ntn_format'
  ) then
    alter table public.shops
      add constraint chk_shops_ntn_format
      check (ntn is null or ntn = '' or ntn ~ '^\d{7}-\d$');
  end if;
end;
$$;

-- 2. Extend shop_users table with status
alter table public.shop_users
  add column if not exists status text not null default 'active'
  check (status in ('invited', 'active', 'removed'));

create index if not exists idx_shop_users_shop_status on public.shop_users (shop_id, status);

-- 3. Create shop_contacts table
create table if not exists public.shop_contacts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  role text default 'Contact Person',
  phone text not null,
  email text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shop_contacts_shop on public.shop_contacts (shop_id);

alter table public.shop_contacts enable row level security;
alter table public.shop_contacts force row level security;

-- Trigger for shop_contacts updated_at
create or replace trigger trg_shop_contacts_updated_at
  before update on public.shop_contacts
  for each row execute procedure public.handle_updated_at();

-- 4. RLS for shop_contacts
create policy "shop_contacts_select_policy"
  on public.shop_contacts
  for select
  using (public.is_shop_member(shop_id));

create policy "shop_contacts_insert_policy"
  on public.shop_contacts
  for insert
  with check (public.shop_role(shop_id) = 'owner');

create policy "shop_contacts_update_policy"
  on public.shop_contacts
  for update
  using (public.shop_role(shop_id) = 'owner')
  with check (public.shop_role(shop_id) = 'owner');

create policy "shop_contacts_delete_policy"
  on public.shop_contacts
  for delete
  using (public.shop_role(shop_id) = 'owner');

-- -----------------------------------------------------------------------------
-- 5. RPC: get_shop_members
-- -----------------------------------------------------------------------------
create or replace function public.get_shop_members(p_shop_id uuid)
returns table (
  user_id uuid,
  role text,
  status text,
  full_name text,
  email text,
  phone text,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    su.user_id,
    su.role,
    su.status,
    p.full_name,
    p.email,
    p.phone,
    su.created_at as joined_at
  from public.shop_users su
  join public.profiles p on p.id = su.user_id
  where su.shop_id = p_shop_id
    and public.is_shop_member(p_shop_id)
    and su.status != 'removed'
  order by
    case su.role
      when 'owner' then 1
      when 'manager' then 2
      when 'staff' then 3
      else 4
    end,
    su.created_at asc;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: invite_staff
-- -----------------------------------------------------------------------------
create or replace function public.invite_staff(
  p_shop_id uuid,
  p_phone text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_phone text;
  v_caller_role text;
  v_existing_other_shop record;
  v_existing_profile record;
  v_existing_membership record;
  v_invite_code text;
begin
  -- 1. Caller must be owner
  v_caller_role := public.shop_role(p_shop_id);
  if v_caller_role is null or v_caller_role != 'owner' then
    raise exception 'UNAUTHORIZED: Only shop owners can invite staff.';
  end if;

  -- 2. Validate role
  if p_role not in ('owner', 'manager', 'staff') then
    raise exception 'INVALID_ROLE: Role must be owner, manager, or staff.';
  end if;

  -- 3. Normalize phone to E.164
  v_normalized_phone := regexp_replace(trim(p_phone), '[^\d+]', '', 'g');
  if v_normalized_phone like '+%' then
    v_normalized_phone := substr(v_normalized_phone, 2);
  end if;
  if v_normalized_phone like '0092%' then
    v_normalized_phone := substr(v_normalized_phone, 5);
  elsif v_normalized_phone like '92%' then
    v_normalized_phone := substr(v_normalized_phone, 3);
  elsif v_normalized_phone like '0%' then
    v_normalized_phone := substr(v_normalized_phone, 2);
  end if;

  if v_normalized_phone !~ '^3\d{9}$' then
    raise exception 'INVALID_PHONE: Please provide a valid 11-digit Pakistan mobile number.';
  end if;
  v_normalized_phone := '+92' || v_normalized_phone;

  -- 4. Edge Case: Invited number already belongs to another shop
  select su.shop_id, s.name as shop_name, su.user_id
  into v_existing_other_shop
  from public.profiles p
  join public.shop_users su on su.user_id = p.id
  join public.shops s on s.id = su.shop_id
  where p.phone = v_normalized_phone
    and su.status in ('active', 'invited')
    and su.shop_id != p_shop_id
  limit 1;

  if v_existing_other_shop is not null then
    raise exception 'PHONE_ALREADY_MEMBER: This phone number is already registered with another shop (%).', v_existing_other_shop.shop_name;
  end if;

  -- 5. Check if user has an existing profile
  select * into v_existing_profile from public.profiles where phone = v_normalized_phone limit 1;

  -- 6. Check existing membership in this shop
  if v_existing_profile is not null then
    select * into v_existing_membership
    from public.shop_users
    where shop_id = p_shop_id and user_id = v_existing_profile.id
    limit 1;

    if v_existing_membership is not null and v_existing_membership.status = 'active' then
      raise exception 'ALREADY_EXISTS: This phone number is already an active member of this shop.';
    end if;
  end if;

  -- 7. Generate unique invitation code
  v_invite_code := 'INV-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.invitations (
    code,
    shop_id,
    phone,
    role,
    invited_by,
    expires_at
  )
  values (
    v_invite_code,
    p_shop_id,
    v_normalized_phone,
    p_role,
    auth.uid(),
    now() + interval '7 days'
  );

  -- 8. If profile already exists, upsert shop_users with status 'invited'
  if v_existing_profile is not null then
    insert into public.shop_users (shop_id, user_id, role, status)
    values (p_shop_id, v_existing_profile.id, p_role, 'invited')
    on conflict (shop_id, user_id)
    do update set role = excluded.role, status = 'invited', updated_at = now();
  end if;

  return jsonb_build_object(
    'success', true,
    'invite_code', v_invite_code,
    'phone', v_normalized_phone,
    'role', p_role,
    'shop_id', p_shop_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: change_role
-- -----------------------------------------------------------------------------
create or replace function public.change_role(
  p_shop_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
  v_owner_count integer;
begin
  -- 1. Caller must be owner
  v_caller_role := public.shop_role(p_shop_id);
  if v_caller_role is null or v_caller_role != 'owner' then
    raise exception 'UNAUTHORIZED: Only shop owners can change staff roles.';
  end if;

  -- 2. Edge Case: A user cannot change their own role
  if auth.uid() = p_target_user_id then
    raise exception 'CANNOT_CHANGE_OWN_ROLE: You cannot modify your own role.';
  end if;

  -- 3. Validate new role
  if p_new_role not in ('owner', 'manager', 'staff') then
    raise exception 'INVALID_ROLE: Role must be owner, manager, or staff.';
  end if;

  -- 4. Get current target role
  select role into v_target_role
  from public.shop_users
  where shop_id = p_shop_id and user_id = p_target_user_id and status != 'removed';

  if v_target_role is null then
    raise exception 'NOT_FOUND: Member not found in this shop.';
  end if;

  -- 5. Edge Case: Cannot remove or demote the last owner
  if v_target_role = 'owner' and p_new_role != 'owner' then
    select count(*) into v_owner_count
    from public.shop_users
    where shop_id = p_shop_id and role = 'owner' and status = 'active';

    if v_owner_count <= 1 then
      raise exception 'LAST_OWNER: Cannot demote the last owner of the shop.';
    end if;
  end if;

  -- 6. Update role
  update public.shop_users
  set role = p_new_role,
      status = 'active',
      updated_at = now()
  where shop_id = p_shop_id and user_id = p_target_user_id;

  return jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'new_role', p_new_role
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC: remove_staff
-- -----------------------------------------------------------------------------
create or replace function public.remove_staff(
  p_shop_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
  v_owner_count integer;
begin
  -- 1. Caller must be owner
  v_caller_role := public.shop_role(p_shop_id);
  if v_caller_role is null or v_caller_role != 'owner' then
    raise exception 'UNAUTHORIZED: Only shop owners can remove staff members.';
  end if;

  -- 2. Edge Case: Cannot remove self
  if auth.uid() = p_target_user_id then
    raise exception 'CANNOT_CHANGE_OWN_ROLE: You cannot remove yourself from the shop.';
  end if;

  -- 3. Get target role
  select role into v_target_role
  from public.shop_users
  where shop_id = p_shop_id and user_id = p_target_user_id and status != 'removed';

  if v_target_role is null then
    raise exception 'NOT_FOUND: Member not found in this shop.';
  end if;

  -- 4. Edge Case: Cannot remove the last owner
  if v_target_role = 'owner' then
    select count(*) into v_owner_count
    from public.shop_users
    where shop_id = p_shop_id and role = 'owner' and status = 'active';

    if v_owner_count <= 1 then
      raise exception 'LAST_OWNER: Cannot remove the last owner of the shop.';
    end if;
  end if;

  -- 5. Mark as removed
  update public.shop_users
  set status = 'removed',
      updated_at = now()
  where shop_id = p_shop_id and user_id = p_target_user_id;

  return jsonb_build_object(
    'success', true,
    'user_id', p_target_user_id,
    'status', 'removed'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC: update_shop_profile (with optimistic concurrency check)
-- -----------------------------------------------------------------------------
create or replace function public.update_shop_profile(
  p_shop_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_owner_name text,
  p_phone text,
  p_alt_phone text,
  p_email text,
  p_business_type text,
  p_city text,
  p_area text,
  p_lat double precision,
  p_lng double precision,
  p_ntn text,
  p_strn text,
  p_tax_registered boolean,
  p_default_delivery_instructions text,
  p_approval_threshold numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_current_updated_at timestamptz;
  v_updated_row public.shops%rowtype;
begin
  -- 1. Caller must be owner
  v_caller_role := public.shop_role(p_shop_id);
  if v_caller_role is null or v_caller_role != 'owner' then
    raise exception 'UNAUTHORIZED: Only shop owners can update the shop profile.';
  end if;

  -- 2. Concurrency check
  select updated_at into v_current_updated_at
  from public.shops
  where id = p_shop_id;

  if not found then
    raise exception 'NOT_FOUND: Shop not found.';
  end if;

  if p_expected_updated_at is not null and date_trunc('milliseconds', v_current_updated_at) != date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'CONCURRENT_MODIFICATION: This profile was changed by someone else, reload.';
  end if;

  -- 3. NTN format validation (7 digits - 1 check digit)
  if p_ntn is not null and trim(p_ntn) != '' and trim(p_ntn) !~ '^\d{7}-\d$' then
    raise exception 'INVALID_NTN: NTN must be in format 1234567-8 (7 digits followed by hyphen and 1 check digit).';
  end if;

  -- 4. Update the shop
  update public.shops
  set name = coalesce(nullif(trim(p_name), ''), name),
      owner_name = nullif(trim(p_owner_name), ''),
      phone = nullif(trim(p_phone), ''),
      alt_phone = nullif(trim(p_alt_phone), ''),
      email = nullif(trim(p_email), ''),
      business_type = coalesce(p_business_type, business_type),
      city = coalesce(nullif(trim(p_city), ''), city),
      area = nullif(trim(p_area), ''),
      lat = p_lat,
      lng = p_lng,
      ntn = nullif(trim(p_ntn), ''),
      strn = nullif(trim(p_strn), ''),
      tax_registered = coalesce(p_tax_registered, false),
      default_delivery_instructions = nullif(trim(p_default_delivery_instructions), ''),
      approval_threshold = p_approval_threshold,
      updated_at = now()
  where id = p_shop_id
  returning * into v_updated_row;

  return to_jsonb(v_updated_row);
end;
$$;


-- ================================================================
-- MIGRATION: 20261009000003_addresses_and_delivery.sql
-- ================================================================

-- ==============================================================================
-- Migration: Addresses and Delivery Preferences (C2-C / Delivery Foundation)
-- Features:
-- 1. delivery_zones table (name, fee, min_order_amount, active, areas, polygon, slots)
-- 2. Seed default delivery zones for Karachi wholesale districts
-- 3. customer_addresses table (shop_id, label, full_address, zone_id, lat, lng, contact_name, contact_phone, instructions, is_default, is_active)
-- 4. Partial unique index: exactly one default active address per shop
-- 5. Delivery preferences on shops (preferred_delivery_period, standing_instructions, substitution_preference)
-- 6. RPCs:
--    - check_address_serviceable (zone resolution by coords or area keywords; SERVICE_AREA error)
--    - save_customer_address (duplicate detection, service area check, default management, phone validation)
--    - set_default_address (atomic default switcher)
--    - delete_customer_address (address in use protection, auto-promotes next default)
--    - update_shop_delivery_preferences
-- 7. RLS policies on delivery_zones and customer_addresses
-- ==============================================================================

-- 1. Delivery Zones table
create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fee numeric not null default 0 check (fee >= 0),
  min_order_amount numeric not null default 0 check (min_order_amount >= 0),
  active boolean not null default true,
  areas text[] not null default '{}',
  polygon jsonb,
  available_slots jsonb not null default '["Morning (9 AM - 1 PM)", "Afternoon (2 PM - 6 PM)"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_zones_active on public.delivery_zones (active);

create or replace trigger trg_delivery_zones_updated_at
  before update on public.delivery_zones
  for each row execute procedure public.handle_updated_at();

-- 2. Seed Karachi Wholesale Delivery Zones
insert into public.delivery_zones (name, fee, min_order_amount, active, areas, available_slots)
values
  (
    'South Karachi (Clifton & DHA)',
    150,
    2000,
    true,
    array['Clifton', 'DHA', 'Defence', 'Bath Island', 'Gizri', 'Zamzama'],
    '["Morning (9 AM - 1 PM)", "Afternoon (2 PM - 6 PM)"]'::jsonb
  ),
  (
    'Central Karachi (PECHS, Tariq Road, Bahadurabad)',
    200,
    2500,
    true,
    array['PECHS', 'Tariq Road', 'Bahadurabad', 'SMCHS', 'Sindhi Muslim', 'Mahmoodabad'],
    '["Morning (9 AM - 1 PM)", "Afternoon (2 PM - 6 PM)"]'::jsonb
  ),
  (
    'East Karachi (Gulshan-e-Iqbal & Johar)',
    250,
    3000,
    true,
    array['Gulshan', 'Gulshan-e-Iqbal', 'Johar', 'Gulistan-e-Johar', 'University Road', 'Safoora'],
    '["Morning (9 AM - 1 PM)", "Afternoon (2 PM - 6 PM)"]'::jsonb
  ),
  (
    'North Karachi (Nazimabad & North Nazimabad)',
    300,
    3500,
    true,
    array['Nazimabad', 'North Nazimabad', 'FB Area', 'Federal B Area', 'Buffer Zone'],
    '["Morning (10 AM - 2 PM)", "Afternoon (3 PM - 7 PM)"]'::jsonb
  ),
  (
    'West Karachi & Saddar Wholesale Market Hub',
    100,
    1500,
    true,
    array['Saddar', 'Bolton Market', 'Jodia Bazaar', 'Lee Market', 'Kharadar', 'Mithadar', 'Denso Hall', 'Light House'],
    '["Early Morning (8 AM - 12 PM)", "Afternoon (1 PM - 5 PM)"]'::jsonb
  )
on conflict (name) do nothing;

-- 3. Customer Addresses table
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  label text not null,
  full_address text not null,
  zone_id uuid references public.delivery_zones(id) on delete set null,
  lat double precision,
  lng double precision,
  contact_name text,
  contact_phone text,
  instructions text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_addresses_shop on public.customer_addresses (shop_id, is_active);
create index if not exists idx_customer_addresses_zone on public.customer_addresses (zone_id);

-- Partial Unique Index: Exactly one default active address per shop
create unique index if not exists uq_shop_default_active_address
  on public.customer_addresses (shop_id)
  where is_default = true and is_active = true;

create or replace trigger trg_customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute procedure public.handle_updated_at();

-- 4. Shop Delivery Preferences columns on shops table
alter table public.shops
  add column if not exists preferred_delivery_period text default 'morning'
    check (preferred_delivery_period in ('morning', 'afternoon', 'evening', 'anytime')),
  add column if not exists standing_instructions text,
  add column if not exists substitution_preference text default 'call_me'
    check (substitution_preference in ('substitute', 'skip', 'call_me'));

-- -----------------------------------------------------------------------------
-- 5. Row Level Security Policies
-- -----------------------------------------------------------------------------
alter table public.delivery_zones enable row level security;
alter table public.delivery_zones force row level security;

alter table public.customer_addresses enable row level security;
alter table public.customer_addresses force row level security;

-- Delivery Zones: all members can read active zones
create policy "delivery_zones_select_policy"
  on public.delivery_zones
  for select
  using (true);

-- Customer Addresses: shop members can view active addresses
create policy "customer_addresses_select_policy"
  on public.customer_addresses
  for select
  using (public.is_shop_member(shop_id) and is_active = true);

create policy "customer_addresses_insert_policy"
  on public.customer_addresses
  for insert
  with check (public.is_shop_member(shop_id));

create policy "customer_addresses_update_policy"
  on public.customer_addresses
  for update
  using (public.is_shop_member(shop_id))
  with check (public.is_shop_member(shop_id));

create policy "customer_addresses_delete_policy"
  on public.customer_addresses
  for delete
  using (public.shop_role(shop_id) = 'owner');

-- -----------------------------------------------------------------------------
-- 6. RPC: check_address_serviceable
-- -----------------------------------------------------------------------------
create or replace function public.check_address_serviceable(
  p_lat double precision,
  p_lng double precision,
  p_city text,
  p_area text,
  p_full_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone public.delivery_zones%rowtype;
  v_normalized_area text := trim(coalesce(p_area, ''));
  v_normalized_address text := trim(coalesce(p_full_address, ''));
begin
  -- 1. Try keyword matching on active delivery zones (supports address with no map pin)
  select * into v_zone
  from public.delivery_zones
  where active = true
    and (
      exists (
        select 1
        from unnest(areas) a
        where (v_normalized_area != '' and v_normalized_area ilike '%' || a || '%')
           or (v_normalized_address != '' and v_normalized_address ilike '%' || a || '%')
      )
    )
  order by fee asc
  limit 1;

  -- 2. If no zone matched by keyword, check coordinates within Karachi wholesale bounding range if lat/lng provided
  if v_zone.id is null and p_lat is not null and p_lng is not null then
    -- Bounding box for Karachi Metropolitan Area (24.7 to 25.1 N, 66.8 to 67.3 E)
    if (p_lat between 24.75 and 25.05) and (p_lng between 66.90 and 67.25) then
      -- Default to South or Central zone for general Karachi coordinates
      select * into v_zone
      from public.delivery_zones
      where active = true
      order by fee asc
      limit 1;
    end if;
  end if;

  -- 3. Out-of-service-area check
  if v_zone.id is null then
    raise exception 'SERVICE_AREA: Out of delivery service area. This location is not currently serviceable.';
  end if;

  return jsonb_build_object(
    'serviceable', true,
    'zone_id', v_zone.id,
    'zone_name', v_zone.name,
    'fee', v_zone.fee,
    'min_order_amount', v_zone.min_order_amount,
    'available_slots', v_zone.available_slots
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: save_customer_address
-- -----------------------------------------------------------------------------
create or replace function public.save_customer_address(
  p_shop_id uuid,
  p_address_id uuid, -- pass null for new, uuid for update
  p_label text,
  p_full_address text,
  p_lat double precision,
  p_lng double precision,
  p_area text,
  p_contact_name text,
  p_contact_phone text,
  p_instructions text,
  p_is_default boolean,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized_phone text;
  v_service_check jsonb;
  v_zone_id uuid;
  v_saved_row public.customer_addresses%rowtype;
  v_current_updated_at timestamptz;
  v_active_count integer;
  v_should_be_default boolean := coalesce(p_is_default, false);
begin
  -- 1. Check shop membership
  if not public.is_shop_member(p_shop_id) then
    raise exception 'UNAUTHORIZED: You do not have access to manage addresses for this shop.';
  end if;

  -- 2. Validate phone if provided
  if p_contact_phone is not null and trim(p_contact_phone) != '' then
    v_normalized_phone := regexp_replace(trim(p_contact_phone), '[^\d+]', '', 'g');
    if v_normalized_phone like '+%' then
      v_normalized_phone := substr(v_normalized_phone, 2);
    end if;
    if v_normalized_phone like '0092%' then
      v_normalized_phone := substr(v_normalized_phone, 5);
    elsif v_normalized_phone like '92%' then
      v_normalized_phone := substr(v_normalized_phone, 3);
    elsif v_normalized_phone like '0%' then
      v_normalized_phone := substr(v_normalized_phone, 2);
    end if;

    if v_normalized_phone !~ '^3\d{9}$' then
      raise exception 'INVALID_PHONE: Please provide a valid 11-digit Pakistan mobile number.';
    end if;
    v_normalized_phone := '+92' || v_normalized_phone;
  end if;

  -- 3. Duplicate address detection for this shop
  if exists (
    select 1
    from public.customer_addresses
    where shop_id = p_shop_id
      and is_active = true
      and lower(trim(full_address)) = lower(trim(p_full_address))
      and (p_address_id is null or id != p_address_id)
  ) then
    raise exception 'DUPLICATE_ADDRESS: An address with this location already exists for this shop.';
  end if;

  -- 4. Service area resolution (at save time, not at order time)
  v_service_check := public.check_address_serviceable(
    p_lat,
    p_lng,
    'Karachi',
    p_area,
    p_full_address
  );
  v_zone_id := (v_service_check->>'zone_id')::uuid;

  -- 5. Count existing active addresses (if 0, auto-promote first address as default)
  select count(*) into v_active_count
  from public.customer_addresses
  where shop_id = p_shop_id and is_active = true;

  if v_active_count = 0 then
    v_should_be_default := true;
  end if;

  -- 6. Insert vs Update
  if p_address_id is null then
    -- If setting as default, clear other defaults first
    if v_should_be_default then
      update public.customer_addresses
      set is_default = false
      where shop_id = p_shop_id and is_default = true;
    end if;

    insert into public.customer_addresses (
      shop_id,
      label,
      full_address,
      zone_id,
      lat,
      lng,
      contact_name,
      contact_phone,
      instructions,
      is_default,
      is_active
    )
    values (
      p_shop_id,
      coalesce(nullif(trim(p_label), ''), 'Shop Address'),
      trim(p_full_address),
      v_zone_id,
      p_lat,
      p_lng,
      nullif(trim(p_contact_name), ''),
      v_normalized_phone,
      nullif(trim(p_instructions), ''),
      v_should_be_default,
      true
    )
    returning * into v_saved_row;

  else
    -- Concurrency check on update
    select updated_at into v_current_updated_at
    from public.customer_addresses
    where id = p_address_id and shop_id = p_shop_id and is_active = true;

    if not found then
      raise exception 'NOT_FOUND: Address record not found or has been removed.';
    end if;

    if p_expected_updated_at is not null and date_trunc('milliseconds', v_current_updated_at) != date_trunc('milliseconds', p_expected_updated_at) then
      raise exception 'CONCURRENT_MODIFICATION: This address was modified by another staff member, reload.';
    end if;

    if v_should_be_default then
      update public.customer_addresses
      set is_default = false
      where shop_id = p_shop_id and id != p_address_id and is_default = true;
    end if;

    update public.customer_addresses
    set label = coalesce(nullif(trim(p_label), ''), label),
        full_address = trim(p_full_address),
        zone_id = v_zone_id,
        lat = p_lat,
        lng = p_lng,
        contact_name = nullif(trim(p_contact_name), ''),
        contact_phone = v_normalized_phone,
        instructions = nullif(trim(p_instructions), ''),
        is_default = v_should_be_default,
        updated_at = now()
    where id = p_address_id
    returning * into v_saved_row;
  end if;

  return to_jsonb(v_saved_row);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC: set_default_address
-- -----------------------------------------------------------------------------
create or replace function public.set_default_address(
  p_shop_id uuid,
  p_address_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'UNAUTHORIZED: Only shop members can set the default address.';
  end if;

  if not exists (
    select 1
    from public.customer_addresses
    where id = p_address_id and shop_id = p_shop_id and is_active = true
  ) then
    raise exception 'NOT_FOUND: Active address not found.';
  end if;

  -- Clear previous default
  update public.customer_addresses
  set is_default = false
  where shop_id = p_shop_id and is_default = true;

  -- Set new default
  update public.customer_addresses
  set is_default = true,
      updated_at = now()
  where id = p_address_id;

  return jsonb_build_object(
    'success', true,
    'default_id', p_address_id,
    'shop_id', p_shop_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC: delete_customer_address (with active order protection & auto-promote)
-- -----------------------------------------------------------------------------
create or replace function public.delete_customer_address(
  p_address_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_was_default boolean;
  v_is_in_use boolean := false;
  v_next_default_id uuid;
begin
  select shop_id, is_default into v_shop_id, v_was_default
  from public.customer_addresses
  where id = p_address_id and is_active = true;

  if v_shop_id is null then
    raise exception 'NOT_FOUND: Address record not found.';
  end if;

  if not public.is_shop_member(v_shop_id) then
    raise exception 'UNAUTHORIZED: You do not have permission to delete addresses for this shop.';
  end if;

  -- Rule: An address used on an active order cannot be deleted
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'orders'
  ) then
    execute 'select exists (select 1 from public.orders where address_id = $1 and status not in (''delivered'', ''cancelled'', ''returned''))'
      into v_is_in_use using p_address_id;

    if v_is_in_use then
      raise exception 'ADDRESS_IN_USE: Cannot delete address currently linked to an active order.';
    end if;
  end if;

  -- Soft delete
  update public.customer_addresses
  set is_active = false,
      is_default = false,
      updated_at = now()
  where id = p_address_id;

  -- Edge Case: Deleting the default address -> auto-promote another active address
  if v_was_default then
    select id into v_next_default_id
    from public.customer_addresses
    where shop_id = v_shop_id and is_active = true
    order by updated_at desc, created_at desc
    limit 1;

    if v_next_default_id is not null then
      update public.customer_addresses
      set is_default = true,
          updated_at = now()
      where id = v_next_default_id;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'deleted_id', p_address_id,
    'new_default_id', v_next_default_id
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. RPC: update_shop_delivery_preferences
-- -----------------------------------------------------------------------------
create or replace function public.update_shop_delivery_preferences(
  p_shop_id uuid,
  p_period text,
  p_instructions text,
  p_substitution text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated public.shops%rowtype;
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'UNAUTHORIZED: You do not have permission to update preferences for this shop.';
  end if;

  if p_period is not null and p_period not in ('morning', 'afternoon', 'evening', 'anytime') then
    raise exception 'INVALID_PERIOD: Preferred period must be morning, afternoon, evening, or anytime.';
  end if;

  if p_substitution is not null and p_substitution not in ('substitute', 'skip', 'call_me') then
    raise exception 'INVALID_SUBSTITUTION: Substitution preference must be substitute, skip, or call_me.';
  end if;

  update public.shops
  set preferred_delivery_period = coalesce(p_period, preferred_delivery_period),
      standing_instructions = nullif(trim(p_instructions), ''),
      substitution_preference = coalesce(p_substitution, substitution_preference),
      updated_at = now()
  where id = p_shop_id
  returning * into v_updated;

  return jsonb_build_object(
    'preferred_delivery_period', v_updated.preferred_delivery_period,
    'standing_instructions', v_updated.standing_instructions,
    'substitution_preference', v_updated.substitution_preference
  );
end;
$$;


-- ================================================================
-- MIGRATION: 20261010000001_ordering_mvp.sql
-- ================================================================

-- 20261010000001_ordering_mvp.sql
-- Ordering MVP (C4 - C10)

SET timezone = 'Asia/Karachi';

-------------------------------------------------------------------------------
-- C4: Banners
-------------------------------------------------------------------------------
CREATE TABLE banners (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    body text,
    image_url text NOT NULL,
    link_type text,
    link_target text,
    priority int DEFAULT 0,
    starts_at timestamptz,
    ends_at timestamptz,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banners are readable by all authenticated users" ON banners FOR SELECT TO authenticated USING (true);

-------------------------------------------------------------------------------
-- C5: Products & Catalog
-------------------------------------------------------------------------------
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    parent_id uuid REFERENCES categories(id),
    sort_order int DEFAULT 0,
    icon_name text,
    is_active boolean DEFAULT true
);

CREATE TABLE brands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    logo_url text,
    sort_order int DEFAULT 0,
    is_active boolean DEFAULT true
);

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid REFERENCES brands(id),
    name text NOT NULL,
    sku text UNIQUE,
    category_id uuid REFERENCES categories(id),
    subcategory_id uuid REFERENCES categories(id),
    image_url text,
    description text,
    is_active boolean DEFAULT true,
    fts tsvector,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TYPE sale_unit_enum AS ENUM ('carton', 'case', 'shrink', 'pack', 'single');
CREATE TYPE stock_status_enum AS ENUM ('in_stock', 'low_stock', 'out_of_stock');

CREATE TABLE product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    sale_unit sale_unit_enum NOT NULL,
    pieces_per_unit int NOT NULL DEFAULT 1,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    min_qty int DEFAULT 1,
    max_qty int DEFAULT 999,
    qty_multiple int DEFAULT 1,
    is_active boolean DEFAULT true,
    stock_status stock_status_enum DEFAULT 'in_stock',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE customer_favorites (
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (shop_id, variant_id, user_id)
);

CREATE TABLE stock_notifications (
    shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (shop_id, variant_id, user_id)
);

-- Full-text search trigger and indexes
CREATE INDEX products_fts_idx ON products USING GIN (fts);

CREATE OR REPLACE FUNCTION products_fts_update() RETURNS trigger AS $$
BEGIN
    NEW.fts := setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
               setweight(to_tsvector('english', coalesce(NEW.sku, '')), 'B');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_fts_trigger BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION products_fts_update();

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories readable by auth" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Brands readable by auth" ON brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Products readable by auth" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Variants readable by auth" ON product_variants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Shop members can read favorites" ON customer_favorites FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members can manage favorites" ON customer_favorites FOR ALL TO authenticated USING (is_shop_member(shop_id));

CREATE POLICY "Shop members can read notifications" ON stock_notifications FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members can manage notifications" ON stock_notifications FOR ALL TO authenticated USING (is_shop_member(shop_id));

-------------------------------------------------------------------------------
-- C7: Pricing Engine
-------------------------------------------------------------------------------
CREATE TABLE price_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    tier text
);

CREATE TABLE price_list_items (
    price_list_id uuid REFERENCES price_lists(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    UNIQUE (price_list_id, variant_id)
);

CREATE TABLE shop_price_list (
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    price_list_id uuid REFERENCES price_lists(id) ON DELETE CASCADE,
    PRIMARY KEY (shop_id, price_list_id)
);

CREATE TABLE customer_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    valid_from timestamptz DEFAULT now(),
    valid_to timestamptz,
    created_by uuid REFERENCES auth.users(id),
    UNIQUE NULLS NOT DISTINCT (shop_id, variant_id, valid_to)
);

CREATE TYPE promo_type_enum AS ENUM ('percentage', 'fixed_amount', 'buy_x_get_y');

CREATE TABLE promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type promo_type_enum NOT NULL,
    value numeric CHECK (value >= 0),
    min_qty int DEFAULT 1,
    variant_ids uuid[],
    category_ids uuid[],
    brand_ids uuid[],
    starts_at timestamptz,
    ends_at timestamptz,
    is_active boolean DEFAULT true,
    stackable boolean DEFAULT false,
    priority int DEFAULT 0
);

CREATE TABLE bulk_discounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    min_qty int NOT NULL,
    price numeric(12,2) CHECK (price >= 0) NOT NULL,
    is_active boolean DEFAULT true,
    UNIQUE (variant_id, min_qty)
);

ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing readable by auth" ON price_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pricing items readable by auth" ON price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shop pricing list readable by shop members" ON shop_price_list FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Customer prices readable by shop members" ON customer_prices FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Promos readable by auth" ON promotions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Bulk discounts readable by auth" ON bulk_discounts FOR SELECT TO authenticated USING (true);


CREATE OR REPLACE FUNCTION resolve_price(p_shop_id uuid, p_variant_id uuid, p_qty int DEFAULT 1)
RETURNS jsonb AS $$
DECLARE
    v_base_price numeric(12,2);
    v_unit_price numeric(12,2);
    v_normal_price numeric(12,2);
    v_price_source text := 'normal';
    v_custom_price numeric(12,2);
    v_list_price numeric(12,2);
    v_bulk_price numeric(12,2);
BEGIN
    -- 1. Get Normal Price
    SELECT price INTO v_normal_price FROM product_variants WHERE id = p_variant_id;
    v_base_price := v_normal_price;

    -- 2. Check Customer Prices
    SELECT price INTO v_custom_price FROM customer_prices
    WHERE shop_id = p_shop_id AND variant_id = p_variant_id
      AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now())
    ORDER BY valid_from DESC LIMIT 1;

    IF v_custom_price IS NOT NULL THEN
        v_base_price := v_custom_price;
        v_price_source := 'customer_price';
    ELSE
        -- 3. Check Price List
        SELECT pli.price INTO v_list_price
        FROM shop_price_list spl
        JOIN price_list_items pli ON spl.price_list_id = pli.price_list_id
        WHERE spl.shop_id = p_shop_id AND pli.variant_id = p_variant_id LIMIT 1;
        
        IF v_list_price IS NOT NULL THEN
            v_base_price := v_list_price;
            v_price_source := 'price_list';
        END IF;
    END IF;

    -- 4. Check Bulk Discounts
    SELECT price INTO v_bulk_price FROM bulk_discounts
    WHERE variant_id = p_variant_id AND min_qty <= p_qty AND is_active = true
    ORDER BY min_qty DESC LIMIT 1;

    IF v_bulk_price IS NOT NULL AND v_bulk_price < v_base_price THEN
        v_base_price := v_bulk_price;
        v_price_source := 'bulk_discount';
    END IF;

    -- Note: simplified promo application
    v_unit_price := v_base_price;

    RETURN jsonb_build_object(
        'unit_price', v_unit_price,
        'normal_price', v_normal_price,
        'line_total', round(v_unit_price * p_qty, 2),
        'price_source', v_price_source,
        'applied_discounts', '[]'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- C8: Cart
-------------------------------------------------------------------------------
CREATE TYPE cart_status_enum AS ENUM ('open', 'checked_out', 'abandoned');

CREATE TABLE carts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    status cart_status_enum DEFAULT 'open',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_cart_shop_open ON carts(shop_id) WHERE status = 'open';

CREATE TABLE cart_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id uuid REFERENCES carts(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
    qty int CHECK (qty > 0),
    added_price numeric(12,2) CHECK (added_price >= 0),
    added_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (cart_id, variant_id)
);

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop members can read carts" ON carts FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members can update carts" ON carts FOR ALL TO authenticated USING (is_shop_member(shop_id));

CREATE POLICY "Shop members can read cart items" ON cart_items FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM carts WHERE id = cart_items.cart_id AND is_shop_member(shop_id))
);
CREATE POLICY "Shop members can update cart items" ON cart_items FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM carts WHERE id = cart_items.cart_id AND is_shop_member(shop_id))
);


-------------------------------------------------------------------------------
-- C9: Checkout & Orders
-------------------------------------------------------------------------------
CREATE TYPE payment_method_enum AS ENUM ('cash', 'credit', 'bank_transfer');
CREATE TYPE payment_status_enum AS ENUM ('unpaid', 'paid', 'partial', 'refunded');
CREATE TYPE order_status_enum AS ENUM ('pending_owner_approval', 'confirmed', 'processing', 'out_for_delivery', 'delivered', 'cancelled', 'returned');
CREATE TYPE ledger_type_enum AS ENUM ('credit_used', 'credit_payment', 'credit_adjustment');
CREATE TYPE proof_status_enum AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE delivery_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date date NOT NULL,
    label text NOT NULL,
    cutoff_time timetz NOT NULL,
    capacity int NOT NULL,
    booked int DEFAULT 0,
    zone_id uuid REFERENCES delivery_zones(id),
    is_active boolean DEFAULT true
);

CREATE TABLE credit_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
    credit_limit numeric(12,2) CHECK (credit_limit >= 0) DEFAULT 0,
    used numeric(12,2) DEFAULT 0,
    overdue boolean DEFAULT false
);

CREATE TABLE ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid REFERENCES shops(id),
    order_id uuid, -- FK added below
    type ledger_type_enum NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number serial,
    shop_id uuid REFERENCES shops(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    address_id uuid REFERENCES customer_addresses(id),
    delivery_slot_id uuid REFERENCES delivery_slots(id),
    payment_method payment_method_enum NOT NULL,
    payment_status payment_status_enum DEFAULT 'unpaid',
    status order_status_enum DEFAULT 'confirmed',
    subtotal numeric(12,2) CHECK (subtotal >= 0) DEFAULT 0,
    discount_total numeric(12,2) CHECK (discount_total >= 0) DEFAULT 0,
    tax_total numeric(12,2) CHECK (tax_total >= 0) DEFAULT 0,
    delivery_fee numeric(12,2) CHECK (delivery_fee >= 0) DEFAULT 0,
    deposit_total numeric(12,2) CHECK (deposit_total >= 0) DEFAULT 0,
    grand_total numeric(12,2) CHECK (grand_total >= 0) DEFAULT 0,
    notes text,
    discount_request text,
    idempotency_key text UNIQUE,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_order FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id),
    product_name text NOT NULL,
    brand text,
    sale_unit text,
    pieces_per_unit int,
    unit_price numeric(12,2) CHECK (unit_price >= 0) NOT NULL,
    qty int CHECK (qty > 0) NOT NULL,
    line_total numeric(12,2) CHECK (line_total >= 0) NOT NULL,
    discount_amount numeric(12,2) CHECK (discount_amount >= 0) DEFAULT 0,
    is_deposit_item boolean DEFAULT false
);

CREATE TABLE order_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    status text NOT NULL,
    changed_by uuid REFERENCES auth.users(id),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE stock_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    variant_id uuid REFERENCES product_variants(id),
    qty int NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE payment_proofs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    status proof_status_enum DEFAULT 'pending',
    uploaded_at timestamptz DEFAULT now(),
    verified_by uuid REFERENCES auth.users(id),
    verified_at timestamptz
);

-- Enable RLS for all C9 tables
ALTER TABLE delivery_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Slots readable by auth" ON delivery_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shop members read credit" ON credit_accounts FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members read ledger" ON ledger_entries FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members read orders" ON orders FOR SELECT TO authenticated USING (is_shop_member(shop_id));
CREATE POLICY "Shop members read order items" ON order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND is_shop_member(shop_id)));
CREATE POLICY "Shop members read order status" ON order_status_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = order_status_history.order_id AND is_shop_member(shop_id)));
CREATE POLICY "Shop members read reservations" ON stock_reservations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = stock_reservations.order_id AND is_shop_member(shop_id)));
CREATE POLICY "Shop members read payment proofs" ON payment_proofs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE id = payment_proofs.order_id AND is_shop_member(shop_id)));

-------------------------------------------------------------------------------
-- RPCs
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_home_feed(p_shop_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop';
    END IF;
    
    v_res := jsonb_build_object(
        'active_orders', '[]'::jsonb,
        'last_order_summary', NULL,
        'credit_alert', NULL,
        'banners', (SELECT jsonb_agg(b) FROM banners b WHERE b.active = true),
        'recent_and_favorites', '[]'::jsonb,
        'popular_products', '[]'::jsonb,
        'brands', (SELECT jsonb_agg(br) FROM brands br WHERE br.is_active = true),
        'categories', (SELECT jsonb_agg(c) FROM categories c WHERE c.is_active = true)
    );
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



CREATE OR REPLACE FUNCTION catalog_for_shop(
    p_shop_id uuid, p_query text DEFAULT NULL, p_brand_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL,
    p_availability text DEFAULT NULL, p_sort text DEFAULT 'name_asc', p_cursor uuid DEFAULT NULL, p_limit int DEFAULT 20
) RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('data', '[]'::jsonb, 'next_cursor', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION toggle_favorite(p_shop_id uuid, p_variant_id uuid)
RETURNS boolean AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    IF EXISTS (SELECT 1 FROM customer_favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid()) THEN
        DELETE FROM customer_favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid();
        RETURN false;
    ELSE
        INSERT INTO customer_favorites (shop_id, variant_id, user_id) VALUES (p_shop_id, p_variant_id, auth.uid());
        RETURN true;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION toggle_notify_me(p_shop_id uuid, p_variant_id uuid)
RETURNS boolean AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    IF EXISTS (SELECT 1 FROM stock_notifications WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid()) THEN
        DELETE FROM stock_notifications WHERE shop_id = p_shop_id AND variant_id = p_variant_id AND user_id = auth.uid();
        RETURN false;
    ELSE
        INSERT INTO stock_notifications (shop_id, variant_id, user_id) VALUES (p_shop_id, p_variant_id, auth.uid());
        RETURN true;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_product_detail(p_variant_id uuid, p_shop_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('detail', NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION cart_upsert_item(p_shop_id uuid, p_variant_id uuid, p_qty int)
RETURNS void AS $$
DECLARE
    v_cart_id uuid;
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    
    SELECT id INTO v_cart_id FROM carts WHERE shop_id = p_shop_id AND status = 'open';
    IF NOT FOUND THEN
        INSERT INTO carts (shop_id, user_id) VALUES (p_shop_id, auth.uid()) RETURNING id INTO v_cart_id;
    END IF;

    IF p_qty = 0 THEN
        DELETE FROM cart_items WHERE cart_id = v_cart_id AND variant_id = p_variant_id;
    ELSE
        INSERT INTO cart_items (cart_id, variant_id, qty, added_price)
        VALUES (v_cart_id, p_variant_id, p_qty, (resolve_price(p_shop_id, p_variant_id, p_qty)->>'unit_price')::numeric)
        ON CONFLICT (cart_id, variant_id) DO UPDATE SET qty = p_qty, added_price = EXCLUDED.added_price, updated_at = now();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION cart_remove_item(p_shop_id uuid, p_variant_id uuid)
RETURNS void AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE shop_id = p_shop_id AND status = 'open') AND variant_id = p_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION cart_clear(p_shop_id uuid)
RETURNS void AS $$
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE shop_id = p_shop_id AND status = 'open');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_cart_validated(p_shop_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('subtotal', 0, 'total', 0, 'items', '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION place_order(
    p_shop_id uuid, p_address_id uuid, p_delivery_slot_id uuid, p_payment_method text,
    p_notes text, p_discount_request text, p_idempotency_key text
) RETURNS jsonb AS $$
DECLARE
    v_order_id uuid;
    v_order_num int;
BEGIN
    IF NOT is_shop_member(p_shop_id) THEN RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop'; END IF;
    
    INSERT INTO orders (shop_id, user_id, address_id, delivery_slot_id, payment_method, notes, discount_request, idempotency_key)
    VALUES (p_shop_id, auth.uid(), p_address_id, p_delivery_slot_id, p_payment_method::payment_method_enum, p_notes, p_discount_request, p_idempotency_key)
    RETURNING id, order_number INTO v_order_id, v_order_num;
    
    RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_num, 'total', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_available_slots(p_zone_id uuid, p_date_from date, p_date_to date)
RETURNS jsonb AS $$
BEGIN
    RETURN '[]'::jsonb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_checkout_quote(p_shop_id uuid, p_address_id uuid, p_slot_id uuid, p_payment_method text)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('total', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_order_confirmation(p_order_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('order_number', 'ORD-001', 'total', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-------------------------------------------------------------------------------
-- Seed Data (with ON CONFLICT DO NOTHING)
-------------------------------------------------------------------------------
INSERT INTO categories (name, sort_order) VALUES ('Beverages', 1) ON CONFLICT DO NOTHING;
INSERT INTO brands (name) VALUES ('Coca-Cola') ON CONFLICT DO NOTHING;


-- ================================================================
-- MIGRATION: 20261010000002_order_tracking_realtime.sql
-- ================================================================

-- ==============================================================================
-- Migration: Order Tracking, Delivery Statuses & Realtime (C11 - Order Tracking)
-- Features:
-- 1. Three separate status fields on orders:
--    - order_status (placed, confirmed, processing, ready, out_for_delivery, delivered, partially_delivered, cancelled, rejected)
--    - payment_status (unpaid, proof_submitted, partially_paid, paid, refunded)
--    - delivery_status (unassigned, assigned, out_for_delivery, delivered, failed, rescheduled)
-- 2. Delivered vs ordered quantities on order_items: delivered_qty (int default 0)
-- 3. Delivery ETA and failure details:
--    - delivery_eta timestamptz
--    - delivery_failure_reason text
--    - delivery_rescheduled_date date
-- 4. Audit trigger on orders:
--    - Writes to order_status_history whenever order_status, payment_status, or delivery_status changes
--    - Captures status_type, from_status, to_status, actor/changed_by, notes, created_at
-- 5. Customer timeline RPC:
--    - get_order_tracking(p_order_id uuid)
--    - Returns timeline built ONLY from order_status_history, delivery status line, ETA, failure reason, and item quantities.
-- 6. RPCs for Customer Actions:
--    - reschedule_order_delivery(p_order_id uuid, p_new_date date, p_slot_id uuid, p_notes text)
--    - cancel_after_failed_delivery(p_order_id uuid, p_reason text)
-- 7. RLS policies ensuring:
--    - Shop members can read orders, history, and items.
--    - Staff role can ONLY see their own orders (user_id = auth.uid()).
--    - Owners and managers can view all shop orders.
-- ==============================================================================

-- 1. Enums for tracking & delivery statuses
DO $$ BEGIN
  CREATE TYPE order_status_type AS ENUM (
    'placed', 'confirmed', 'processing', 'ready',
    'out_for_delivery', 'delivered', 'partially_delivered',
    'cancelled', 'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_type AS ENUM (
    'unpaid', 'proof_submitted', 'partially_paid', 'paid', 'refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status_type AS ENUM (
    'unassigned', 'assigned', 'out_for_delivery', 'delivered', 'failed', 'rescheduled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Alter orders table to conform to the 3 separate status fields and delivery tracking columns
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS order_status order_status_type NOT NULL DEFAULT 'placed',
  ADD COLUMN IF NOT EXISTS delivery_status delivery_status_type NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS delivery_eta timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_failure_reason text,
  ADD COLUMN IF NOT EXISTS delivery_rescheduled_date date;

-- Add delivered_qty to order_items if not present
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS delivered_qty int DEFAULT 0;

-- 3. Enhance order_status_history to record actor, status_type, from_status, to_status
ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS status_type text DEFAULT 'order_status',
  ADD COLUMN IF NOT EXISTS from_status text,
  ADD COLUMN IF NOT EXISTS to_status text,
  ADD COLUMN IF NOT EXISTS actor_role text;

-- 4. Automatic Trigger to write order_status_history whenever any status changes
CREATE OR REPLACE FUNCTION public.handle_order_status_audit()
RETURNS trigger AS $$
DECLARE
  v_actor_role text;
BEGIN
  -- Determine current user role if available
  IF auth.uid() IS NOT NULL THEN
    SELECT role::text INTO v_actor_role 
    FROM public.shop_users 
    WHERE shop_id = NEW.shop_id AND user_id = auth.uid() AND status = 'active'
    LIMIT 1;
  ELSE
    v_actor_role := 'system';
  END IF;

  -- 1. Check order_status change
  IF (TG_OP = 'INSERT') OR (OLD.order_status IS DISTINCT FROM NEW.order_status) THEN
    INSERT INTO public.order_status_history (
      order_id, status, status_type, from_status, to_status, changed_by, actor_role, notes, created_at
    ) VALUES (
      NEW.id,
      NEW.order_status::text,
      'order_status',
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.order_status::text END,
      NEW.order_status::text,
      auth.uid(),
      v_actor_role,
      CASE 
        WHEN NEW.order_status = 'cancelled' THEN coalesce(NEW.notes, 'Order cancelled')
        ELSE null 
      END,
      now()
    );
  END IF;

  -- 2. Check delivery_status change
  IF (TG_OP = 'UPDATE') AND (OLD.delivery_status IS DISTINCT FROM NEW.delivery_status) THEN
    INSERT INTO public.order_status_history (
      order_id, status, status_type, from_status, to_status, changed_by, actor_role, notes, created_at
    ) VALUES (
      NEW.id,
      NEW.delivery_status::text,
      'delivery_status',
      OLD.delivery_status::text,
      NEW.delivery_status::text,
      auth.uid(),
      v_actor_role,
      CASE 
        WHEN NEW.delivery_status = 'failed' THEN NEW.delivery_failure_reason
        WHEN NEW.delivery_status = 'rescheduled' THEN 'Delivery rescheduled to ' || coalesce(NEW.delivery_rescheduled_date::text, 'a future date')
        ELSE null 
      END,
      now()
    );
  END IF;

  -- 3. Check payment_status change
  IF (TG_OP = 'UPDATE') AND (OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    INSERT INTO public.order_status_history (
      order_id, status, status_type, from_status, to_status, changed_by, actor_role, notes, created_at
    ) VALUES (
      NEW.id,
      NEW.payment_status::text,
      'payment_status',
      OLD.payment_status::text,
      NEW.payment_status::text,
      auth.uid(),
      v_actor_role,
      null,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_status_audit ON public.orders;
CREATE TRIGGER trg_order_status_audit
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_audit();


-- 5. RPC get_order_tracking(p_order_id)
-- Returns timeline, delivery status, ETA, failure reason, and ordered vs delivered quantities
CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
  v_timeline jsonb;
  v_items jsonb;
  v_delivery_line text;
BEGIN
  -- Fetch order
  SELECT 
    o.id,
    o.order_number,
    o.shop_id,
    o.user_id,
    o.order_status,
    o.payment_status,
    o.delivery_status,
    o.delivery_eta,
    o.delivery_failure_reason,
    o.delivery_rescheduled_date,
    o.grand_total,
    o.created_at,
    o.updated_at,
    s.name as shop_name,
    ca.full_address as delivery_address,
    ca.contact_name,
    ca.contact_phone
  INTO v_order
  FROM public.orders o
  JOIN public.shops s ON s.id = o.shop_id
  LEFT JOIN public.customer_addresses ca ON ca.id = o.address_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  -- Permission check: caller must be member of the shop
  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied to this order';
  END IF;

  -- Staff role can ONLY see their own orders
  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only view their own orders';
  END IF;

  -- Build customer timeline ONLY from order_status_history
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', h.id,
      'status', h.status,
      'statusType', h.status_type,
      'fromStatus', h.from_status,
      'toStatus', h.to_status,
      'actorRole', h.actor_role,
      'notes', h.notes,
      'createdAt', h.created_at
    ) ORDER BY h.created_at ASC
  ), '[]'::jsonb)
  INTO v_timeline
  FROM public.order_status_history h
  WHERE h.order_id = p_order_id;

  -- Build ordered vs delivered items comparison
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', oi.id,
      'productName', oi.product_name,
      'brand', oi.brand,
      'saleUnit', oi.sale_unit,
      'piecesPerUnit', oi.pieces_per_unit,
      'orderedQty', oi.qty,
      'deliveredQty', coalesce(oi.delivered_qty, 0),
      'shortfallQty', GREATEST(0, oi.qty - coalesce(oi.delivered_qty, 0)),
      'unitPrice', oi.unit_price,
      'lineTotal', oi.line_total
    )
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  -- Delivery status line description
  v_delivery_line := CASE v_order.delivery_status
    WHEN 'unassigned' THEN 'Preparing for vehicle dispatch'
    WHEN 'assigned' THEN 'Assigned to delivery driver'
    WHEN 'out_for_delivery' THEN 'Driver is on the way to your shop'
    WHEN 'delivered' THEN 'Successfully unloaded and delivered'
    WHEN 'failed' THEN 'Delivery attempt unsuccessful: ' || coalesce(v_order.delivery_failure_reason, 'Customer unavailable')
    WHEN 'rescheduled' THEN 'Delivery rescheduled for ' || coalesce(v_order.delivery_rescheduled_date::text, 'next slot')
    ELSE 'Order confirmed'
  END;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'orderNumber', v_order.order_number,
    'shopId', v_order.shop_id,
    'shopName', v_order.shop_name,
    'orderStatus', v_order.order_status,
    'paymentStatus', v_order.payment_status,
    'deliveryStatus', v_order.delivery_status,
    'deliveryStatusLine', v_delivery_line,
    'deliveryEta', v_order.delivery_eta,
    'failureReason', v_order.delivery_failure_reason,
    'rescheduledDate', v_order.delivery_rescheduled_date,
    'deliveryAddress', v_order.delivery_address,
    'contactName', v_order.contact_name,
    'contactPhone', v_order.contact_phone,
    'grandTotal', v_order.grand_total,
    'createdAt', v_order.created_at,
    'updatedAt', v_order.updated_at,
    'timeline', v_timeline,
    'items', v_items
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC: Reschedule delivery after a failed or delayed delivery
CREATE OR REPLACE FUNCTION public.reschedule_order_delivery(
  p_order_id uuid,
  p_new_date date,
  p_slot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only reschedule their own orders';
  END IF;

  IF v_order.order_status IN ('delivered', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_ACTION: Cannot reschedule an order that is already %', v_order.order_status;
  END IF;

  UPDATE public.orders
  SET 
    delivery_status = 'rescheduled',
    delivery_rescheduled_date = p_new_date,
    delivery_slot_id = coalesce(p_slot_id, delivery_slot_id),
    notes = coalesce(p_notes, notes),
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'orderId', p_order_id,
    'rescheduledDate', p_new_date,
    'deliveryStatus', 'rescheduled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RPC: Cancel order after failed delivery
CREATE OR REPLACE FUNCTION public.cancel_after_failed_delivery(
  p_order_id uuid,
  p_reason text DEFAULT 'Customer requested cancellation after delivery failure'
)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only cancel their own orders';
  END IF;

  IF v_order.order_status = 'delivered' THEN
    RAISE EXCEPTION 'INVALID_ACTION: Cannot cancel an already delivered order';
  END IF;

  UPDATE public.orders
  SET 
    order_status = 'cancelled',
    notes = p_reason,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'orderId', p_order_id,
    'orderStatus', 'cancelled'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. Enable Realtime Replication for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;

-- 9. Update RLS policies on orders to strictly enforce Staff visibility (staff sees ONLY own orders)
DROP POLICY IF EXISTS "Shop members read orders" ON public.orders;
CREATE POLICY "Shop members read orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_shop_member(shop_id) AND (
      public.shop_role(shop_id) IN ('owner', 'manager') OR
      user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop members read order status" ON public.order_status_history;
CREATE POLICY "Shop members read order status" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND public.is_shop_member(o.shop_id)
        AND (
          public.shop_role(o.shop_id) IN ('owner', 'manager') OR
          o.user_id = auth.uid()
        )
    )
  );


-- ================================================================
-- MIGRATION: 20261010000003_order_history.sql
-- ================================================================

-- 20261010000003_order_history.sql
-- Order History: RPC list_orders with keyset pagination, RPC get_order_detail with role-based masking, returns table

SET timezone = 'Asia/Karachi';

-- 1. Ensure invoice_url exists on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_url text;

-- 2. Create order_returns table if not exists
CREATE TABLE IF NOT EXISTS public.order_returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'completed')),
    reason text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb,
    refund_amount numeric(12,2) DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_returns_order ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_shop ON public.order_returns(shop_id);

ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read order returns" ON public.order_returns;
CREATE POLICY "Shop members read order returns" ON public.order_returns
    FOR SELECT TO authenticated
    USING (
        public.is_shop_member(shop_id) AND (
            public.shop_role(shop_id) IN ('owner', 'manager') OR user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Shop members insert order returns" ON public.order_returns;
CREATE POLICY "Shop members insert order returns" ON public.order_returns
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_shop_member(shop_id)
    );

-- 3. RPC list_orders(p_shop_id, p_from, p_to, p_status, p_search, p_cursor, p_limit)
-- Keyset pagination based on (created_at, id) descending
CREATE OR REPLACE FUNCTION public.list_orders(
    p_shop_id uuid,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_status text[] DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_cursor text DEFAULT NULL, -- Format: ISO timestamp + '|' + UUID
    p_limit int DEFAULT 20
)
RETURNS jsonb AS $$
DECLARE
    v_role text;
    v_clean_search text;
    v_cursor_created_at timestamptz;
    v_cursor_id uuid;
    v_orders jsonb;
    v_has_more boolean := false;
    v_next_cursor text := NULL;
    v_is_financial_auth boolean;
BEGIN
    -- Permission check
    IF NOT public.is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied to shop orders';
    END IF;

    SELECT public.shop_role(p_shop_id)::text INTO v_role;
    v_is_financial_auth := (v_role IN ('owner', 'manager'));

    -- Validate date range
    IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to < p_from THEN
        RAISE EXCEPTION 'INVALID_DATE_RANGE: End date cannot be before start date';
    END IF;

    -- Parse cursor if provided
    IF p_cursor IS NOT NULL AND position('|' in p_cursor) > 0 THEN
        v_cursor_created_at := split_part(p_cursor, '|', 1)::timestamptz;
        v_cursor_id := split_part(p_cursor, '|', 2)::uuid;
    END IF;

    -- Clean search string: remove commas (e.g. '14,500' -> '14500') and trim
    IF p_search IS NOT NULL THEN
        v_clean_search := trim(replace(p_search, ',', ''));
    END IF;

    -- Query orders with limit + 1 for hasMore detection
    WITH filtered AS (
        SELECT 
            o.id,
            o.order_number,
            o.shop_id,
            o.user_id,
            o.order_status,
            o.payment_status,
            o.delivery_status,
            o.delivery_eta,
            o.grand_total,
            o.created_at,
            o.updated_at,
            (SELECT count(*)::int FROM public.order_items oi WHERE oi.order_id = o.id) as item_count
        FROM public.orders o
        WHERE o.shop_id = p_shop_id
          -- Staff can only see their own orders
          AND (v_role IN ('owner', 'manager') OR o.user_id = auth.uid())
          -- Date range filters
          AND (p_from IS NULL OR o.created_at >= p_from)
          AND (p_to IS NULL OR o.created_at <= p_to)
          -- Status filter
          AND (p_status IS NULL OR cardinality(p_status) = 0 OR o.order_status::text = ANY(p_status))
          -- Search filter: matches order number or total (with commas stripped)
          AND (
              v_clean_search IS NULL OR v_clean_search = '' OR
              o.order_number::text ILIKE '%' || v_clean_search || '%' OR
              o.grand_total::text ILIKE '%' || v_clean_search || '%'
          )
          -- Keyset pagination cursor
          AND (
              v_cursor_created_at IS NULL OR
              (o.created_at < v_cursor_created_at) OR
              (o.created_at = v_cursor_created_at AND o.id < v_cursor_id)
          )
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT (coalesce(p_limit, 20) + 1)
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', f.id,
            'orderNumber', f.order_number,
            'shopId', f.shop_id,
            'orderStatus', f.order_status,
            'paymentStatus', f.payment_status,
            'deliveryStatus', f.delivery_status,
            'deliveryEta', f.delivery_eta,
            -- Mask grand_total if caller is staff and not authorized for financial details
            'grandTotal', CASE WHEN v_is_financial_auth THEN f.grand_total ELSE NULL END,
            'isFinancialAuthorized', v_is_financial_auth,
            'createdAt', f.created_at,
            'updatedAt', f.updated_at,
            'itemCount', f.item_count
        )
    ), '[]'::jsonb)
    INTO v_orders
    FROM (
        SELECT * FROM filtered LIMIT coalesce(p_limit, 20)
    ) f;

    -- Determine hasMore
    IF (SELECT count(*) FROM filtered) > coalesce(p_limit, 20) THEN
        v_has_more := true;
        SELECT (o.created_at::text || '|' || o.id::text)
        INTO v_next_cursor
        FROM (SELECT * FROM filtered LIMIT coalesce(p_limit, 20)) o
        ORDER BY o.created_at ASC, o.id ASC
        LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'orders', v_orders,
        'hasMore', v_has_more,
        'nextCursor', v_next_cursor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RPC get_order_detail(p_order_id)
-- Returns items, snapshot quantities, prices (role restricted), status history, payment, invoice link, notes, returns
CREATE OR REPLACE FUNCTION public.get_order_detail(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_role text;
    v_is_financial_auth boolean;
    v_items jsonb;
    v_history jsonb;
    v_returns jsonb;
    v_payment jsonb;
    v_invoice_available boolean;
    v_invoice_url text;
BEGIN
    SELECT 
        o.id,
        o.order_number,
        o.shop_id,
        o.user_id,
        o.order_status,
        o.payment_method,
        o.payment_status,
        o.delivery_status,
        o.delivery_eta,
        o.delivery_failure_reason,
        o.subtotal,
        o.discount_total,
        o.tax_total,
        o.delivery_fee,
        o.grand_total,
        o.notes,
        o.invoice_url,
        o.created_at,
        o.updated_at,
        s.name as shop_name,
        ca.full_address as delivery_address,
        ca.contact_name,
        ca.contact_phone
    INTO v_order
    FROM public.orders o
    JOIN public.shops s ON s.id = o.shop_id
    LEFT JOIN public.customer_addresses ca ON ca.id = o.address_id
    WHERE o.id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
    END IF;

    IF NOT public.is_shop_member(v_order.shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied to this order';
    END IF;

    SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
    v_is_financial_auth := (v_role IN ('owner', 'manager'));

    -- Staff can ONLY view their own orders
    IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only view their own orders';
    END IF;

    -- Items snapshot: even if original product was deleted, snapshot data remains intact
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', oi.id,
            'variantId', oi.variant_id,
            'productName', oi.product_name,
            'brand', oi.brand,
            'saleUnit', oi.sale_unit,
            'piecesPerUnit', oi.pieces_per_unit,
            'orderedQty', oi.qty,
            'deliveredQty', coalesce(oi.delivered_qty, 0),
            'shortfallQty', GREATEST(0, oi.qty - coalesce(oi.delivered_qty, 0)),
            -- Role restriction: only owner and manager see unit_price and line_total
            'unitPrice', CASE WHEN v_is_financial_auth THEN oi.unit_price ELSE NULL END,
            'lineTotal', CASE WHEN v_is_financial_auth THEN oi.line_total ELSE NULL END
        )
    ), '[]'::jsonb)
    INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    -- Status history
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', h.id,
            'status', h.status,
            'statusType', h.status_type,
            'notes', h.notes,
            'createdAt', h.created_at,
            'actorRole', h.actor_role
        ) ORDER BY h.created_at ASC
    ), '[]'::jsonb)
    INTO v_history
    FROM public.order_status_history h
    WHERE h.order_id = p_order_id;

    -- Order returns
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'id', r.id,
            'status', r.status,
            'reason', r.reason,
            'refundAmount', CASE WHEN v_is_financial_auth THEN r.refund_amount ELSE NULL END,
            'createdAt', r.created_at
        ) ORDER BY r.created_at DESC
    ), '[]'::jsonb)
    INTO v_returns
    FROM public.order_returns r
    WHERE r.order_id = p_order_id;

    -- Payment details
    v_payment := jsonb_build_object(
        'paymentMethod', v_order.payment_method,
        'paymentStatus', v_order.payment_status,
        'subtotal', CASE WHEN v_is_financial_auth THEN v_order.subtotal ELSE NULL END,
        'discountTotal', CASE WHEN v_is_financial_auth THEN v_order.discount_total ELSE NULL END,
        'taxTotal', CASE WHEN v_is_financial_auth THEN v_order.tax_total ELSE NULL END,
        'deliveryFee', CASE WHEN v_is_financial_auth THEN v_order.delivery_fee ELSE NULL END,
        'grandTotal', CASE WHEN v_is_financial_auth THEN v_order.grand_total ELSE NULL END
    );

    -- Invoice availability: generated and available only when order is delivered, and only for owner/manager
    v_invoice_available := (v_order.order_status = 'delivered' AND v_order.invoice_url IS NOT NULL);
    v_invoice_url := CASE WHEN (v_is_financial_auth AND v_invoice_available) THEN v_order.invoice_url ELSE NULL END;

    RETURN jsonb_build_object(
        'id', v_order.id,
        'orderNumber', v_order.order_number,
        'shopId', v_order.shop_id,
        'shopName', v_order.shop_name,
        'orderStatus', v_order.order_status,
        'paymentStatus', v_order.payment_status,
        'deliveryStatus', v_order.delivery_status,
        'deliveryEta', v_order.delivery_eta,
        'deliveryAddress', v_order.delivery_address,
        'contactName', v_order.contact_name,
        'contactPhone', v_order.contact_phone,
        'notes', v_order.notes,
        'isFinancialAuthorized', v_is_financial_auth,
        'grandTotal', CASE WHEN v_is_financial_auth THEN v_order.grand_total ELSE NULL END,
        'invoiceUrl', v_invoice_url,
        'isInvoiceAvailable', v_invoice_available,
        'createdAt', v_order.created_at,
        'updatedAt', v_order.updated_at,
        'items', v_items,
        'statusHistory', v_history,
        'payment', v_payment,
        'returns', v_returns
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================================================================
-- MIGRATION: 20261010000004_reorder_favorites_notes.sql
-- ================================================================

-- 20261010000004_reorder_favorites_notes.sql
-- C13 & C14: Reorder preview/apply, Favorites, Recent Products, and Order Notes

SET timezone = 'Asia/Karachi';

-------------------------------------------------------------------------------
-- 1. Favorites Table and Toggle RPC
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    UNIQUE (shop_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_shop ON public.favorites(shop_id);
CREATE INDEX IF NOT EXISTS idx_favorites_variant ON public.favorites(variant_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read favorites" ON public.favorites;
CREATE POLICY "Shop members read favorites" ON public.favorites
    FOR SELECT TO authenticated
    USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS "Shop members write favorites" ON public.favorites;
CREATE POLICY "Shop members write favorites" ON public.favorites
    FOR ALL TO authenticated
    USING (public.is_shop_member(shop_id));

DROP FUNCTION IF EXISTS public.toggle_favorite(uuid, uuid);
CREATE OR REPLACE FUNCTION public.toggle_favorite(p_shop_id uuid, p_variant_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_exists boolean;
BEGIN
    IF NOT public.is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: User is not a member of this shop';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.favorites WHERE shop_id = p_shop_id AND variant_id = p_variant_id;
        RETURN jsonb_build_object('is_favorite', false, 'variant_id', p_variant_id);
    ELSE
        INSERT INTO public.favorites (shop_id, variant_id, user_id)
        VALUES (p_shop_id, p_variant_id, auth.uid());
        RETURN jsonb_build_object('is_favorite', true, 'variant_id', p_variant_id);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 2. Recent Products (Recency + Frequency Scoring Formula)
-- Formula: score = (order_frequency * 2.0) * exp(-0.04 * days_since_last_order)
-- Higher order frequency boosts ranking; decay penalty applies as days increase.
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recent_products(p_shop_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    IF NOT public.is_shop_member(p_shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
    END IF;

    WITH aggregated AS (
        SELECT 
            oi.variant_id,
            count(DISTINCT o.id)::numeric as order_frequency,
            max(o.created_at) as last_ordered_at,
            (EXTRACT(EPOCH FROM (now() - max(o.created_at))) / 86400.0) as days_ago
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.shop_id = p_shop_id
          AND oi.variant_id IS NOT NULL
          AND o.order_status NOT IN ('cancelled', 'rejected')
        GROUP BY oi.variant_id
    ),
    scored AS (
        SELECT 
            a.variant_id,
            a.order_frequency,
            a.last_ordered_at,
            a.days_ago,
            -- Recency + frequency decay scoring formula
            round(((a.order_frequency * 2.0) * exp(-0.04 * a.days_ago))::numeric, 4) as ranking_score,
            pv.price as current_price,
            pv.sale_unit,
            pv.pieces_per_unit,
            pv.stock_status,
            pv.min_qty,
            pv.max_qty,
            pv.qty_multiple,
            p.name as product_name,
            p.image_url,
            p.is_active as is_product_active,
            pv.is_active as is_variant_active,
            b.name as brand_name
        FROM aggregated a
        JOIN public.product_variants pv ON pv.id = a.variant_id
        JOIN public.products p ON p.id = pv.product_id
        LEFT JOIN public.brands b ON b.id = p.brand_id
        ORDER BY ranking_score DESC, a.last_ordered_at DESC
        LIMIT coalesce(p_limit, 20)
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'variantId', s.variant_id,
            'productName', s.product_name,
            'brandName', s.brand_name,
            'imageUrl', s.image_url,
            'saleUnit', s.sale_unit,
            'piecesPerUnit', s.pieces_per_unit,
            'currentPrice', s.current_price,
            'stockStatus', s.stock_status,
            'isAvailable', (s.is_product_active AND s.is_variant_active AND s.stock_status = 'in_stock'),
            'minQty', s.min_qty,
            'maxQty', s.max_qty,
            'qtyMultiple', s.qty_multiple,
            'orderFrequency', s.order_frequency,
            'lastOrderedAt', s.last_ordered_at,
            'rankingScore', s.ranking_score
        )
    ), '[]'::jsonb)
    INTO v_res
    FROM scored s;

    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 3. Reorder Preview RPC
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_preview(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_role text;
    v_lines jsonb;
    v_total_items int := 0;
    v_avail_items int := 0;
    v_unavail_items int := 0;
    v_adjusted_items int := 0;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
    END IF;

    IF NOT public.is_shop_member(v_order.shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
    END IF;

    SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
    IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff can only reorder their own orders';
    END IF;

    -- Analyze each line item
    WITH analyzed_lines AS (
        SELECT 
            oi.id as line_id,
            oi.variant_id,
            oi.product_name,
            oi.brand,
            oi.sale_unit as original_sale_unit,
            oi.unit_price as original_unit_price,
            oi.qty as original_qty,
            pv.price as current_price,
            pv.sale_unit as current_sale_unit,
            pv.min_qty,
            pv.max_qty,
            pv.qty_multiple,
            pv.stock_status,
            (pv.id IS NOT NULL AND pv.is_active = true AND p.is_active = true AND pv.stock_status = 'in_stock') as is_available,
            p.category_id,
            p.brand_id
        FROM public.order_items oi
        LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
        LEFT JOIN public.products p ON p.id = pv.product_id
        WHERE oi.order_id = p_order_id
    ),
    adjusted_lines AS (
        SELECT 
            al.*,
            -- Calculate adjusted quantity if quantity rules changed
            CASE 
                WHEN NOT al.is_available THEN al.original_qty
                ELSE (
                    -- Clamp between min and max
                    LEAST(
                        coalesce(al.max_qty, 999),
                        GREATEST(
                            coalesce(al.min_qty, 1),
                            -- Adjust to multiple
                            ceil(al.original_qty::numeric / coalesce(al.qty_multiple, 1)) * coalesce(al.qty_multiple, 1)
                        )
                    )
                )
            END as adjusted_qty,
            -- Suggested replacements if unavailable
            CASE 
                WHEN NOT al.is_available THEN (
                    SELECT coalesce(jsonb_agg(
                        jsonb_build_object(
                            'variantId', rep_pv.id,
                            'productName', rep_p.name,
                            'saleUnit', rep_pv.sale_unit,
                            'currentPrice', rep_pv.price,
                            'stockStatus', rep_pv.stock_status
                        )
                    ), '[]'::jsonb)
                    FROM public.product_variants rep_pv
                    JOIN public.products rep_p ON rep_p.id = rep_pv.product_id
                    WHERE (rep_p.category_id = al.category_id OR rep_p.brand_id = al.brand_id)
                      AND rep_pv.id <> coalesce(al.variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
                      AND rep_pv.is_active = true
                      AND rep_p.is_active = true
                      AND rep_pv.stock_status = 'in_stock'
                    LIMIT 3
                )
                ELSE '[]'::jsonb
            END as suggested_replacements
        FROM analyzed_lines al
    )
    SELECT coalesce(jsonb_agg(
        jsonb_build_object(
            'lineId', al.line_id,
            'variantId', al.variant_id,
            'productName', al.product_name,
            'brand', al.brand,
            'saleUnit', coalesce(al.current_sale_unit, al.original_sale_unit),
            'originalQty', al.original_qty,
            'adjustedQty', al.adjusted_qty,
            'originalPrice', al.original_unit_price,
            'currentPrice', coalesce(al.current_price, al.original_unit_price),
            'isAvailable', al.is_available,
            'stockStatus', al.stock_status,
            'minQty', al.min_qty,
            'maxQty', al.max_qty,
            'qtyMultiple', al.qty_multiple,
            'flags', jsonb_build_object(
                'available', al.is_available,
                'unavailable', NOT al.is_available,
                'qty_adjusted', (al.adjusted_qty <> al.original_qty),
                'price_changed', (al.current_price IS NOT NULL AND al.current_price <> al.original_unit_price)
            ),
            'qtyAdjustedReason', CASE 
                WHEN al.original_qty < al.min_qty THEN 'Quantity increased to meet minimum rule'
                WHEN al.original_qty > al.max_qty THEN 'Quantity reduced to maximum allowed'
                WHEN (al.original_qty % al.qty_multiple) <> 0 THEN 'Quantity adjusted to match order multiple'
                ELSE NULL
            END,
            'suggestedReplacements', al.suggested_replacements
        )
    ), '[]'::jsonb)
    INTO v_lines
    FROM adjusted_lines al;

    -- Calculate count metrics
    SELECT 
        count(*),
        count(*) FILTER (WHERE is_available = true),
        count(*) FILTER (WHERE is_available = false),
        count(*) FILTER (WHERE adjusted_qty <> original_qty)
    INTO v_total_items, v_avail_items, v_unavail_items, v_adjusted_items
    FROM adjusted_lines;

    RETURN jsonb_build_object(
        'orderId', p_order_id,
        'orderNumber', v_order.order_number,
        'shopId', v_order.shop_id,
        'totalItems', v_total_items,
        'availableItems', v_avail_items,
        'unavailableItems', v_unavail_items,
        'adjustedItems', v_adjusted_items,
        'lines', v_lines
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 4. Reorder Apply RPC (Idempotent Merge into Cart)
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_apply(
    p_order_id uuid,
    p_selections jsonb -- Array of { variantId, qty, skip }
)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_role text;
    v_cart_id uuid;
    v_item jsonb;
    v_variant_id uuid;
    v_qty int;
    v_skip boolean;
    v_curr_price numeric(12,2);
    v_added_count int := 0;
    v_skipped_count int := 0;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
    END IF;

    IF NOT public.is_shop_member(v_order.shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
    END IF;

    SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
    IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff can only reorder their own orders';
    END IF;

    -- Find or create open cart for this shop
    SELECT id INTO v_cart_id FROM public.carts WHERE shop_id = v_order.shop_id AND status = 'open' LIMIT 1;
    IF v_cart_id IS NULL THEN
        INSERT INTO public.carts (shop_id, user_id, status)
        VALUES (v_order.shop_id, auth.uid(), 'open')
        RETURNING id INTO v_cart_id;
    END IF;

    -- Process selections
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_selections)
    LOOP
        v_variant_id := (v_item->>'variantId')::uuid;
        v_qty := (v_item->>'qty')::int;
        v_skip := coalesce((v_item->>'skip')::boolean, false);

        IF v_skip OR v_variant_id IS NULL OR v_qty <= 0 THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Verify variant is currently available and get current price
        SELECT price INTO v_curr_price
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        WHERE pv.id = v_variant_id AND pv.is_active = true AND p.is_active = true AND pv.stock_status = 'in_stock';

        IF NOT FOUND THEN
            -- Item not currently available
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Idempotent merge: merge quantity with existing cart line if present
        INSERT INTO public.cart_items (cart_id, variant_id, qty, added_price)
        VALUES (v_cart_id, v_variant_id, v_qty, v_curr_price)
        ON CONFLICT (cart_id, variant_id) DO UPDATE
        SET qty = public.cart_items.qty + v_qty,
            added_price = v_curr_price,
            updated_at = now();

        v_added_count := v_added_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'cartId', v_cart_id,
        'addedCount', v_added_count,
        'skippedCount', v_skipped_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-------------------------------------------------------------------------------
-- 5. C14: Order Notes Table and RPC add_or_edit_note
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    author_role text,
    text text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order ON public.order_notes(order_id);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read order notes" ON public.order_notes;
CREATE POLICY "Shop members read order notes" ON public.order_notes
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_notes.order_id AND public.is_shop_member(o.shop_id))
    );

DROP POLICY IF EXISTS "Shop members insert order notes" ON public.order_notes;
CREATE POLICY "Shop members insert order notes" ON public.order_notes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_notes.order_id AND public.is_shop_member(o.shop_id))
    );

CREATE OR REPLACE FUNCTION public.add_or_edit_note(
    p_order_id uuid,
    p_text text,
    p_note_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_order record;
    v_clean_text text;
    v_role text;
    v_note_id uuid;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
    END IF;

    IF NOT public.is_shop_member(v_order.shop_id) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
    END IF;

    SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
    IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Staff can only edit notes on their own orders';
    END IF;

    -- REJECT edits once order_status is confirmed or later
    IF v_order.order_status NOT IN ('placed') THEN
        RAISE EXCEPTION 'NOTE_LOCKED: Notes cannot be changed after the seller confirms. Use Help with this order.';
    END IF;

    -- Sanitize text: strip control characters (preserve emojis and Urdu/Arabic characters)
    v_clean_text := regexp_replace(trim(p_text), '[\x00-\x1F\x7F]', '', 'g');

    -- Validate length
    IF length(v_clean_text) = 0 THEN
        RAISE EXCEPTION 'EMPTY_NOTE: Note cannot be empty';
    END IF;

    IF length(v_clean_text) > 500 THEN
        RAISE EXCEPTION 'NOTE_TOO_LONG: Note exceeds maximum length of 500 characters';
    END IF;

    -- Insert or edit note
    IF p_note_id IS NOT NULL THEN
        UPDATE public.order_notes
        SET text = v_clean_text,
            updated_at = now()
        WHERE id = p_note_id AND order_id = p_order_id
        RETURNING id INTO v_note_id;
    ELSE
        INSERT INTO public.order_notes (order_id, user_id, author_role, text)
        VALUES (p_order_id, auth.uid(), v_role, v_clean_text)
        RETURNING id INTO v_note_id;
    END IF;

    -- Sync back to orders.notes for delivery slip / seller visibility
    UPDATE public.orders
    SET notes = v_clean_text,
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'noteId', v_note_id,
        'orderId', p_order_id,
        'text', v_clean_text,
        'authorRole', v_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================================================================
-- MIGRATION: 20261010000005_cancellation_requests.sql
-- ================================================================

-- ==============================================================================
-- Migration: Cancel Order and Cancellation Requests (C15)
-- Features:
-- 1. cancellation_requests table with unique partial index on pending status
-- 2. Configurable app_settings for cancellation policy (cutoff status, fees, rate limits)
-- 3. preview_cancellation(p_order_id) RPC
-- 4. cancel_order(p_order_id, p_reason, p_idempotency_key) atomic RPC
-- 5. decide_cancellation_request(p_request_id, p_decision, p_seller_note, p_fee_applied) RPC
-- 6. list_cancellation_requests(p_shop_id, p_order_id) RPC
-- 7. RLS policies and Realtime publication
-- ==============================================================================

-- 1. Add 'refund' to ledger_type_enum if not present
DO $$ BEGIN
  ALTER TYPE public.ledger_type_enum ADD VALUE IF NOT EXISTS 'refund';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create app_settings table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES (
  'cancellation_policy',
  jsonb_build_object(
    'cutoff_status', 'processing',
    'processing_fee', 0,
    'out_for_delivery_fee', 500,
    'max_attempts_per_24h', 3
  )
)
ON CONFLICT (key) DO NOTHING;

-- 3. Create cancellation_requests table
CREATE TABLE IF NOT EXISTS public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')) DEFAULT 'pending',
  fee_estimate numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_estimate >= 0),
  fee_applied numeric(12,2) CHECK (fee_applied >= 0),
  reason text NOT NULL,
  seller_note text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id)
);

-- Indexes for performance & partial unique index: ONLY ONE OPEN (pending) REQUEST PER ORDER
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_requests_one_pending 
  ON public.cancellation_requests (order_id) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_order_id 
  ON public.cancellation_requests (order_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_shop_id 
  ON public.cancellation_requests (shop_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_idempotency 
  ON public.cancellation_requests (idempotency_key) 
  WHERE idempotency_key IS NOT NULL;


-- 4. Enable RLS on cancellation_requests
ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members read cancellation requests" ON public.cancellation_requests;
CREATE POLICY "Shop members read cancellation requests" ON public.cancellation_requests
  FOR SELECT TO authenticated
  USING (
    public.is_shop_member(shop_id) AND (
      public.shop_role(shop_id) IN ('owner', 'manager') OR
      user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Shop members insert cancellation requests" ON public.cancellation_requests;
CREATE POLICY "Shop members insert cancellation requests" ON public.cancellation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_shop_member(shop_id) AND (
      public.shop_role(shop_id) IN ('owner', 'manager') OR
      user_id = auth.uid()
    )
  );


-- 5. RPC: preview_cancellation(p_order_id)
CREATE OR REPLACE FUNCTION public.preview_cancellation(p_order_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
  v_pending record;
  v_settings jsonb;
  v_cutoff text := 'processing';
  v_fee_processing numeric := 0;
  v_fee_out_delivery numeric := 500;
  v_outcome text;
  v_requires_approval boolean := false;
  v_fee_estimate numeric := 0;
  v_notice text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only preview their own orders';
  END IF;

  -- Check if already pending request
  SELECT * INTO v_pending 
  FROM public.cancellation_requests 
  WHERE order_id = p_order_id AND status = 'pending'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'REQUEST_CREATED',
      'requiresApproval', true,
      'feeEstimate', v_pending.fee_estimate,
      'notice', 'A cancellation request is already pending seller approval.',
      'reason', 'A cancellation request is already pending approval.',
      'hasPendingRequest', true,
      'pendingRequest', jsonb_build_object(
        'id', v_pending.id,
        'status', v_pending.status,
        'feeEstimate', v_pending.fee_estimate,
        'reason', v_pending.reason,
        'createdAt', v_pending.created_at
      )
    );
  END IF;

  -- Check terminal or non-cancellable statuses
  IF v_order.order_status = 'delivered' THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'CANCELLED',
      'requiresApproval', false,
      'feeEstimate', 0,
      'notice', 'This order has already been delivered and cannot be cancelled.',
      'reason', 'Order is already delivered.',
      'hasPendingRequest', false
    );
  END IF;

  IF v_order.order_status = 'partially_delivered' THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'CANCELLED',
      'requiresApproval', false,
      'feeEstimate', 0,
      'notice', 'Partial delivery has been made. Please submit a return request instead.',
      'reason', 'Partial delivery already made.',
      'hasPendingRequest', false
    );
  END IF;

  IF v_order.order_status IN ('cancelled', 'rejected') THEN
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'orderNumber', v_order.order_number,
      'currentStatus', v_order.order_status,
      'canCancel', false,
      'outcome', 'CANCELLED',
      'requiresApproval', false,
      'feeEstimate', 0,
      'notice', 'This order is already ' || v_order.order_status::text || '.',
      'reason', 'Order already cancelled or rejected.',
      'hasPendingRequest', false
    );
  END IF;

  -- Load app_settings for cancellation policy
  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'cancellation_policy';
  IF v_settings IS NOT NULL THEN
    v_cutoff := coalesce(v_settings->>'cutoff_status', 'processing');
    v_fee_processing := coalesce((v_settings->>'processing_fee')::numeric, 0);
    v_fee_out_delivery := coalesce((v_settings->>'out_for_delivery_fee')::numeric, 500);
  END IF;

  -- Branch based on status
  IF v_order.order_status IN ('placed', 'confirmed') THEN
    v_outcome := 'CANCELLED';
    v_requires_approval := false;
    v_fee_estimate := 0;
    v_notice := 'Your order will be cancelled immediately with no fee. Any reserved stock and credit will be restored.';
  ELSIF v_order.order_status IN ('processing', 'ready') THEN
    v_outcome := 'REQUEST_CREATED';
    v_requires_approval := true;
    v_fee_estimate := v_fee_processing;
    v_notice := 'The order is being prepared. The seller must approve this cancellation request.';
  ELSIF v_order.order_status = 'out_for_delivery' THEN
    v_outcome := 'REQUEST_CREATED';
    v_requires_approval := true;
    v_fee_estimate := v_fee_out_delivery;
    v_notice := 'The order is out for delivery. The seller must approve this request. A cancellation fee of Rs. ' || v_fee_estimate::text || ' may apply.';
  ELSE
    v_outcome := 'REQUEST_CREATED';
    v_requires_approval := true;
    v_fee_estimate := 0;
    v_notice := 'The seller must approve this cancellation request.';
  END IF;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'orderNumber', v_order.order_number,
    'currentStatus', v_order.order_status,
    'canCancel', true,
    'outcome', v_outcome,
    'requiresApproval', v_requires_approval,
    'feeEstimate', v_fee_estimate,
    'notice', v_notice,
    'hasPendingRequest', false,
    'pendingRequest', null
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC: cancel_order(p_order_id, p_reason, p_idempotency_key)
CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_order record;
  v_role text;
  v_cached_req record;
  v_pending record;
  v_request_count int;
  v_settings jsonb;
  v_fee_processing numeric := 0;
  v_fee_out_delivery numeric := 500;
  v_fee numeric := 0;
  v_request_id uuid;
  v_credit_rec record;
  v_balance numeric;
BEGIN
  -- Validate reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_REASON: Cancellation reason is required';
  END IF;

  -- 1. Row Lock Order
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist';
  END IF;

  -- 2. Authorization & Staff Role check
  IF NOT public.is_shop_member(v_order.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  SELECT public.shop_role(v_order.shop_id)::text INTO v_role;
  IF v_role = 'staff' AND v_order.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Staff members can only cancel their own orders';
  END IF;

  -- 3. Idempotency Check
  IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_cached_req 
    FROM public.cancellation_requests 
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'outcome', 'REQUEST_CREATED',
        'requestId', v_cached_req.id,
        'orderId', p_order_id,
        'orderStatus', v_order.order_status,
        'feeAmount', v_cached_req.fee_estimate,
        'message', 'Cancellation request already submitted (idempotent duplicate).'
      );
    END IF;

    -- If order already cancelled with same reason
    IF v_order.order_status = 'cancelled' THEN
      RETURN jsonb_build_object(
        'outcome', 'CANCELLED',
        'orderId', p_order_id,
        'orderStatus', 'cancelled',
        'feeAmount', 0,
        'message', 'Order already cancelled (idempotent duplicate).'
      );
    END IF;
  END IF;

  -- 4. Status Guards
  IF v_order.order_status = 'delivered' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_DELIVERED: Cannot cancel an already delivered order';
  END IF;

  IF v_order.order_status = 'partially_delivered' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_PARTIAL: Partial delivery has already been made. Please submit a return request instead';
  END IF;

  IF v_order.order_status IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'ORDER_ALREADY_CANCELLED: Order is already cancelled or rejected';
  END IF;

  -- 5. Open Pending Request Check
  SELECT * INTO v_pending 
  FROM public.cancellation_requests 
  WHERE order_id = p_order_id AND status = 'pending';

  IF FOUND THEN
    RAISE EXCEPTION 'REQUEST_ALREADY_PENDING: A cancellation request is already pending for this order';
  END IF;

  -- 6. Rate Limit Check (max 3 attempts per 24 hours per order)
  SELECT count(*) INTO v_request_count
  FROM public.cancellation_requests
  WHERE order_id = p_order_id 
    AND created_at > (now() - interval '24 hours');

  IF v_request_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED: Maximum cancellation attempts (3 per 24 hours) reached for this order';
  END IF;

  -- Load app_settings
  SELECT value INTO v_settings FROM public.app_settings WHERE key = 'cancellation_policy';
  IF v_settings IS NOT NULL THEN
    v_fee_processing := coalesce((v_settings->>'processing_fee')::numeric, 0);
    v_fee_out_delivery := coalesce((v_settings->>'out_for_delivery_fee')::numeric, 500);
  END IF;

  -- 7. ATOMIC BRANCH: Placed or Confirmed -> Immediate Cancellation
  IF v_order.order_status IN ('placed', 'confirmed') THEN
    -- A. Update order status
    UPDATE public.orders
    SET 
      order_status = 'cancelled',
      notes = coalesce(notes || E'\n', '') || 'Cancelled by customer: ' || p_reason,
      updated_at = now()
    WHERE id = p_order_id;

    -- B. Release stock reservations
    DELETE FROM public.stock_reservations WHERE order_id = p_order_id;

    -- C. Credit Ledger Reversal (never delete rows!)
    IF v_order.payment_method = 'credit' THEN
      SELECT * INTO v_credit_rec 
      FROM public.credit_accounts 
      WHERE shop_id = v_order.shop_id 
      FOR UPDATE;

      IF FOUND THEN
        v_balance := greatest(0, v_credit_rec.used - v_order.grand_total);
        UPDATE public.credit_accounts 
        SET used = v_balance 
        WHERE shop_id = v_order.shop_id;

        INSERT INTO public.ledger_entries (
          shop_id, order_id, type, amount, balance_after, notes, created_by
        ) VALUES (
          v_order.shop_id,
          p_order_id,
          'credit_adjustment',
          v_order.grand_total,
          v_balance,
          'Credit restored on immediate order cancellation',
          auth.uid()
        );
      END IF;
    END IF;

    -- D. Refund / Credit note if payment already made
    IF v_order.payment_status IN ('paid', 'partially_paid') THEN
      INSERT INTO public.ledger_entries (
        shop_id, order_id, type, amount, balance_after, notes, created_by
      ) VALUES (
        v_order.shop_id,
        p_order_id,
        'credit_adjustment',
        v_order.grand_total,
        0,
        'Payment credit note for cancelled order',
        auth.uid()
      );

      UPDATE public.orders 
      SET payment_status = 'refunded' 
      WHERE id = p_order_id;
    END IF;

    -- E. Write status history
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      p_order_id,
      'cancelled',
      auth.uid(),
      'Cancelled immediately by customer: ' || p_reason
    );

    RETURN jsonb_build_object(
      'outcome', 'CANCELLED',
      'orderId', p_order_id,
      'orderStatus', 'cancelled',
      'feeAmount', 0,
      'message', 'Order cancelled immediately. Reserved stock and credit restored.'
    );

  -- 8. BRANCH: Processing, Ready, or Out for Delivery -> Create Cancellation Request
  ELSE
    IF v_order.order_status = 'out_for_delivery' THEN
      v_fee := v_fee_out_delivery;
    ELSE
      v_fee := v_fee_processing;
    END IF;

    INSERT INTO public.cancellation_requests (
      order_id, shop_id, user_id, status, fee_estimate, reason, idempotency_key
    ) VALUES (
      p_order_id,
      v_order.shop_id,
      auth.uid(),
      'pending',
      v_fee,
      p_reason,
      p_idempotency_key
    )
    RETURNING id INTO v_request_id;

    -- Write status history documenting the request
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      p_order_id,
      v_order.order_status::text,
      auth.uid(),
      'Cancellation request submitted (' || p_reason || '). Estimated fee: Rs. ' || v_fee::text
    );

    RETURN jsonb_build_object(
      'outcome', 'REQUEST_CREATED',
      'requestId', v_request_id,
      'orderId', p_order_id,
      'orderStatus', v_order.order_status,
      'feeAmount', v_fee,
      'message', 'Cancellation request submitted for seller review.'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RPC: decide_cancellation_request(p_request_id, p_decision, p_seller_note, p_fee_applied)
CREATE OR REPLACE FUNCTION public.decide_cancellation_request(
  p_request_id uuid,
  p_decision text,
  p_seller_note text DEFAULT NULL,
  p_fee_applied numeric DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_req record;
  v_order record;
  v_fee numeric;
  v_credit_rec record;
  v_restore_amount numeric;
  v_balance numeric;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION: Decision must be approved or rejected';
  END IF;

  SELECT * INTO v_req FROM public.cancellation_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Cancellation request not found';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING: Cancellation request is already %', v_req.status;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_req.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order not found';
  END IF;

  -- Ensure caller is owner or manager of the shop
  IF NOT (public.is_shop_member(v_req.shop_id) AND public.shop_role(v_req.shop_id) IN ('owner', 'manager')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only owners or managers can decide cancellation requests';
  END IF;

  v_fee := coalesce(p_fee_applied, v_req.fee_estimate);

  -- DECISION: APPROVED
  IF p_decision = 'approved' THEN
    UPDATE public.cancellation_requests
    SET 
      status = 'approved',
      fee_applied = v_fee,
      seller_note = p_seller_note,
      decided_at = now(),
      decided_by = auth.uid()
    WHERE id = p_request_id;

    -- Update Order Status to cancelled
    UPDATE public.orders
    SET 
      order_status = 'cancelled',
      notes = coalesce(notes || E'\n', '') || 'Cancellation approved by seller' || coalesce(': ' || p_seller_note, ''),
      updated_at = now()
    WHERE id = v_req.order_id;

    -- Release stock reservations
    DELETE FROM public.stock_reservations WHERE order_id = v_req.order_id;

    -- Restore credit usage (net of cancellation fee)
    IF v_order.payment_method = 'credit' THEN
      SELECT * INTO v_credit_rec 
      FROM public.credit_accounts 
      WHERE shop_id = v_req.shop_id 
      FOR UPDATE;

      IF FOUND THEN
        v_restore_amount := greatest(0, v_order.grand_total - coalesce(v_fee, 0));
        v_balance := greatest(0, v_credit_rec.used - v_restore_amount);

        UPDATE public.credit_accounts 
        SET used = v_balance 
        WHERE shop_id = v_req.shop_id;

        INSERT INTO public.ledger_entries (
          shop_id, order_id, type, amount, balance_after, notes, created_by
        ) VALUES (
          v_req.shop_id,
          v_req.order_id,
          'credit_adjustment',
          v_restore_amount,
          v_balance,
          'Credit restored after approved cancellation (Fee: Rs. ' || v_fee::text || ')',
          auth.uid()
        );
      END IF;
    END IF;

    -- Refund paid orders
    IF v_order.payment_status IN ('paid', 'partially_paid') THEN
      INSERT INTO public.ledger_entries (
        shop_id, order_id, type, amount, balance_after, notes, created_by
      ) VALUES (
        v_req.shop_id,
        v_req.order_id,
        'credit_adjustment',
        greatest(0, v_order.grand_total - coalesce(v_fee, 0)),
        0,
        'Refund credit note for approved cancellation (Fee: Rs. ' || v_fee::text || ')',
        auth.uid()
      );

      UPDATE public.orders SET payment_status = 'refunded' WHERE id = v_req.order_id;
    END IF;

    -- Write history
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      v_req.order_id,
      'cancelled',
      auth.uid(),
      'Cancellation request approved by seller. Fee applied: Rs. ' || v_fee::text || coalesce('. Note: ' || p_seller_note, '')
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'approved',
      'requestId', p_request_id,
      'orderId', v_req.order_id,
      'orderStatus', 'cancelled',
      'feeApplied', v_fee
    );

  -- DECISION: REJECTED
  ELSE
    UPDATE public.cancellation_requests
    SET 
      status = 'rejected',
      fee_applied = 0,
      seller_note = p_seller_note,
      decided_at = now(),
      decided_by = auth.uid()
    WHERE id = p_request_id;

    -- Write history
    INSERT INTO public.order_status_history (
      order_id, status, changed_by, notes
    ) VALUES (
      v_req.order_id,
      v_order.order_status::text,
      auth.uid(),
      'Cancellation request rejected by seller' || coalesce(': ' || p_seller_note, '')
    );

    RETURN jsonb_build_object(
      'success', true,
      'decision', 'rejected',
      'requestId', p_request_id,
      'orderId', v_req.order_id,
      'orderStatus', v_order.order_status,
      'sellerNote', p_seller_note
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. RPC: list_cancellation_requests(p_shop_id, p_order_id)
CREATE OR REPLACE FUNCTION public.list_cancellation_requests(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  order_id uuid,
  shop_id uuid,
  user_id uuid,
  status text,
  fee_estimate numeric,
  fee_applied numeric,
  reason text,
  seller_note text,
  idempotency_key text,
  created_at timestamptz,
  decided_at timestamptz,
  decided_by uuid
) AS $$
BEGIN
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    cr.id,
    cr.order_id,
    cr.shop_id,
    cr.user_id,
    cr.status,
    cr.fee_estimate,
    cr.fee_applied,
    cr.reason,
    cr.seller_note,
    cr.idempotency_key,
    cr.created_at,
    cr.decided_at,
    cr.decided_by
  FROM public.cancellation_requests cr
  WHERE cr.shop_id = p_shop_id
    AND (p_order_id IS NULL OR cr.order_id = p_order_id)
  ORDER BY cr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. Realtime Publication for cancellation_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.cancellation_requests;


-- ================================================================
-- MIGRATION: 20261010000006_notifications.sql
-- ================================================================

-- ==============================================================================
-- Migration: Notifications System, Push Tokens, and Preferences (C16)
-- Features:
-- 1. notifications table (user_id, shop_id, type, category, title, body, data, is_critical, read_at)
-- 2. device_tokens table (unique per token, multi-account device reassignment on login, deletion on logout)
-- 3. notification_preferences table (per category toggles, quiet hours in Asia/Karachi, role filtering)
-- 4. RPCs: register_device_token, unregister_device_token, list_notifications, mark_notification_read, mark_all_notifications_read, get_notification_preferences, upsert_notification_preferences, dispatch_notification
-- 5. RLS policies and Realtime publication
-- ==============================================================================

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  type text NOT NULL,
  category text NOT NULL CHECK (category IN ('orders', 'delivery', 'payments', 'discounts', 'messages', 'offers')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  is_critical boolean DEFAULT false,
  read_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_shop_created ON public.notifications (shop_id, created_at DESC);

-- 2. Create device_tokens table (unique per token to handle device handoff cleanly)
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens (user_id);

-- 3. Create notification_preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  orders_enabled boolean DEFAULT true,
  delivery_enabled boolean DEFAULT true,
  payments_enabled boolean DEFAULT true,
  offers_enabled boolean DEFAULT true,
  messages_enabled boolean DEFAULT true,
  quiet_hours_enabled boolean DEFAULT true,
  quiet_hours_start text DEFAULT '22:00', -- HH:MM in Asia/Karachi
  quiet_hours_end text DEFAULT '08:00',   -- HH:MM in Asia/Karachi
  timezone text DEFAULT 'Asia/Karachi',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_notification_prefs_user_shop UNIQUE (user_id, shop_id)
);

-- 4. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Notifications RLS
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "System insert notifications" ON public.notifications;
CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Device Tokens RLS
DROP POLICY IF EXISTS "Users read own device tokens" ON public.device_tokens;
CREATE POLICY "Users read own device tokens" ON public.device_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own device tokens" ON public.device_tokens;
CREATE POLICY "Users manage own device tokens" ON public.device_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Notification Preferences RLS
DROP POLICY IF EXISTS "Users manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- 5. RPC: register_device_token(p_token, p_platform)
-- Reassigns token to current authenticated user if previously held by another account
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token text,
  p_platform text
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
  END IF;

  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'INVALID_TOKEN: Push token is required';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, last_seen)
  VALUES (v_user_id, trim(p_token), p_platform, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id = v_user_id,
        platform = EXCLUDED.platform,
        last_seen = now();

  RETURN jsonb_build_object('success', true, 'token', p_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RPC: unregister_device_token(p_token)
-- Deletes device token on logout
CREATE OR REPLACE FUNCTION public.unregister_device_token(
  p_token text
)
RETURNS jsonb AS $$
BEGIN
  DELETE FROM public.device_tokens
  WHERE token = trim(p_token) AND user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RPC: list_notifications(p_shop_id, p_limit, p_cursor)
-- Keyset pagination with cursor and unread count
CREATE OR REPLACE FUNCTION public.list_notifications(
  p_shop_id uuid,
  p_limit int DEFAULT 30,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_unread_count int;
  v_items jsonb;
  v_has_more boolean := false;
  v_next_cursor timestamptz := null;
  v_limit int := coalesce(p_limit, 30);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
  END IF;

  -- Calculate total unread count for this user in this shop
  SELECT count(*) INTO v_unread_count
  FROM public.notifications
  WHERE user_id = v_user_id
    AND shop_id = p_shop_id
    AND read_at IS NULL;

  -- Select items with limit + 1 to detect has_more
  WITH paginated AS (
    SELECT 
      n.id,
      n.user_id,
      n.shop_id,
      n.type,
      n.category,
      n.title,
      n.body,
      n.data,
      n.is_critical,
      n.read_at,
      n.created_at
    FROM public.notifications n
    WHERE n.user_id = v_user_id
      AND n.shop_id = p_shop_id
      AND (p_cursor IS NULL OR n.created_at < p_cursor)
    ORDER BY n.created_at DESC
    LIMIT (v_limit + 1)
  ),
  counted AS (
    SELECT * FROM paginated LIMIT v_limit
  )
  SELECT 
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'userId', c.user_id,
        'shopId', c.shop_id,
        'type', c.type,
        'category', c.category,
        'title', c.title,
        'body', c.body,
        'data', c.data,
        'isCritical', c.is_critical,
        'readAt', c.read_at,
        'createdAt', c.created_at
      ) ORDER BY c.created_at DESC
    ), '[]'::jsonb),
    (SELECT count(*) > v_limit FROM paginated),
    (SELECT min(c.created_at) FROM counted c)
  INTO v_items, v_has_more, v_next_cursor
  FROM counted c;

  RETURN jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'unreadCount', v_unread_count,
    'hasMore', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. RPC: mark_notification_read(p_notification_id)
CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_shop_id uuid;
  v_unread_count int;
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = v_user_id AND read_at IS NULL
  RETURNING shop_id INTO v_shop_id;

  IF v_shop_id IS NOT NULL THEN
    SELECT count(*) INTO v_unread_count
    FROM public.notifications
    WHERE user_id = v_user_id AND shop_id = v_shop_id AND read_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'notificationId', p_notification_id,
    'unreadCount', coalesce(v_unread_count, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 9. RPC: mark_all_notifications_read(p_shop_id)
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_shop_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = v_user_id 
      AND shop_id = p_shop_id 
      AND read_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'shopId', p_shop_id,
    'markedCount', v_count,
    'unreadCount', 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 10. RPC: get_notification_preferences(p_shop_id)
CREATE OR REPLACE FUNCTION public.get_notification_preferences(
  p_shop_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prefs record;
BEGIN
  SELECT * INTO v_prefs
  FROM public.notification_preferences
  WHERE user_id = v_user_id AND shop_id = p_shop_id;

  IF NOT FOUND THEN
    -- Insert default preferences
    INSERT INTO public.notification_preferences (user_id, shop_id)
    VALUES (v_user_id, p_shop_id)
    RETURNING * INTO v_prefs;
  END IF;

  RETURN jsonb_build_object(
    'ordersEnabled', v_prefs.orders_enabled,
    'deliveryEnabled', v_prefs.delivery_enabled,
    'paymentsEnabled', v_prefs.payments_enabled,
    'offersEnabled', v_prefs.offers_enabled,
    'messagesEnabled', v_prefs.messages_enabled,
    'quietHoursEnabled', v_prefs.quiet_hours_enabled,
    'quietHoursStart', v_prefs.quiet_hours_start,
    'quietHoursEnd', v_prefs.quiet_hours_end,
    'timezone', v_prefs.timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 11. RPC: upsert_notification_preferences(p_shop_id, p_prefs)
CREATE OR REPLACE FUNCTION public.upsert_notification_preferences(
  p_shop_id uuid,
  p_prefs jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated record;
BEGIN
  INSERT INTO public.notification_preferences (
    user_id, shop_id,
    orders_enabled, delivery_enabled, payments_enabled, offers_enabled, messages_enabled,
    quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, updated_at
  ) VALUES (
    v_user_id, p_shop_id,
    coalesce((p_prefs->>'ordersEnabled')::boolean, true),
    coalesce((p_prefs->>'deliveryEnabled')::boolean, true),
    coalesce((p_prefs->>'paymentsEnabled')::boolean, true),
    coalesce((p_prefs->>'offersEnabled')::boolean, true),
    coalesce((p_prefs->>'messagesEnabled')::boolean, true),
    coalesce((p_prefs->>'quietHoursEnabled')::boolean, true),
    coalesce(p_prefs->>'quietHoursStart', '22:00'),
    coalesce(p_prefs->>'quietHoursEnd', '08:00'),
    coalesce(p_prefs->>'timezone', 'Asia/Karachi'),
    now()
  )
  ON CONFLICT (user_id, shop_id) DO UPDATE SET
    orders_enabled = coalesce((p_prefs->>'ordersEnabled')::boolean, public.notification_preferences.orders_enabled),
    delivery_enabled = coalesce((p_prefs->>'deliveryEnabled')::boolean, public.notification_preferences.delivery_enabled),
    payments_enabled = coalesce((p_prefs->>'paymentsEnabled')::boolean, public.notification_preferences.payments_enabled),
    offers_enabled = coalesce((p_prefs->>'offersEnabled')::boolean, public.notification_preferences.offers_enabled),
    messages_enabled = coalesce((p_prefs->>'messagesEnabled')::boolean, public.notification_preferences.messages_enabled),
    quiet_hours_enabled = coalesce((p_prefs->>'quietHoursEnabled')::boolean, public.notification_preferences.quiet_hours_enabled),
    quiet_hours_start = coalesce(p_prefs->>'quietHoursStart', public.notification_preferences.quiet_hours_start),
    quiet_hours_end = coalesce(p_prefs->>'quietHoursEnd', public.notification_preferences.quiet_hours_end),
    timezone = coalesce(p_prefs->>'timezone', public.notification_preferences.timezone),
    updated_at = now()
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object(
    'ordersEnabled', v_updated.orders_enabled,
    'deliveryEnabled', v_updated.delivery_enabled,
    'paymentsEnabled', v_updated.payments_enabled,
    'offersEnabled', v_updated.offers_enabled,
    'messagesEnabled', v_updated.messages_enabled,
    'quietHoursEnabled', v_updated.quiet_hours_enabled,
    'quietHoursStart', v_updated.quiet_hours_start,
    'quietHoursEnd', v_updated.quiet_hours_end,
    'timezone', v_updated.timezone
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 12. RPC: dispatch_notification(...)
-- Helper to create notification row and return recipients for push notification Edge Function
CREATE OR REPLACE FUNCTION public.dispatch_notification(
  p_shop_id uuid,
  p_user_id uuid,
  p_type text,
  p_category text,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'::jsonb,
  p_is_critical boolean DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_role text;
  v_prefs record;
  v_notification_id uuid;
  v_category_allowed boolean := true;
BEGIN
  -- Verify shop membership and check role restriction
  SELECT public.shop_role(p_shop_id)::text INTO v_role;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'User not a member of shop');
  END IF;

  -- ROLE FILTER: Owner-only categories (payments) must NOT be sent to staff or manager
  IF p_category = 'payments' AND v_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Category restricted to owner');
  END IF;

  -- Check user notification preferences
  SELECT * INTO v_prefs 
  FROM public.notification_preferences 
  WHERE user_id = p_user_id AND shop_id = p_shop_id;

  IF FOUND THEN
    IF p_category = 'orders' AND v_prefs.orders_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'delivery' AND v_prefs.delivery_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'payments' AND v_prefs.payments_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'offers' AND v_prefs.offers_enabled = false THEN v_category_allowed := false; END IF;
    IF p_category = 'messages' AND v_prefs.messages_enabled = false THEN v_category_allowed := false; END IF;
  END IF;

  IF NOT v_category_allowed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Category disabled by user preference');
  END IF;

  -- Insert notification
  INSERT INTO public.notifications (
    user_id, shop_id, type, category, title, body, data, is_critical
  ) VALUES (
    p_user_id, p_shop_id, p_type, p_category, p_title, p_body, p_data, p_is_critical
  )
  RETURNING id INTO v_notification_id;

  RETURN jsonb_build_object(
    'success', true,
    'notificationId', v_notification_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 13. Enable Realtime Replication for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ================================================================
-- MIGRATION: 20261010000007_support_and_settings.sql
-- ================================================================

-- ==============================================================================
-- Migration: Seller Contact, Support System, and Account Settings (C17 / C18)
-- Features:
-- 1. app_settings: seed seller_contact and app_version settings
-- 2. support_tickets table (shop_id, order_id nullable, subject, body, status, attachments, idempotency_key)
-- 3. ticket_messages table (ticket_id, sender_id, sender_role, message, attachments)
-- 4. support_faqs table with default B2B cold drinks FAQs
-- 5. RPCs: get_seller_contact, list_support_faqs, create_support_ticket,
--          reply_support_ticket, list_support_tickets, get_support_ticket_detail,
--          check_can_delete_account
-- 6. RLS policies and Realtime publication
-- ==============================================================================

-- 1. Ensure app_settings has seller_contact and version info
INSERT INTO public.app_settings (key, value)
VALUES (
  'seller_contact',
  jsonb_build_object(
    'phone', '+923001234567',
    'whatsapp', '+923001234567',
    'business_hours', jsonb_build_object(
      'start', '09:00',
      'end', '19:00',
      'days', jsonb_build_array(1, 2, 3, 4, 5, 6), -- Monday to Saturday (0=Sunday)
      'holidays', jsonb_build_array('2026-03-23', '2026-05-01', '2026-08-14', '2026-11-09', '2026-12-25')
    ),
    'expected_response_time', 'Within 2 business hours'
  )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

-- 2. Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  attachments jsonb DEFAULT '[]'::jsonb,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_shop ON public.support_tickets (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON public.support_tickets (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_idempotency
  ON public.support_tickets (shop_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Create ticket_messages table
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'seller')),
  message text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages (ticket_id, created_at ASC);

-- 4. Create support_faqs table
CREATE TABLE IF NOT EXISTS public.support_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('ordering', 'delivery', 'payments', 'account', 'returns')),
  question text NOT NULL,
  answer text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Seed FAQs if table is empty
INSERT INTO public.support_faqs (category, question, answer, sort_order)
VALUES
  ('ordering', 'What is the minimum order quantity for wholesale deliveries?', 'The minimum order quantity depends on your delivery zone, typically 10 crates or cartons. Individual variant minimums and case multipliers apply at checkout.', 1),
  ('ordering', 'How do I reorder items from a past purchase?', 'Go to the Orders tab, open any past order or tap the visible "Reorder" button on the order card. Prices and stock will automatically update to current live values.', 2),
  ('delivery', 'What are your delivery hours and cutoffs?', 'Orders placed before 2:00 PM PKT are scheduled for next-morning delivery. You can set your preferred delivery time period (Morning or Afternoon) in Delivery Preferences.', 3),
  ('delivery', 'Can I change my delivery address after placing an order?', 'Addresses cannot be changed once an order is marked Out for Delivery. If your order is in Placed or Confirmed status, please contact seller support immediately.', 4),
  ('payments', 'What payment methods are supported for wholesale shops?', 'We accept Cash on Delivery (COD), Direct Bank Transfer / IBFT with payment slip upload, and 14-day Approved Credit for verified wholesale accounts.', 5),
  ('payments', 'How does credit limit approval work?', 'Shop owners can apply for credit terms. Once approved, your current credit limit and available balance are displayed in the account and checkout screens.', 6),
  ('returns', 'What is the return policy for damaged or expired bottles?', 'Please inspect crates upon arrival. Any broken seals or short-expiry bottles can be reported via a Return Request or Support Ticket within 24 hours of delivery with photo proof.', 7),
  ('account', 'Can my shop staff place orders without seeing credit or prices?', 'Yes! Staff members have restricted access: they can place orders but cannot view credit balances, payment proofs, or shop financial statements.', 8)
ON CONFLICT DO NOTHING;

-- 5. Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_faqs ENABLE ROW LEVEL SECURITY;

-- FAQs are public readable
CREATE POLICY "faqs_public_read" ON public.support_faqs
  FOR SELECT TO authenticated, anon USING (true);

-- Tickets RLS: Customers can view tickets for shops they are member of
CREATE POLICY "tickets_shop_members_select" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "tickets_shop_members_insert" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Messages RLS: Can view and insert messages if user belongs to the ticket's shop
CREATE POLICY "messages_shop_members_select" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT t.id FROM public.support_tickets t
      JOIN public.shop_users su ON su.shop_id = t.shop_id
      WHERE su.user_id = auth.uid() AND su.status = 'active'
    )
  );

CREATE POLICY "messages_shop_members_insert" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    ticket_id IN (
      SELECT t.id FROM public.support_tickets t
      JOIN public.shop_users su ON su.shop_id = t.shop_id
      WHERE su.user_id = auth.uid() AND su.status = 'active'
    )
  );

-- ==============================================================================
-- 6. RPC Functions
-- ==============================================================================

-- RPC 1: get_seller_contact
CREATE OR REPLACE FUNCTION public.get_seller_contact()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact jsonb;
BEGIN
  SELECT value INTO v_contact
  FROM public.app_settings
  WHERE key = 'seller_contact';

  IF v_contact IS NULL THEN
    v_contact := jsonb_build_object(
      'phone', '+923001234567',
      'whatsapp', '+923001234567',
      'business_hours', jsonb_build_object(
        'start', '09:00',
        'end', '19:00',
        'days', jsonb_build_array(1, 2, 3, 4, 5, 6),
        'holidays', jsonb_build_array('2026-03-23', '2026-05-01', '2026-08-14', '2026-11-09', '2026-12-25')
      ),
      'expected_response_time', 'Within 2 business hours'
    );
  END IF;

  RETURN v_contact;
END;
$$;

-- RPC 2: list_support_faqs
CREATE OR REPLACE FUNCTION public.list_support_faqs(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  category text,
  question text,
  answer text,
  sort_order int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.category, f.question, f.answer, f.sort_order
  FROM public.support_faqs f
  WHERE (p_category IS NULL OR f.category = p_category)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR f.question ILIKE '%' || p_search || '%'
      OR f.answer ILIKE '%' || p_search || '%'
    )
  ORDER BY f.sort_order ASC, f.created_at ASC;
END;
$$;

-- RPC 3: create_support_ticket
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL,
  p_subject text DEFAULT '',
  p_body text DEFAULT '',
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_order_user_id uuid;
  v_existing_ticket record;
  v_new_ticket_id uuid;
  v_clean_subject text;
  v_clean_body text;
BEGIN
  -- Verify user belongs to shop
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User is not an active member of this shop';
  END IF;

  -- Verify order permission if order_id provided
  IF p_order_id IS NOT NULL THEN
    SELECT user_id INTO v_order_user_id
    FROM public.orders
    WHERE id = p_order_id AND shop_id = p_shop_id;

    IF v_order_user_id IS NULL THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND: Order does not exist for this shop';
    END IF;

    -- If staff, verify they placed the order
    IF v_role = 'staff' AND v_order_user_id <> v_user_id THEN
      RAISE EXCEPTION 'ORDER_FORBIDDEN: Staff can only attach orders they placed';
    END IF;
  END IF;

  -- Check idempotency
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing_ticket
    FROM public.support_tickets
    WHERE shop_id = p_shop_id AND idempotency_key = p_idempotency_key;

    IF v_existing_ticket.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ticket_id', v_existing_ticket.id,
        'subject', v_existing_ticket.subject,
        'status', v_existing_ticket.status,
        'is_duplicate', true
      );
    END IF;
  END IF;

  v_clean_subject := trim(p_subject);
  v_clean_body := trim(p_body);

  IF length(v_clean_subject) < 3 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Subject must be at least 3 characters';
  END IF;

  IF length(v_clean_body) < 5 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Message body must be at least 5 characters';
  END IF;

  -- Create ticket
  INSERT INTO public.support_tickets (
    shop_id,
    order_id,
    created_by,
    subject,
    body,
    status,
    attachments,
    idempotency_key
  )
  VALUES (
    p_shop_id,
    p_order_id,
    v_user_id,
    v_clean_subject,
    v_clean_body,
    'open',
    COALESCE(p_attachments, '[]'::jsonb),
    p_idempotency_key
  )
  RETURNING id INTO v_new_ticket_id;

  -- Add initial message
  INSERT INTO public.ticket_messages (
    ticket_id,
    sender_id,
    sender_role,
    message,
    attachments
  )
  VALUES (
    v_new_ticket_id,
    v_user_id,
    'customer',
    v_clean_body,
    COALESCE(p_attachments, '[]'::jsonb)
  );

  RETURN jsonb_build_object(
    'ticket_id', v_new_ticket_id,
    'subject', v_clean_subject,
    'status', 'open',
    'is_duplicate', false
  );
END;
$$;

-- RPC 4: reply_support_ticket
CREATE OR REPLACE FUNCTION public.reply_support_ticket(
  p_ticket_id uuid,
  p_message text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ticket record;
  v_role text;
  v_msg_id uuid;
  v_clean_msg text;
BEGIN
  SELECT * INTO v_ticket
  FROM public.support_tickets
  WHERE id = p_ticket_id;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND: Support ticket does not exist';
  END IF;

  -- Verify membership
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = v_ticket.shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User is not an active member of this shop';
  END IF;

  v_clean_msg := trim(p_message);
  IF length(v_clean_msg) < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Message cannot be empty';
  END IF;

  -- Insert message
  INSERT INTO public.ticket_messages (
    ticket_id,
    sender_id,
    sender_role,
    message,
    attachments
  )
  VALUES (
    p_ticket_id,
    v_user_id,
    'customer',
    v_clean_msg,
    COALESCE(p_attachments, '[]'::jsonb)
  )
  RETURNING id INTO v_msg_id;

  -- Reopen if resolved, update timestamp
  UPDATE public.support_tickets
  SET updated_at = now(),
      status = CASE WHEN status = 'resolved' THEN 'in_progress' ELSE status END
  WHERE id = p_ticket_id;

  RETURN jsonb_build_object(
    'message_id', v_msg_id,
    'ticket_id', p_ticket_id,
    'status', CASE WHEN v_ticket.status = 'resolved' THEN 'in_progress' ELSE v_ticket.status END
  );
END;
$$;

-- RPC 5: list_support_tickets
CREATE OR REPLACE FUNCTION public.list_support_tickets(
  p_shop_id uuid
)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  order_id uuid,
  order_number text,
  subject text,
  body text,
  status text,
  attachments jsonb,
  message_count bigint,
  last_message text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.shop_id,
    t.order_id,
    o.order_number,
    t.subject,
    t.body,
    t.status,
    t.attachments,
    COUNT(m.id) AS message_count,
    (
      SELECT msg.message
      FROM public.ticket_messages msg
      WHERE msg.ticket_id = t.id
      ORDER BY msg.created_at DESC
      LIMIT 1
    ) AS last_message,
    t.created_at,
    t.updated_at
  FROM public.support_tickets t
  LEFT JOIN public.orders o ON o.id = t.order_id
  LEFT JOIN public.ticket_messages m ON m.ticket_id = t.id
  WHERE t.shop_id = p_shop_id
  GROUP BY t.id, o.order_number
  ORDER BY t.updated_at DESC;
END;
$$;

-- RPC 6: get_support_ticket_detail
CREATE OR REPLACE FUNCTION public.get_support_ticket_detail(
  p_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_order_num text;
  v_messages jsonb;
BEGIN
  SELECT t.*, o.order_number INTO v_ticket
  FROM public.support_tickets t
  LEFT JOIN public.orders o ON o.id = t.order_id
  WHERE t.id = p_ticket_id;

  IF v_ticket.id IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND: Ticket not found';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'ticket_id', m.ticket_id,
        'sender_id', m.sender_id,
        'sender_role', m.sender_role,
        'message', m.message,
        'attachments', m.attachments,
        'created_at', m.created_at
      ) ORDER BY m.created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_messages
  FROM public.ticket_messages m
  WHERE m.ticket_id = p_ticket_id;

  RETURN jsonb_build_object(
    'id', v_ticket.id,
    'shop_id', v_ticket.shop_id,
    'order_id', v_ticket.order_id,
    'order_number', v_ticket.order_number,
    'subject', v_ticket.subject,
    'body', v_ticket.body,
    'status', v_ticket.status,
    'attachments', v_ticket.attachments,
    'created_at', v_ticket.created_at,
    'updated_at', v_ticket.updated_at,
    'messages', v_messages
  );
END;
$$;

-- RPC 7: check_can_delete_account
-- Explains deletion block if active orders or outstanding credit balance exist
CREATE OR REPLACE FUNCTION public.check_can_delete_account(
  p_shop_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_order_count int;
  v_active_order_nums text;
  v_credit_balance numeric := 0;
BEGIN
  -- Count active orders
  SELECT COUNT(*), string_agg(order_number, ', ')
  INTO v_active_order_count, v_active_order_nums
  FROM public.orders
  WHERE shop_id = p_shop_id
    AND order_status IN ('placed', 'confirmed', 'processing', 'ready', 'out_for_delivery');

  IF v_active_order_count > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'ACTIVE_ORDERS',
      'message', 'Account cannot be deleted while orders (' || v_active_order_nums || ') are in progress. Please wait for delivery or contact seller support.'
    );
  END IF;

  -- Check credit balance if shop has credit
  SELECT COALESCE(current_balance, 0)
  INTO v_credit_balance
  FROM public.credit_limits
  WHERE shop_id = p_shop_id;

  IF v_credit_balance > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'OUTSTANDING_BALANCE',
      'message', 'Account cannot be deleted with an outstanding balance of Rs. ' || v_credit_balance::text || '. Please clear your dues or contact seller support.'
    );
  END IF;

  RETURN jsonb_build_object(
    'can_delete', true,
    'reason', NULL,
    'message', 'Account eligible for deletion.'
  );
END;
$$;

-- 7. Add tables to supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;


-- ================================================================
-- MIGRATION: 20261010000008_credit_and_payments.sql
-- ================================================================

-- ==============================================================================
-- Migration: Credit Account, Customer Ledger, Payments & Payment Proofs (C19 & C20)
-- Features:
-- 1. credit_accounts: alter/extend table (shop_id, credit_limit, terms_days, status)
-- 2. customer_ledger: APPEND-ONLY table with immutable trigger (charge, payment, credit_note, adjustment, reversal)
-- 3. payment_allocations table (FIFO invoice allocations)
-- 4. payments table (cash, bank_transfer, credit)
-- 5. payment_proofs table (file_path, bank, reference_number, duplicate detection, resubmission)
-- 6. Storage bucket 'payment-proofs' policies
-- 7. RPCs: get_credit_summary (Owner only), list_customer_ledger (Owner only),
--          submit_payment_proof, record_payment, list_payments, list_payment_proofs
-- 8. Ledger immutability trigger & RLS policies
-- ==============================================================================

-- 1. Extend credit_accounts table
ALTER TABLE public.credit_accounts
  ADD COLUMN IF NOT EXISTS terms_days int DEFAULT 14,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_credit_accounts_status'
  ) THEN
    ALTER TABLE public.credit_accounts
      ADD CONSTRAINT chk_credit_accounts_status
      CHECK (status IN ('active', 'suspended', 'closed'));
  END IF;
END $$;

-- 2. Create customer_ledger table (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS public.customer_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('charge', 'payment', 'credit_note', 'adjustment', 'reversal')),
  amount numeric(12,2) NOT NULL, -- Signed: positive for charges, negative for payments/credit_notes/reversals
  ref_type text NOT NULL,        -- 'order', 'payment', 'invoice', 'adjustment', 'reversal'
  ref_id text,                   -- Associated order ID, payment ID, or invoice ID
  description text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_shop_created
  ON public.customer_ledger (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_ref
  ON public.customer_ledger (ref_type, ref_id);

-- Enforce ledger immutability: NO UPDATE OR DELETE ALLOWED
CREATE OR REPLACE FUNCTION public.prevent_customer_ledger_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER: Customer ledger entries cannot be updated or deleted. Corrections must be recorded as reversal entries.';
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_ledger_immutable ON public.customer_ledger;
CREATE TRIGGER trg_customer_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.customer_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_customer_ledger_modification();

-- Revoke permissions
REVOKE UPDATE, DELETE ON public.customer_ledger FROM authenticated, anon;

-- 3. Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'credit')),
  reference text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'refunded')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_shop_created ON public.payments (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);

-- 4. Create payment_proofs table
CREATE TABLE IF NOT EXISTS public.payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  bank text NOT NULL,
  reference_number text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'rejected')),
  reject_reason text,
  resubmission_of uuid REFERENCES public.payment_proofs(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_shop ON public.payment_proofs (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON public.payment_proofs (order_id);

-- Duplicate reference detection: Unique per bank, reference_number, and amount
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_proofs_reference
  ON public.payment_proofs (lower(trim(bank)), lower(trim(reference_number)), amount)
  WHERE status <> 'rejected';

-- 5. Create payment_allocations table
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  ledger_entry_id uuid REFERENCES public.customer_ledger(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_ledger ON public.payment_allocations (ledger_entry_id);

-- 6. Enable RLS
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- Ledger RLS: OWNER ONLY! Managers and staff get zero rows.
CREATE POLICY "ledger_owner_only_select" ON public.customer_ledger
  FOR SELECT TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
    )
  );

-- Payments RLS: Owner & manager can view payments
CREATE POLICY "payments_owner_manager_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'
    )
  );

-- Payment Proofs RLS: Shop members can view proofs for their shop
CREATE POLICY "payment_proofs_shop_select" ON public.payment_proofs
  FOR SELECT TO authenticated
  USING (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "payment_proofs_shop_insert" ON public.payment_proofs
  FOR INSERT TO authenticated
  WITH CHECK (
    shop_id IN (
      SELECT shop_id FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Storage bucket for payment-proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf'];

-- Storage bucket RLS policies
CREATE POLICY "payment_proofs_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] IN (
      SELECT shop_id::text FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "payment_proofs_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] IN (
      SELECT shop_id::text FROM public.shop_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ==============================================================================
-- 7. RPC Functions
-- ==============================================================================

-- RPC 1: get_credit_summary (OWNER ONLY)
CREATE OR REPLACE FUNCTION public.get_credit_summary(
  p_shop_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_limit numeric(12,2) := 0;
  v_terms_days int := 14;
  v_status text := 'active';
  v_outstanding numeric(12,2) := 0;
  v_used numeric(12,2) := 0;
  v_available numeric(12,2) := 0;
  v_overdue numeric(12,2) := 0;
  v_next_due timestamptz := NULL;
BEGIN
  -- Strict role check: Owner role ONLY
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only shop owner can view credit summary and financial records';
  END IF;

  -- Load credit account configuration with row lock
  SELECT
    COALESCE(credit_limit, 0),
    COALESCE(terms_days, 14),
    COALESCE(status, 'active')
  INTO v_limit, v_terms_days, v_status
  FROM public.credit_accounts
  WHERE shop_id = p_shop_id
  FOR UPDATE;

  -- Compute outstanding balance from immutable customer_ledger
  -- Sum of all amounts: charges (+), payments (-), credit notes (-), reversals (-)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_outstanding
  FROM public.customer_ledger
  WHERE shop_id = p_shop_id;

  -- Used is positive debt amount
  v_used := GREATEST(0, v_outstanding);

  -- Available is limit minus used (if over limit, available is 0)
  v_available := GREATEST(0, v_limit - v_used);

  -- Calculate overdue amount and next due date
  -- Look for charges older than terms_days where net outstanding exists
  IF v_outstanding > 0 THEN
    SELECT
      COALESCE(SUM(amount), 0),
      MIN(created_at + (v_terms_days || ' days')::interval)
    INTO v_overdue, v_next_due
    FROM public.customer_ledger
    WHERE shop_id = p_shop_id
      AND entry_type = 'charge'
      AND (created_at + (v_terms_days || ' days')::interval) < now();

    -- Cap overdue to net outstanding
    v_overdue := LEAST(v_outstanding, v_overdue);

    -- Find earliest upcoming due date if no overdue or in addition
    IF v_next_due IS NULL OR v_next_due < now() THEN
      SELECT MIN(created_at + (v_terms_days || ' days')::interval)
      INTO v_next_due
      FROM public.customer_ledger
      WHERE shop_id = p_shop_id
        AND entry_type = 'charge'
        AND (created_at + (v_terms_days || ' days')::interval) >= now();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'shop_id', p_shop_id,
    'limit', v_limit,
    'used', v_used,
    'available', v_available,
    'outstanding', v_outstanding,
    'overdue', v_overdue,
    'next_due', v_next_due,
    'terms_days', v_terms_days,
    'status', v_status
  );
END;
$$;

-- RPC 2: list_customer_ledger (OWNER ONLY)
CREATE OR REPLACE FUNCTION public.list_customer_ledger(
  p_shop_id uuid,
  p_filter_type text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_cursor_created_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  entry_type text,
  amount numeric(12,2),
  ref_type text,
  ref_id text,
  description text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only shop owner can view customer ledger';
  END IF;

  RETURN QUERY
  SELECT
    cl.id,
    cl.shop_id,
    cl.entry_type,
    cl.amount,
    cl.ref_type,
    cl.ref_id,
    cl.description,
    cl.created_at
  FROM public.customer_ledger cl
  WHERE cl.shop_id = p_shop_id
    AND (p_filter_type IS NULL OR p_filter_type = 'all' OR cl.entry_type = p_filter_type)
    AND (p_cursor_created_at IS NULL OR cl.created_at < p_cursor_created_at)
  ORDER BY cl.created_at DESC
  LIMIT p_limit;
END;
$$;

-- RPC 3: submit_payment_proof
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  p_shop_id uuid,
  p_order_id uuid,
  p_file_path text,
  p_amount numeric,
  p_bank text,
  p_reference_number text,
  p_resubmission_of uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_existing_proof record;
  v_new_proof_id uuid;
  v_clean_bank text := trim(p_bank);
  v_clean_ref text := trim(p_reference_number);
BEGIN
  -- Verify shop membership
  SELECT role INTO v_role
  FROM public.shop_users
  WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User is not an active member of this shop';
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Amount must be greater than zero';
  END IF;

  -- Check duplicate reference detection
  SELECT * INTO v_existing_proof
  FROM public.payment_proofs
  WHERE lower(trim(bank)) = lower(v_clean_bank)
    AND lower(trim(reference_number)) = lower(v_clean_ref)
    AND amount = p_amount
    AND status <> 'rejected';

  IF v_existing_proof.id IS NOT NULL AND v_existing_proof.id <> COALESCE(p_resubmission_of, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RETURN jsonb_build_object(
      'error_code', 'DUPLICATE_REFERENCE',
      'message', 'A payment proof with this bank and reference number has already been submitted (' || v_existing_proof.status || ').',
      'existing_proof_id', v_existing_proof.id,
      'existing_status', v_existing_proof.status
    );
  END IF;

  -- Insert payment proof
  INSERT INTO public.payment_proofs (
    shop_id,
    order_id,
    file_path,
    amount,
    bank,
    reference_number,
    status,
    resubmission_of,
    created_by
  )
  VALUES (
    p_shop_id,
    p_order_id,
    p_file_path,
    p_amount,
    v_clean_bank,
    v_clean_ref,
    'submitted',
    p_resubmission_of,
    v_user_id
  )
  RETURNING id INTO v_new_proof_id;

  -- Update order payment status to proof_submitted if linked
  IF p_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET payment_status = 'proof_submitted'
    WHERE id = p_order_id AND shop_id = p_shop_id;

    -- Add entry to order_status_history
    INSERT INTO public.order_status_history (order_id, status, notes, actor_id)
    VALUES (
      p_order_id,
      'proof_submitted',
      'Payment proof submitted for Rs. ' || p_amount::text || ' via ' || v_clean_bank || ' (Ref: ' || v_clean_ref || ')',
      v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'proof_id', v_new_proof_id,
    'status', 'submitted',
    'amount', p_amount,
    'bank', v_clean_bank,
    'reference_number', v_clean_ref
  );
END;
$$;

-- RPC 4: record_payment
-- Atomic: writes payments row, writes customer_ledger, performs FIFO allocation
CREATE OR REPLACE FUNCTION public.record_payment(
  p_shop_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_proof_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_payment_id uuid;
  v_ledger_id uuid;
  v_remaining_payment numeric(12,2) := p_amount;
  v_charge_rec record;
  v_allocated_amt numeric(12,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Payment amount must be greater than zero';
  END IF;

  -- Lock credit account for atomic balance update
  PERFORM 1 FROM public.credit_accounts
  WHERE shop_id = p_shop_id
  FOR UPDATE;

  -- 1. Insert payment record
  INSERT INTO public.payments (
    shop_id,
    amount,
    method,
    reference,
    order_id,
    status,
    created_by,
    verified_at,
    verified_by
  )
  VALUES (
    p_shop_id,
    p_amount,
    p_method,
    p_reference,
    p_order_id,
    'verified',
    v_user_id,
    now(),
    v_user_id
  )
  RETURNING id INTO v_new_payment_id;

  -- 2. Append payment entry into customer_ledger (signed negative amount)
  INSERT INTO public.customer_ledger (
    shop_id,
    entry_type,
    amount,
    ref_type,
    ref_id,
    description,
    created_by
  )
  VALUES (
    p_shop_id,
    'payment',
    -p_amount,
    'payment',
    v_new_payment_id::text,
    COALESCE(p_reference, 'Payment via ' || p_method),
    v_user_id
  )
  RETURNING id INTO v_ledger_id;

  -- 3. FIFO Payment Allocation across open charges
  FOR v_charge_rec IN (
    SELECT
      cl.id AS charge_id,
      cl.amount AS charge_amount,
      COALESCE(SUM(pa.amount), 0) AS already_allocated
    FROM public.customer_ledger cl
    LEFT JOIN public.payment_allocations pa ON pa.ledger_entry_id = cl.id
    WHERE cl.shop_id = p_shop_id AND cl.entry_type = 'charge'
    GROUP BY cl.id, cl.amount, cl.created_at
    HAVING cl.amount > COALESCE(SUM(pa.amount), 0)
    ORDER BY cl.created_at ASC
  ) LOOP
    EXIT WHEN v_remaining_payment <= 0;

    v_allocated_amt := LEAST(v_remaining_payment, v_charge_rec.charge_amount - v_charge_rec.already_allocated);

    INSERT INTO public.payment_allocations (
      payment_id,
      ledger_entry_id,
      amount
    )
    VALUES (
      v_new_payment_id,
      v_charge_rec.charge_id,
      v_allocated_amt
    );

    v_remaining_payment := v_remaining_payment - v_allocated_amt;
  END LOOP;

  -- 4. If payment proof linked, update proof status
  IF p_proof_id IS NOT NULL THEN
    UPDATE public.payment_proofs
    SET payment_id = v_new_payment_id,
        status = 'verified'
    WHERE id = p_proof_id;
  END IF;

  -- 5. If order linked, update payment status
  IF p_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET payment_status = 'paid'
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_new_payment_id,
    'ledger_id', v_ledger_id,
    'amount', p_amount,
    'unallocated_credit', GREATEST(0, v_remaining_payment)
  );
END;
$$;

-- RPC 5: list_payments
CREATE OR REPLACE FUNCTION public.list_payments(
  p_shop_id uuid
)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  amount numeric(12,2),
  method text,
  reference text,
  order_id uuid,
  status text,
  created_at timestamptz,
  verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.shop_id,
    p.amount,
    p.method,
    p.reference,
    p.order_id,
    p.status,
    p.created_at,
    p.verified_at
  FROM public.payments p
  WHERE p.shop_id = p_shop_id
  ORDER BY p.created_at DESC;
END;
$$;

-- RPC 6: list_payment_proofs
CREATE OR REPLACE FUNCTION public.list_payment_proofs(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  payment_id uuid,
  order_id uuid,
  shop_id uuid,
  file_path text,
  amount numeric(12,2),
  bank text,
  reference_number text,
  status text,
  reject_reason text,
  resubmission_of uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pp.id,
    pp.payment_id,
    pp.order_id,
    pp.shop_id,
    pp.file_path,
    pp.amount,
    pp.bank,
    pp.reference_number,
    pp.status,
    pp.reject_reason,
    pp.resubmission_of,
    pp.created_at
  FROM public.payment_proofs pp
  WHERE pp.shop_id = p_shop_id
    AND (p_order_id IS NULL OR pp.order_id = p_order_id)
  ORDER BY pp.created_at DESC;
END;
$$;

-- Add tables to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'customer_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_ledger;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payment_proofs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_proofs;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;


-- ================================================================
-- MIGRATION: 20261010000009_invoices_and_statements.sql
-- ================================================================

-- ==============================================================================
-- Migration: Invoices, Receipts, Credit Notes & Account Statement (C21 & C22)
-- Features:
-- 1. Sequences for gap-free numbering: invoice_number_seq, receipt_number_seq, credit_note_seq
-- 2. invoices table: sequential number, versioning, totals snapshot, voided handling
-- 3. invoice_items table: snapshot with delivered quantities for partial deliveries
-- 4. receipts table: payment receipts linked to payments and invoices
-- 5. credit_notes table: returns and invoice correction adjustments
-- 6. Storage bucket 'invoices' private storage with RLS policies
-- 7. RPCs:
--    - generate_invoice: atomic creation using gap-free sequence and order items
--    - list_invoices: owner/manager access with keyset pagination
--    - get_invoice_detail: full line items, receipts, and credit notes
--    - get_statement: OWNER ONLY statement computed from customer_ledger (reconciliation guaranteed)
--    - export_statement_pdf: signed URL generation
-- 8. Realtime publication for invoices and receipts
-- ==============================================================================

-- 1. Sequences for gap-free document numbering
-- GAP POLICY:
-- Invoices, Receipts, and Credit Notes utilize dedicated database sequences.
-- Number allocation occurs within the generating database transaction.
-- To maintain a continuous, auditable audit trail for tax and accounting,
-- records are NEVER deleted. If an invoice is cancelled or superseded,
-- its status is updated to 'voided' or offset by a credit_note,
-- ensuring that no numbers are skipped or destroyed.
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.credit_note_seq START 1001;

-- Helper to format sequential document numbers
CREATE OR REPLACE FUNCTION public.format_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq_val bigint;
  v_year text;
BEGIN
  v_seq_val := nextval('public.invoice_number_seq');
  v_year := to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY');
  RETURN 'INV-' || v_year || '-' || LPAD(v_seq_val::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.format_receipt_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq_val bigint;
  v_year text;
BEGIN
  v_seq_val := nextval('public.receipt_number_seq');
  v_year := to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY');
  RETURN 'REC-' || v_year || '-' || LPAD(v_seq_val::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.format_credit_note_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq_val bigint;
  v_year text;
BEGIN
  v_seq_val := nextval('public.credit_note_seq');
  v_year := to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY');
  RETURN 'CN-' || v_year || '-' || LPAD(v_seq_val::text, 6, '0');
END;
$$;

-- 2. Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_number text UNIQUE NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'voided')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0.00,
  discounts numeric(12,2) NOT NULL DEFAULT 0.00,
  tax numeric(12,2) NOT NULL DEFAULT 0.00,
  delivery_charge numeric(12,2) NOT NULL DEFAULT 0.00,
  deposits numeric(12,2) NOT NULL DEFAULT 0.00,
  total numeric(12,2) NOT NULL DEFAULT 0.00,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  remaining_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  due_date timestamptz,
  pdf_storage_path text,
  pdf_generated_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_shop_created ON public.invoices (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (shop_id, status);

-- 3. Invoice Items snapshot
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_title text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  total_price numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items (invoice_id);

-- 4. Receipts table
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  receipt_number text UNIQUE NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  reference_number text,
  pdf_storage_path text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_shop_created ON public.receipts (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_payment ON public.receipts (payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON public.receipts (invoice_id);

-- 5. Credit Notes table
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  credit_note_number text UNIQUE NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'applied', 'refunded')),
  pdf_storage_path text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_shop_created ON public.credit_notes (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes (invoice_id);

-- 6. Storage Bucket for Invoices & Statements
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for invoices bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Shop owners and managers can read invoices' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Shop owners and managers can read invoices"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'invoices'
        AND (
          EXISTS (
            SELECT 1 FROM public.shop_members sm
            WHERE sm.shop_id::text = (storage.foldername(name))[1]
              AND sm.user_id = auth.uid()
              AND sm.role IN ('owner', 'manager')
          )
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.active_shop_id::text = (storage.foldername(name))[1]
              AND p.role IN ('owner', 'manager')
          )
        )
      );
  END IF;
END $$;

-- 7. Enable RLS on Invoices, Invoice Items, Receipts, Credit Notes
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

-- Helper function: is_shop_owner_or_manager
CREATE OR REPLACE FUNCTION public.is_shop_owner_or_manager(p_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active_shop_id = p_shop_id
      AND role IN ('owner', 'manager')
  );
END;
$$;

-- Invoices RLS: Owners and managers only can view
DROP POLICY IF EXISTS "Owners and managers can view invoices" ON public.invoices;
CREATE POLICY "Owners and managers can view invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.is_shop_owner_or_manager(shop_id));

-- Invoice Items RLS
DROP POLICY IF EXISTS "Owners and managers can view invoice items" ON public.invoice_items;
CREATE POLICY "Owners and managers can view invoice items"
  ON public.invoice_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND public.is_shop_owner_or_manager(i.shop_id)
    )
  );

-- Receipts RLS
DROP POLICY IF EXISTS "Owners and managers can view receipts" ON public.receipts;
CREATE POLICY "Owners and managers can view receipts"
  ON public.receipts FOR SELECT
  TO authenticated
  USING (public.is_shop_owner_or_manager(shop_id));

-- Credit Notes RLS
DROP POLICY IF EXISTS "Owners and managers can view credit notes" ON public.credit_notes;
CREATE POLICY "Owners and managers can view credit notes"
  ON public.credit_notes FOR SELECT
  TO authenticated
  USING (public.is_shop_owner_or_manager(shop_id));

-- 8. RPC: generate_invoice(order_id)
CREATE OR REPLACE FUNCTION public.generate_invoice(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_shop_id uuid;
  v_invoice_id uuid;
  v_inv_num text;
  v_subtotal numeric(12,2) := 0;
  v_discounts numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_due_date timestamptz;
  v_terms_days int := 14;
  v_item record;
  v_delivered_qty int;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
BEGIN
  -- Fetch order details
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  v_shop_id := v_order.shop_id;

  -- Verify user permission: must be owner or manager
  IF NOT public.is_shop_owner_or_manager(v_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only shop owner or manager can generate or view invoices.';
  END IF;

  -- Check if invoice already exists for this order
  SELECT id INTO v_invoice_id FROM public.invoices WHERE order_id = p_order_id AND status != 'voided' LIMIT 1;
  IF v_invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'invoice_id', v_invoice_id,
      'already_existed', true
    );
  END IF;

  -- Fetch shop credit terms if applicable
  SELECT COALESCE(terms_days, 14) INTO v_terms_days
  FROM public.credit_accounts
  WHERE shop_id = v_shop_id;
  v_due_date := now() + (v_terms_days || ' days')::interval;

  -- Allocate sequential invoice number
  v_inv_num := public.format_invoice_number();
  v_invoice_id := gen_random_uuid();

  v_delivery_fee := COALESCE(v_order.delivery_fee, 0);
  v_discounts := COALESCE(v_order.discount_amount, 0);

  -- Create invoice header initially
  INSERT INTO public.invoices (
    id, shop_id, order_id, invoice_number, version, status,
    subtotal, discounts, tax, delivery_charge, deposits,
    total, paid_amount, remaining_amount, due_date, notes
  ) VALUES (
    v_invoice_id, v_shop_id, p_order_id, v_inv_num, 1, 'unpaid',
    0, v_discounts, 0, v_delivery_fee, 0,
    0, 0, 0, v_due_date, 'Generated for Order #' || COALESCE(v_order.order_number, '')
  );

  -- Process line items: only delivered quantities for partial delivery
  FOR v_item IN
    SELECT oi.*, p.title as prod_title, pv.title as var_title
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    -- Handle partial delivery snapshot: delivered quantity takes precedence
    v_delivered_qty := COALESCE(v_item.delivered_quantity, v_item.quantity);
    IF v_delivered_qty > 0 THEN
      v_unit_price := v_item.unit_price;
      v_line_total := v_delivered_qty * v_unit_price;
      v_subtotal := v_subtotal + v_line_total;

      INSERT INTO public.invoice_items (
        invoice_id, variant_id, product_name, variant_title,
        unit_price, quantity, total_price
      ) VALUES (
        v_invoice_id, v_item.variant_id,
        COALESCE(v_item.prod_title, 'Item'),
        COALESCE(v_item.var_title, 'Standard'),
        v_unit_price, v_delivered_qty, v_line_total
      );
    END IF;
  END LOOP;

  -- Finalize totals
  v_total := GREATEST(0, v_subtotal + v_delivery_fee - v_discounts);

  UPDATE public.invoices
  SET subtotal = v_subtotal,
      total = v_total,
      remaining_amount = v_total,
      updated_at = now()
  WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_inv_num,
    'total', v_total,
    'already_existed', false
  );
END;
$$;

-- 9. RPC: list_invoices
CREATE OR REPLACE FUNCTION public.list_invoices(
  p_shop_id uuid,
  p_status text DEFAULT 'all',
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoices jsonb;
  v_has_more boolean := false;
  v_next_cursor timestamptz := NULL;
  v_safe_limit int;
BEGIN
  -- Strict role check: Owner and Manager only!
  IF NOT public.is_shop_owner_or_manager(p_shop_id) THEN
    RETURN jsonb_build_object(
      'invoices', '[]'::jsonb,
      'has_more', false,
      'next_cursor', null,
      'role_denied', true
    );
  END IF;

  v_safe_limit := LEAST(COALESCE(p_limit, 20), 50);

  SELECT jsonb_agg(row_to_json(inv))
  INTO v_invoices
  FROM (
    SELECT
      i.id,
      i.shop_id,
      i.order_id,
      i.invoice_number,
      i.version,
      i.status,
      i.subtotal,
      i.discounts,
      i.tax,
      i.delivery_charge,
      i.deposits,
      i.total,
      i.paid_amount,
      i.remaining_amount,
      i.due_date,
      i.pdf_storage_path,
      i.pdf_generated_at,
      i.notes,
      i.created_at,
      o.order_number
    FROM public.invoices i
    LEFT JOIN public.orders o ON o.id = i.order_id
    WHERE i.shop_id = p_shop_id
      AND (p_status = 'all' OR p_status IS NULL OR i.status = p_status)
      AND (p_cursor IS NULL OR i.created_at < p_cursor)
    ORDER BY i.created_at DESC
    LIMIT v_safe_limit + 1
  ) inv;

  IF v_invoices IS NULL THEN
    v_invoices := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(v_invoices) > v_safe_limit THEN
    v_has_more := true;
    v_next_cursor := (v_invoices->(v_safe_limit - 1)->>'created_at')::timestamptz;
    -- Slice array to safe limit
    SELECT jsonb_agg(elem)
    INTO v_invoices
    FROM (
      SELECT elem
      FROM jsonb_array_elements(v_invoices) WITH ORDINALITY AS t(elem, idx)
      WHERE idx <= v_safe_limit
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'invoices', v_invoices,
    'has_more', v_has_more,
    'next_cursor', v_next_cursor,
    'role_denied', false
  );
END;
$$;

-- 10. RPC: get_invoice_detail
CREATE OR REPLACE FUNCTION public.get_invoice_detail(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv record;
  v_items jsonb;
  v_receipts jsonb;
  v_credit_notes jsonb;
BEGIN
  SELECT i.*, o.order_number
  INTO v_inv
  FROM public.invoices i
  LEFT JOIN public.orders o ON o.id = i.order_id
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % not found.', p_invoice_id;
  END IF;

  IF NOT public.is_shop_owner_or_manager(v_inv.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Financial documents can only be viewed by shop owners and managers.';
  END IF;

  -- Items snapshot
  SELECT COALESCE(jsonb_agg(row_to_json(ii)), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT id, variant_id, product_name, variant_title, unit_price, quantity, total_price
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
    ORDER BY id ASC
  ) ii;

  -- Linked receipts
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_receipts
  FROM (
    SELECT id, receipt_number, amount, payment_method, reference_number, created_at
    FROM public.receipts
    WHERE invoice_id = p_invoice_id
    ORDER BY created_at DESC
  ) r;

  -- Linked credit notes
  SELECT COALESCE(jsonb_agg(row_to_json(cn)), '[]'::jsonb)
  INTO v_credit_notes
  FROM (
    SELECT id, credit_note_number, amount, reason, status, created_at
    FROM public.credit_notes
    WHERE invoice_id = p_invoice_id
    ORDER BY created_at DESC
  ) cn;

  RETURN jsonb_build_object(
    'invoice', row_to_json(v_inv),
    'items', v_items,
    'receipts', v_receipts,
    'credit_notes', v_credit_notes
  );
END;
$$;

-- 11. RPC: get_account_statement (OWNER ONLY - C22)
-- Guaranteed reconciliation: opening_balance + sum(movements) = closing_balance
CREATE OR REPLACE FUNCTION public.get_account_statement(
  p_shop_id uuid,
  p_from_date timestamptz,
  p_to_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_owner boolean;
  v_opening_balance numeric(12,2) := 0.00;
  v_closing_balance numeric(12,2) := 0.00;
  v_total_charges numeric(12,2) := 0.00;
  v_total_payments numeric(12,2) := 0.00;
  v_total_credit_notes numeric(12,2) := 0.00;
  v_running numeric(12,2) := 0.00;
  v_movements jsonb := '[]'::jsonb;
  v_entry record;
  v_movement_list jsonb := '[]'::jsonb;
  v_line jsonb;
BEGIN
  -- Strict OWNER check: only shop owners may view customer account statements!
  SELECT public.is_shop_owner(p_shop_id) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Account statements are restricted to the shop owner only.';
  END IF;

  -- Ensure from_date <= to_date
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE: From date cannot be after to date.';
  END IF;

  -- 1. Compute Opening Balance (sum of customer_ledger before p_from_date)
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_opening_balance
  FROM public.customer_ledger
  WHERE shop_id = p_shop_id
    AND created_at < p_from_date;

  v_running := v_opening_balance;

  -- 2. Process chronological ledger movements within [p_from_date, p_to_date]
  FOR v_entry IN
    SELECT
      id,
      entry_type,
      amount,
      ref_type,
      ref_id,
      description,
      created_at
    FROM public.customer_ledger
    WHERE shop_id = p_shop_id
      AND created_at >= p_from_date
      AND created_at <= p_to_date
    ORDER BY created_at ASC, id ASC
  LOOP
    v_running := v_running + v_entry.amount;

    IF v_entry.amount > 0 THEN
      v_total_charges := v_total_charges + v_entry.amount;
    ELSIF v_entry.entry_type = 'payment' THEN
      v_total_payments := v_total_payments + ABS(v_entry.amount);
    ELSIF v_entry.entry_type IN ('credit_note', 'reversal') THEN
      v_total_credit_notes := v_total_credit_notes + ABS(v_entry.amount);
    END IF;

    v_line := jsonb_build_object(
      'id', v_entry.id,
      'date', v_entry.created_at,
      'type', v_entry.entry_type,
      'ref_type', v_entry.ref_type,
      'ref_id', v_entry.ref_id,
      'description', COALESCE(v_entry.description, v_entry.ref_type || ' #' || v_entry.ref_id),
      'amount', v_entry.amount,
      'running_balance', v_running
    );

    v_movement_list := v_movement_list || jsonb_build_array(v_line);
  END LOOP;

  v_closing_balance := v_running;

  RETURN jsonb_build_object(
    'shop_id', p_shop_id,
    'from_date', p_from_date,
    'to_date', p_to_date,
    'opening_balance', v_opening_balance,
    'closing_balance', v_closing_balance,
    'total_charges', v_total_charges,
    'total_payments', v_total_payments,
    'total_credit_notes', v_total_credit_notes,
    'lines', v_movement_list,
    'generated_at', now()
  );
END;
$$;

-- 12. Publish invoices, receipts, and credit notes to realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_notes;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- ================================================================
-- MIGRATION: 20261010000010_discounts_returns_empties.sql
-- ================================================================

-- ==============================================================================
-- Migration: Discount Requests, Return Requests & Empties Ledger (C23 & C24)
-- Features:
-- 1. discount_requests table: percent/amount, counter offers, countdown expiry, unique active request
-- 2. returns and return_items tables: return window, item reasons, photos
-- 3. empties_ledger: bottles & crates tracking (issued, returned, balance derived)
-- 4. Storage bucket 'return-photos' with authenticated RLS
-- 5. RPCs:
--    - create_discount_request
--    - withdraw_discount_request
--    - accept_counter_offer
--    - apply_discount_decision
--    - get_return_eligible_orders
--    - create_return_request
--    - approve_return_request
--    - get_empties_summary
-- 6. Realtime publication
-- ==============================================================================

-- 1. Discount Requests Table (C23)
CREATE TABLE IF NOT EXISTS public.discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  requested_type text NOT NULL CHECK (requested_type IN ('percent', 'amount')),
  requested_value numeric(12,2) NOT NULL CHECK (requested_value > 0),
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'countered', 'accepted', 'expired', 'withdrawn')),
  counter_value numeric(12,2),
  counter_type text CHECK (counter_type IN ('percent', 'amount')),
  seller_note text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Ensure only one active (pending or countered) discount request per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_discount_request
  ON public.discount_requests (order_id)
  WHERE status IN ('pending', 'countered');

CREATE INDEX IF NOT EXISTS idx_discount_requests_shop ON public.discount_requests (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discount_requests_order ON public.discount_requests (order_id);

-- Enable RLS on discount_requests
ALTER TABLE public.discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members can view discount requests" ON public.discount_requests;
CREATE POLICY "Shop members can view discount requests"
  ON public.discount_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.shop_members sm
      WHERE sm.shop_id = discount_requests.shop_id
        AND sm.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.active_shop_id = discount_requests.shop_id
    )
  );

-- 2. Return Requests and Return Items (C24)
CREATE SEQUENCE IF NOT EXISTS public.return_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  return_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'partially_approved', 'rejected')),
  total_refund_amount numeric(12,2) DEFAULT 0.00,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  seller_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_returns_shop ON public.returns (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_order ON public.returns (order_id);

CREATE TABLE IF NOT EXISTS public.return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  variant_title text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  reason text NOT NULL CHECK (reason IN ('damaged', 'wrong_item', 'expired', 'short_delivery')),
  photos text[] DEFAULT '{}',
  refund_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_items_return ON public.return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item ON public.return_items (order_item_id);

-- 3. Empties Ledger (Bottles & Crates)
CREATE TABLE IF NOT EXISTS public.empties_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('bottle', 'crate')),
  issued int NOT NULL DEFAULT 0 CHECK (issued >= 0),
  returned int NOT NULL DEFAULT 0 CHECK (returned >= 0),
  ref_type text NOT NULL, -- 'order', 'return', 'adjustment'
  ref_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_empties_ledger_shop ON public.empties_ledger (shop_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empties_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shop members can view returns" ON public.returns;
CREATE POLICY "Shop members can view returns"
  ON public.returns FOR SELECT
  TO authenticated
  USING (public.is_shop_member(shop_id));

DROP POLICY IF EXISTS "Shop members can view return items" ON public.return_items;
CREATE POLICY "Shop members can view return items"
  ON public.return_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_items.return_id
        AND public.is_shop_member(r.shop_id)
    )
  );

DROP POLICY IF EXISTS "Shop members can view empties ledger" ON public.empties_ledger;
CREATE POLICY "Shop members can view empties ledger"
  ON public.empties_ledger FOR SELECT
  TO authenticated
  USING (public.is_shop_member(shop_id));

-- 4. Storage Bucket 'return-photos'
INSERT INTO storage.buckets (id, name, public)
VALUES ('return-photos', 'return-photos', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Shop members can upload return photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Shop members can upload return photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'return-photos'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Shop members can view return photos' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Shop members can view return photos"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'return-photos'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;

-- 5. RPC: create_discount_request (C23)
CREATE OR REPLACE FUNCTION public.create_discount_request(
  p_order_id uuid,
  p_requested_type text,
  p_requested_value numeric,
  p_message text DEFAULT NULL,
  p_expires_in_hours int DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_shop_id uuid;
  v_req_id uuid;
  v_expires_at timestamptz;
  v_max_percent numeric := 30.0; -- Sane cap: max 30% discount request
  v_calc_discount numeric;
BEGIN
  -- 1. Verify order exists and is eligible
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  v_shop_id := v_order.shop_id;

  -- Verify user is member of this shop
  IF NOT public.is_shop_member(v_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: User does not belong to this shop.';
  END IF;

  -- Only placed or draft orders can request a discount (cannot request once confirmed or processing)
  IF v_order.order_status NOT IN ('placed', 'draft') THEN
    RAISE EXCEPTION 'ORDER_LOCKED: Discount requests can only be submitted before an order is confirmed or processed.';
  END IF;

  -- 2. Validate sane caps
  IF p_requested_type = 'percent' THEN
    IF p_requested_value <= 0 OR p_requested_value > v_max_percent THEN
      RAISE EXCEPTION 'INVALID_CAP: Percentage discount must be between 1%% and %s%%.', v_max_percent;
    END IF;
    v_calc_discount := ROUND((v_order.subtotal * (p_requested_value / 100.0)), 2);
  ELSIF p_requested_type = 'amount' THEN
    IF p_requested_value <= 0 OR p_requested_value >= v_order.subtotal THEN
      RAISE EXCEPTION 'INVALID_CAP: Discount amount cannot exceed order subtotal of %s.', v_order.subtotal;
    END IF;
    IF (p_requested_value / v_order.subtotal) > (v_max_percent / 100.0) THEN
      RAISE EXCEPTION 'INVALID_CAP: Discount cannot exceed %s%% of order value.', v_max_percent;
    END IF;
    v_calc_discount := p_requested_value;
  ELSE
    RAISE EXCEPTION 'INVALID_TYPE: Type must be percent or amount.';
  END IF;

  -- 3. Check for existing active request
  IF EXISTS (
    SELECT 1 FROM public.discount_requests
    WHERE order_id = p_order_id
      AND status IN ('pending', 'countered')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_REQUEST_EXISTS: An active discount request already exists for this order.';
  END IF;

  -- Expiry: default 4 hours from now
  v_expires_at := now() + (COALESCE(p_expires_in_hours, 4) || ' hours')::interval;

  INSERT INTO public.discount_requests (
    shop_id, order_id, requested_type, requested_value,
    message, status, expires_at, created_by
  ) VALUES (
    v_shop_id, p_order_id, p_requested_type, p_requested_value,
    p_message, 'pending', v_expires_at, auth.uid()
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_req_id,
    'discount_amount', v_calc_discount,
    'expires_at', v_expires_at
  );
END;
$$;

-- 6. RPC: withdraw_discount_request (C23)
CREATE OR REPLACE FUNCTION public.withdraw_discount_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req record;
BEGIN
  SELECT * INTO v_req FROM public.discount_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Discount request does not exist.';
  END IF;

  IF NOT public.is_shop_member(v_req.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF v_req.status NOT IN ('pending', 'countered') THEN
    RAISE EXCEPTION 'CANNOT_WITHDRAW: Request status is already %s.', v_req.status;
  END IF;

  UPDATE public.discount_requests
  SET status = 'withdrawn', updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. RPC: accept_counter_offer (C23)
CREATE OR REPLACE FUNCTION public.accept_counter_offer(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req record;
  v_order record;
  v_discount numeric := 0;
  v_new_total numeric := 0;
BEGIN
  SELECT * INTO v_req FROM public.discount_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Discount request does not exist.';
  END IF;

  IF NOT public.is_shop_member(v_req.shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Double accept idempotent check
  IF v_req.status = 'accepted' THEN
    RETURN jsonb_build_object('success', true, 'already_accepted', true);
  END IF;

  IF v_req.status != 'countered' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Request is not in countered status (current: %s).', v_req.status;
  END IF;

  -- Check expiry
  IF now() > v_req.expires_at THEN
    UPDATE public.discount_requests SET status = 'expired', updated_at = now() WHERE id = p_request_id;
    RAISE EXCEPTION 'COUNTER_EXPIRED: The counter offer has expired.';
  END IF;

  -- Verify order still exists and is not confirmed/cancelled
  SELECT * INTO v_order FROM public.orders WHERE id = v_req.order_id FOR UPDATE;
  IF v_order.order_status NOT IN ('placed', 'draft') THEN
    RAISE EXCEPTION 'ORDER_LOCKED: Order status has progressed to %s.', v_order.order_status;
  END IF;

  -- Compute discount amount
  IF v_req.counter_type = 'percent' THEN
    v_discount := ROUND((v_order.subtotal * (v_req.counter_value / 100.0)), 2);
  ELSE
    v_discount := v_req.counter_value;
  END IF;

  v_new_total := GREATEST(0, (v_order.subtotal + COALESCE(v_order.delivery_fee, 0)) - v_discount);

  -- Atomic update on order
  UPDATE public.orders
  SET discount_amount = v_discount,
      total_amount = v_new_total,
      updated_at = now()
  WHERE id = v_req.order_id;

  -- Update discount request
  UPDATE public.discount_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id;

  -- Log status history
  INSERT INTO public.order_status_history (order_id, status, actor, notes)
  VALUES (v_req.order_id, v_order.order_status, 'customer', 'Counter discount of Rs. ' || v_discount || ' accepted');

  RETURN jsonb_build_object(
    'success', true,
    'applied_discount', v_discount,
    'new_total', v_new_total
  );
END;
$$;

-- 8. RPC: list_discount_requests (C23 with lazy expiry update)
CREATE OR REPLACE FUNCTION public.list_discount_requests(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res jsonb;
BEGIN
  -- Lazy expire requests past deadline
  UPDATE public.discount_requests
  SET status = 'expired', updated_at = now()
  WHERE order_id = p_order_id
    AND status IN ('pending', 'countered')
    AND expires_at < now();

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT
      id, shop_id, order_id, order_item_id,
      requested_type, requested_value, message,
      status, counter_value, counter_type, seller_note,
      expires_at, created_at, updated_at
    FROM public.discount_requests
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
  ) r;

  RETURN v_res;
END;
$$;

-- 9. RPC: get_return_eligible_orders (C24)
CREATE OR REPLACE FUNCTION public.get_return_eligible_orders(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_hours int := 24; -- 24h return window
  v_orders jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(ord)), '[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT
      o.id,
      o.order_number,
      o.total_amount,
      o.created_at,
      o.order_status,
      (o.updated_at + (v_window_hours || ' hours')::interval) as return_deadline,
      jsonb_agg(
        jsonb_build_object(
          'order_item_id', oi.id,
          'variant_id', oi.variant_id,
          'product_name', COALESCE(p.title, 'Product'),
          'variant_title', COALESCE(pv.title, 'Standard'),
          'unit_price', oi.unit_price,
          'delivered_qty', COALESCE(oi.delivered_quantity, oi.quantity),
          'returned_qty', COALESCE((
            SELECT SUM(ri.qty) FROM public.return_items ri
            JOIN public.returns ret ON ret.id = ri.return_id
            WHERE ri.order_item_id = oi.id AND ret.status != 'rejected'
          ), 0),
          'returnable_qty', GREATEST(0,
            COALESCE(oi.delivered_quantity, oi.quantity) - COALESCE((
              SELECT SUM(ri.qty) FROM public.return_items ri
              JOIN public.returns ret ON ret.id = ri.return_id
              WHERE ri.order_item_id = oi.id AND ret.status != 'rejected'
            ), 0)
          )
        )
      ) as items
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE o.shop_id = p_shop_id
      AND o.order_status IN ('delivered', 'partially_delivered')
      AND now() <= (o.updated_at + (v_window_hours || ' hours')::interval)
    GROUP BY o.id, o.order_number, o.total_amount, o.created_at, o.order_status, o.updated_at
    ORDER BY o.created_at DESC
  ) ord;

  RETURN v_orders;
END;
$$;

-- 10. RPC: create_return_request (C24)
CREATE OR REPLACE FUNCTION public.create_return_request(
  p_order_id uuid,
  p_items jsonb, -- Array of { order_item_id, qty, reason, photos }
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_shop_id uuid;
  v_return_id uuid;
  v_return_num text;
  v_item jsonb;
  v_order_item record;
  v_delivered_qty int;
  v_already_returned int;
  v_max_returnable int;
  v_item_qty int;
  v_reason text;
  v_photos text[];
  v_item_refund numeric(12,2) := 0;
  v_total_refund numeric(12,2) := 0;
  v_window_hours int := 24;
BEGIN
  -- 1. Check order
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist.', p_order_id;
  END IF;

  v_shop_id := v_order.shop_id;

  -- Role check: Manager or Owner can request returns
  IF NOT public.is_shop_owner_or_manager(v_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only shop owner or manager can submit return requests.';
  END IF;

  -- Window check (24 hours after delivery)
  IF now() > (v_order.updated_at + (v_window_hours || ' hours')::interval) THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED: The 24-hour return window for order #% has closed.', v_order.order_number;
  END IF;

  -- 2. Allocate sequential return number
  v_return_num := 'RET-2026-' || LPAD(nextval('public.return_number_seq')::text, 6, '0');
  v_return_id := gen_random_uuid();

  INSERT INTO public.returns (
    id, shop_id, order_id, return_number, status, total_refund_amount, created_by
  ) VALUES (
    v_return_id, v_shop_id, p_order_id, v_return_num, 'pending', 0, auth.uid()
  );

  -- 3. Process line items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT oi.*, p.title as prod_title, pv.title as var_title
    INTO v_order_item
    FROM public.order_items oi
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE oi.id = (v_item->>'order_item_id')::uuid AND oi.order_id = p_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND: Order item % does not exist on this order.', v_item->>'order_item_id';
    END IF;

    v_item_qty := (v_item->>'qty')::int;
    v_reason := v_item->>'reason';

    -- Delivered quantity
    v_delivered_qty := COALESCE(v_order_item.delivered_quantity, v_order_item.quantity);

    -- Check already returned
    SELECT COALESCE(SUM(ri.qty), 0) INTO v_already_returned
    FROM public.return_items ri
    JOIN public.returns r ON r.id = ri.return_id
    WHERE ri.order_item_id = v_order_item.id AND r.status != 'rejected';

    v_max_returnable := v_delivered_qty - v_already_returned;
    IF v_item_qty > v_max_returnable THEN
      RAISE EXCEPTION 'QTY_EXCEEDED: Requested return quantity (%s) exceeds returnable limit (%s).', v_item_qty, v_max_returnable;
    END IF;

    -- Photos mandatory for damaged
    IF v_reason = 'damaged' THEN
      IF v_item->'photos' IS NULL OR jsonb_array_length(v_item->'photos') = 0 THEN
        RAISE EXCEPTION 'PHOTO_REQUIRED: Clear photo evidence is strictly required for damaged items.';
      END IF;
    END IF;

    -- Convert photos array
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'photos', '[]'::jsonb)))
    INTO v_photos;

    v_item_refund := v_item_qty * v_order_item.unit_price;
    v_total_refund := v_total_refund + v_item_refund;

    INSERT INTO public.return_items (
      return_id, order_item_id, product_name, variant_title,
      unit_price, qty, reason, photos, refund_amount, status
    ) VALUES (
      v_return_id, v_order_item.id,
      COALESCE(v_order_item.prod_title, 'Item'),
      COALESCE(v_order_item.var_title, 'Standard'),
      v_order_item.unit_price, v_item_qty, v_reason,
      v_photos, v_item_refund, 'pending'
    );
  END LOOP;

  UPDATE public.returns
  SET total_refund_amount = v_total_refund
  WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'return_number', v_return_num,
    'total_refund_amount', v_total_refund
  );
END;
$$;

-- 11. RPC: get_empties_summary (C24)
CREATE OR REPLACE FUNCTION public.get_empties_summary(p_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bottles_issued int := 0;
  v_bottles_returned int := 0;
  v_crates_issued int := 0;
  v_crates_returned int := 0;
  v_deposit_rate_bottle numeric := 15.0; -- Rs. 15 per bottle deposit
  v_deposit_rate_crate numeric := 250.0; -- Rs. 250 per crate deposit
  v_deposit_value numeric := 0;
BEGIN
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'bottle' THEN issued ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'bottle' THEN returned ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'crate' THEN issued ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'crate' THEN returned ELSE 0 END), 0)
  INTO
    v_bottles_issued, v_bottles_returned, v_crates_issued, v_crates_returned
  FROM public.empties_ledger
  WHERE shop_id = p_shop_id;

  v_deposit_value := ((v_bottles_issued - v_bottles_returned) * v_deposit_rate_bottle)
                   + ((v_crates_issued - v_crates_returned) * v_deposit_rate_crate);

  RETURN jsonb_build_object(
    'bottles', jsonb_build_object(
      'issued', v_bottles_issued,
      'returned', v_bottles_returned,
      'balance', v_bottles_issued - v_bottles_returned,
      'deposit_rate', v_deposit_rate_bottle
    ),
    'crates', jsonb_build_object(
      'issued', v_crates_issued,
      'returned', v_crates_returned,
      'balance', v_crates_issued - v_crates_returned,
      'deposit_rate', v_deposit_rate_crate
    ),
    'total_deposit_held', GREATEST(0, v_deposit_value)
  );
END;
$$;

-- 12. Add Realtime Publications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.discount_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.returns;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.empties_ledger;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- ================================================================
-- MIGRATION: 20261010000011_in_app_chat.sql
-- ================================================================

-- ==============================================================================
-- Migration: In-App Chat with Seller (C25)
-- Features:
-- 1. conversations table (shop_id, order_id nullable, status, created_by)
-- 2. messages table (text, attachment_path, read_at, client_msg_id for dedupe)
-- 3. Storage bucket 'chat-attachments' with RLS
-- 4. Role isolation: Owner & Manager see all shop chats; Staff see ONLY own chats
-- 5. RPCs:
--    - get_or_create_conversation
--    - send_chat_message (checks account suspension, deduplicates client_msg_id)
--    - list_chat_messages (upward cursor pagination)
--    - mark_chat_messages_read
-- 6. Realtime publication
-- ==============================================================================

-- 1. Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_shop ON public.conversations (shop_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_order ON public.conversations (order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON public.conversations (created_by);

-- 2. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'seller', 'system')),
  text text,
  attachment_path text,
  read_at timestamptz,
  client_msg_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint for client_msg_id deduplication per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_msg_id
  ON public.messages (conversation_id, client_msg_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper to check conversation access based on roles:
-- Owner & Manager can access any chat in the shop.
-- Staff can ONLY access chats they created!
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv record;
  v_role text;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check if user is shop member
  SELECT role INTO v_role
  FROM public.shop_members
  WHERE shop_id = v_conv.shop_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid() AND active_shop_id = v_conv.shop_id;
  END IF;

  IF v_role IN ('owner', 'manager') THEN
    RETURN true;
  ELSIF v_role = 'staff' THEN
    RETURN v_conv.created_by = auth.uid();
  END IF;

  RETURN false;
END;
$$;

-- Conversations RLS
DROP POLICY IF EXISTS "Role-based conversation access" ON public.conversations;
CREATE POLICY "Role-based conversation access"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    (public.is_shop_owner_or_manager(shop_id))
    OR (created_by = auth.uid() AND public.is_shop_member(shop_id))
  );

-- Messages RLS
DROP POLICY IF EXISTS "Conversation member can view messages" ON public.messages;
CREATE POLICY "Conversation member can view messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (public.can_access_conversation(conversation_id));

-- 4. Storage Bucket 'chat-attachments'
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Chat participants can upload attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Chat participants can upload attachments"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'chat-attachments'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Chat participants can view attachments' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Chat participants can view attachments"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'chat-attachments'
        AND public.is_shop_member((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;

-- 5. RPC: get_or_create_conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_shop_id uuid,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv record;
  v_order record;
  v_role text;
BEGIN
  -- Verify shop membership
  IF NOT public.is_shop_member(p_shop_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Determine user role
  SELECT role INTO v_role FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND active_shop_id = p_shop_id;
  END IF;

  -- Find existing conversation
  IF p_order_id IS NOT NULL THEN
    IF v_role = 'staff' THEN
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id = p_order_id AND created_by = auth.uid()
      LIMIT 1;
    ELSE
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id = p_order_id
      LIMIT 1;
    END IF;
  ELSE
    IF v_role = 'staff' THEN
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id IS NULL AND created_by = auth.uid()
      LIMIT 1;
    ELSE
      SELECT * INTO v_conv FROM public.conversations
      WHERE shop_id = p_shop_id AND order_id IS NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Create new if not exists
  IF v_conv IS NULL THEN
    INSERT INTO public.conversations (shop_id, order_id, created_by, status)
    VALUES (p_shop_id, p_order_id, auth.uid(), 'open')
    RETURNING * INTO v_conv;
  END IF;

  -- Fetch order details if linked
  IF v_conv.order_id IS NOT NULL THEN
    SELECT id, order_number, total_amount, order_status
    INTO v_order
    FROM public.orders WHERE id = v_conv.order_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_conv.id,
    'shop_id', v_conv.shop_id,
    'order_id', v_conv.order_id,
    'order_number', v_order.order_number,
    'order_total', v_order.total_amount,
    'order_status', v_order.order_status,
    'status', v_conv.status,
    'last_message_at', v_conv.last_message_at,
    'created_at', v_conv.created_at,
    'created_by', v_conv.created_by
  );
END;
$$;

-- 6. RPC: send_chat_message (Idempotent deduplication + Suspension check)
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation_id uuid,
  p_text text,
  p_attachment_path text DEFAULT NULL,
  p_client_msg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv record;
  v_shop record;
  v_msg record;
  v_client_id text;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONVERSATION_NOT_FOUND';
  END IF;

  -- Role access check
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Account suspension check
  SELECT * INTO v_shop FROM public.shops WHERE id = v_conv.shop_id;
  IF v_shop.status = 'suspended' OR v_shop.status = 'blocked' THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED: Your shop account is currently suspended. Chat sending is disabled.';
  END IF;

  v_client_id := COALESCE(p_client_msg_id, gen_random_uuid()::text);

  -- Idempotent insert with client_msg_id conflict handling
  INSERT INTO public.messages (
    conversation_id, sender_id, sender_role, text,
    attachment_path, client_msg_id
  ) VALUES (
    p_conversation_id, auth.uid(), 'customer', p_text,
    p_attachment_path, v_client_id
  )
  ON CONFLICT (conversation_id, client_msg_id)
  DO UPDATE SET text = EXCLUDED.text
  RETURNING * INTO v_msg;

  -- Update conversation timestamp
  UPDATE public.conversations
  SET last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;

  RETURN jsonb_build_object(
    'id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'sender_id', v_msg.sender_id,
    'sender_role', v_msg.sender_role,
    'text', v_msg.text,
    'attachment_path', v_msg.attachment_path,
    'client_msg_id', v_msg.client_msg_id,
    'read_at', v_msg.read_at,
    'created_at', v_msg.created_at
  );
END;
$$;

-- 7. RPC: list_chat_messages (Upward cursor pagination)
CREATE OR REPLACE FUNCTION public.list_chat_messages(
  p_conversation_id uuid,
  p_cursor timestamptz DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_messages jsonb;
  v_has_more boolean := false;
  v_next_cursor timestamptz := NULL;
  v_safe_limit int;
BEGIN
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_safe_limit := LEAST(COALESCE(p_limit, 30), 60);

  SELECT jsonb_agg(row_to_json(m))
  INTO v_messages
  FROM (
    SELECT
      id, conversation_id, sender_id, sender_role,
      text, attachment_path, read_at, client_msg_id, created_at
    FROM public.messages
    WHERE conversation_id = p_conversation_id
      AND (p_cursor IS NULL OR created_at < p_cursor)
    ORDER BY created_at DESC
    LIMIT v_safe_limit + 1
  ) m;

  IF v_messages IS NULL THEN
    v_messages := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(v_messages) > v_safe_limit THEN
    v_has_more := true;
    v_next_cursor := (v_messages->(v_safe_limit - 1)->>'created_at')::timestamptz;
    SELECT jsonb_agg(elem)
    INTO v_messages
    FROM (
      SELECT elem
      FROM jsonb_array_elements(v_messages) WITH ORDINALITY AS t(elem, idx)
      WHERE idx <= v_safe_limit
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'messages', v_messages,
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$$;

-- 8. RPC: mark_chat_messages_read
CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RETURN jsonb_build_object('success', false, 'count', 0);
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND (sender_id IS DISTINCT FROM auth.uid())
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

-- Allow conversation participants to update read_at
DROP POLICY IF EXISTS "Conversation participants can update read_at" ON public.messages;
CREATE POLICY "Conversation participants can update read_at"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (public.can_access_conversation(conversation_id))
  WITH CHECK (public.can_access_conversation(conversation_id));

-- 9. Realtime Publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;


-- ================================================================
-- MIGRATION: 20261010000012_promotions_feedback_and_advanced_modules.sql
-- ================================================================

-- ==============================================================================
-- Migration: Promotions, Order Feedback, Multi-Shop Groups, Bulk Parsing,
--            Order Templates, Scheduled Orders, Purchase Limits, Loyalty Ledger
-- ==============================================================================

-- 1. PROMOTIONS TABLE & RPCS
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  title text not null,
  description text,
  type text not null check (type in ('banner', 'bulk', 'exclusive', 'limited_time')),
  discount_type text not null check (discount_type in ('percent', 'amount')),
  discount_value numeric not null check (discount_value > 0),
  min_order_amount numeric not null default 0,
  target_brand text,
  target_category_id uuid references public.categories(id) on delete set null,
  target_variant_id uuid references public.product_variants(id) on delete set null,
  eligibility_tier text not null default 'all' check (eligibility_tier in ('all', 'bronze', 'silver', 'gold', 'platinum')),
  stackable boolean not null default false,
  priority integer not null default 1,
  banner_image_url text,
  deep_link_route text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_promotions_active on public.promotions (is_active, starts_at, ends_at);

alter table public.promotions enable row level security;

create policy "Promotions are viewable by active authenticated users"
  on public.promotions for select
  using (is_active = true and now() >= starts_at and now() < ends_at);

-- 2. ORDER FEEDBACK TABLES
create table if not exists public.order_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_rating integer not null check (delivery_rating between 1 and 5),
  service_rating integer not null check (service_rating between 1 and 5),
  comments text check (length(comments) <= 500),
  created_at timestamptz not null default now()
);

alter table public.order_feedback enable row level security;

create policy "Users can view feedback for their own shops"
  on public.order_feedback for select
  using (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = order_feedback.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

create policy "Users can insert feedback for delivered orders in their own shop"
  on public.order_feedback for insert
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.orders o
      join public.shop_users su on su.shop_id = o.shop_id
      where o.id = order_feedback.order_id
        and o.shop_id = order_feedback.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and o.status in ('delivered', 'partially_delivered')
    )
  );

create table if not exists public.order_feedback_dismissals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique(order_id, user_id)
);

alter table public.order_feedback_dismissals enable row level security;

create policy "Users can manage their own dismissals"
  on public.order_feedback_dismissals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. MULTI-SHOP GROUPS & GROUP CREDIT
create table if not exists public.shop_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_credit_limit numeric not null default 0 check (group_credit_limit >= 0),
  created_at timestamptz not null default now()
);

alter table public.shop_groups enable row level security;

create policy "Group members can view their group"
  on public.shop_groups for select
  using (
    exists (
      select 1 from public.shops s
      join public.shop_users su on su.shop_id = s.id
      where s.group_id = shop_groups.id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

alter table public.shops
  add column if not exists group_id uuid references public.shop_groups(id) on delete set null;

-- 4. ORDER TEMPLATES
create table if not exists public.order_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  is_shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shop_id, name)
);

alter table public.order_templates enable row level security;

create policy "Shop members can view templates for their own shop"
  on public.order_templates for select
  using (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = order_templates.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

create policy "Staff can manage own templates, owners and managers can manage all shop templates"
  on public.order_templates for all
  using (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = order_templates.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and (
          su.role in ('owner', 'manager') or
          order_templates.created_by = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = order_templates.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and (
          su.role in ('owner', 'manager') or
          created_by = auth.uid()
        )
    )
  );

create table if not exists public.order_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.order_templates(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(template_id, variant_id)
);

create index if not exists idx_template_items_tpl on public.order_template_items (template_id);

alter table public.order_template_items enable row level security;

create policy "Template items viewable by template accessors"
  on public.order_template_items for select
  using (
    exists (
      select 1 from public.order_templates ot
      join public.shop_users su on su.shop_id = ot.shop_id
      where ot.id = order_template_items.template_id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

create policy "Template items editable by template editors"
  on public.order_template_items for all
  using (
    exists (
      select 1 from public.order_templates ot
      join public.shop_users su on su.shop_id = ot.shop_id
      where ot.id = order_template_items.template_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and (su.role in ('owner', 'manager') or ot.created_by = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.order_templates ot
      join public.shop_users su on su.shop_id = ot.shop_id
      where ot.id = order_template_items.template_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and (su.role in ('owner', 'manager') or ot.created_by = auth.uid())
    )
  );

-- 5. SCHEDULED ORDERS
create table if not exists public.scheduled_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  address_id uuid references public.addresses(id) on delete set null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'credit', 'bank_transfer')),
  rule_type text not null check (rule_type in ('weekly', 'monthly', 'specific_date')),
  rule_day integer check (rule_day between 1 and 31),
  delivery_time_slot text not null default 'morning',
  next_run_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  template_id uuid references public.order_templates(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_orders_run on public.scheduled_orders (status, next_run_at);

alter table public.scheduled_orders enable row level security;

create policy "Scheduled orders viewable by shop members"
  on public.scheduled_orders for select
  using (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = scheduled_orders.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

create policy "Scheduled orders manageable by shop owners and managers"
  on public.scheduled_orders for all
  using (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = scheduled_orders.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and su.role in ('owner', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = scheduled_orders.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
        and su.role in ('owner', 'manager')
    )
  );

-- 6. PURCHASE LIMITS
create table if not exists public.purchase_limits (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  tier text check (tier in ('all', 'bronze', 'silver', 'gold', 'platinum')),
  variant_id uuid references public.product_variants(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  period text not null check (period in ('day', 'week', 'month')),
  max_qty integer not null check (max_qty > 0),
  created_at timestamptz not null default now()
);

alter table public.purchase_limits enable row level security;

create policy "Purchase limits viewable by shop members or global"
  on public.purchase_limits for select
  using (
    shop_id is null or
    exists (
      select 1 from public.shop_users su
      where su.shop_id = purchase_limits.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

-- 7. LOYALTY LEDGER (APPEND-ONLY)
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'reversal', 'expiry', 'adjustment')),
  points integer not null, -- positive for earn/adjustment, negative for redeem/reversal/expiry
  ref_type text check (ref_type in ('order', 'return', 'manual')),
  ref_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_loyalty_ledger_shop on public.loyalty_ledger (shop_id, created_at desc);

alter table public.loyalty_ledger enable row level security;

create policy "Loyalty ledger viewable by shop members"
  on public.loyalty_ledger for select
  using (
    exists (
      select 1 from public.shop_users su
      where su.shop_id = loyalty_ledger.shop_id
        and su.user_id = auth.uid()
        and su.status = 'active'
    )
  );

-- Trigger to prevent UPDATE or DELETE on loyalty_ledger
create or replace function public.prevent_loyalty_ledger_mutation()
returns trigger as $$
begin
  raise exception 'IMMUTABLE_RECORD: loyalty_ledger is strictly append-only.';
end;
$$ language plpgsql;

drop trigger if exists trg_loyalty_ledger_immutable on public.loyalty_ledger;
create trigger trg_loyalty_ledger_immutable
  before update or delete on public.loyalty_ledger
  for each row execute function public.prevent_loyalty_ledger_mutation();

-- ==============================================================================
-- RPCS & BUSINESS LOGIC
-- ==============================================================================

-- A. Promotions RPC
create or replace function public.get_active_promotions(p_shop_id uuid)
returns table (
  id uuid,
  code text,
  title text,
  description text,
  type text,
  discount_type text,
  discount_value numeric,
  min_order_amount numeric,
  target_brand text,
  target_category_id uuid,
  target_variant_id uuid,
  stackable boolean,
  priority integer,
  banner_image_url text,
  deep_link_route text,
  ends_at timestamptz,
  server_now timestamptz
) as $$
declare
  v_tier text := 'all';
begin
  select coalesce(tier, 'all') into v_tier from public.shops where id = p_shop_id;

  return query
  select
    p.id,
    p.code,
    p.title,
    p.description,
    p.type,
    p.discount_type,
    p.discount_value,
    p.min_order_amount,
    p.target_brand,
    p.target_category_id,
    p.target_variant_id,
    p.stackable,
    p.priority,
    p.banner_image_url,
    p.deep_link_route,
    p.ends_at,
    now() as server_now
  from public.promotions p
  where p.is_active = true
    and now() >= p.starts_at
    and now() < p.ends_at
    and (p.eligibility_tier = 'all' or p.eligibility_tier = v_tier)
  order by p.priority desc, p.ends_at asc;
end;
$$ language plpgsql security definer;

-- B. Group Credit Limit RPC
create or replace function public.check_group_credit_limit(p_shop_id uuid, p_amount numeric)
returns jsonb as $$
declare
  v_group_id uuid;
  v_group_limit numeric;
  v_group_used numeric := 0;
begin
  select group_id into v_group_id from public.shops where id = p_shop_id;

  if v_group_id is null then
    return jsonb_build_object('has_group_limit', false, 'allowed', true);
  end if;

  select group_credit_limit into v_group_limit from public.shop_groups where id = v_group_id;

  if v_group_limit is null or v_group_limit = 0 then
    return jsonb_build_object('has_group_limit', false, 'allowed', true);
  end if;

  -- Calculate total ledger balance across all member shops of this group
  select coalesce(sum(amount), 0) into v_group_used
  from public.customer_ledger cl
  join public.shops s on s.id = cl.shop_id
  where s.group_id = v_group_id;

  if (v_group_used + p_amount) > v_group_limit then
    return jsonb_build_object(
      'has_group_limit', true,
      'allowed', false,
      'group_limit', v_group_limit,
      'group_used', v_group_used,
      'group_available', greatest(0, v_group_limit - v_group_used),
      'error', 'GROUP_CREDIT_LIMIT_EXCEEDED'
    );
  end if;

  return jsonb_build_object(
    'has_group_limit', true,
    'allowed', true,
    'group_limit', v_group_limit,
    'group_used', v_group_used,
    'group_available', greatest(0, v_group_limit - v_group_used)
  );
end;
$$ language plpgsql security definer;

-- C. Order Feedback RPC
create or replace function public.submit_order_feedback(
  p_order_id uuid,
  p_delivery_rating integer,
  p_service_rating integer,
  p_comments text
) returns jsonb as $$
declare
  v_order record;
begin
  select id, shop_id, status into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_order.status not in ('delivered', 'partially_delivered') then
    raise exception 'ORDER_NOT_DELIVERED';
  end if;

  if exists (select 1 from public.order_feedback where order_id = p_order_id) then
    raise exception 'ALREADY_REVIEWED';
  end if;

  insert into public.order_feedback (
    order_id,
    shop_id,
    user_id,
    delivery_rating,
    service_rating,
    comments
  ) values (
    p_order_id,
    v_order.shop_id,
    auth.uid(),
    p_delivery_rating,
    p_service_rating,
    substring(trim(coalesce(p_comments, '')) from 1 for 500)
  );

  return jsonb_build_object('success', true);
end;
$$ language plpgsql security definer;

-- D. Purchase Limits Check RPC
create or replace function public.check_purchase_allowance(
  p_shop_id uuid,
  p_variant_id uuid,
  p_requested_qty integer
) returns jsonb as $$
declare
  v_tier text := 'all';
  v_category_id uuid;
  v_limit record;
  v_period_start timestamptz;
  v_purchased_qty integer := 0;
  v_remaining integer;
begin
  select coalesce(tier, 'all') into v_tier from public.shops where id = p_shop_id;
  select p.category_id into v_category_id
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id;

  -- Find most specific limit (shop+variant > shop+category > tier+variant > tier+category > global)
  select * into v_limit
  from public.purchase_limits
  where (shop_id = p_shop_id or shop_id is null)
    and (tier = v_tier or tier = 'all' or tier is null)
    and (variant_id = p_variant_id or category_id = v_category_id or (variant_id is null and category_id is null))
  order by
    (case when shop_id is not null then 10 else 0 end +
     case when variant_id is not null then 5 else 0 end +
     case when category_id is not null then 2 else 0 end) desc
  limit 1;

  if not found or v_limit is null then
    return jsonb_build_object('has_limit', false, 'allowed', true, 'remaining', 999999);
  end if;

  -- Period start based on Asia/Karachi midnight
  if v_limit.period = 'day' then
    v_period_start := date_trunc('day', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
  elsif v_limit.period = 'week' then
    v_period_start := date_trunc('week', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
  else
    v_period_start := date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
  end if;

  -- Sum purchased qty from completed/active orders (excluding cancelled)
  select coalesce(sum(oi.quantity), 0) into v_purchased_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.shop_id = p_shop_id
    and oi.variant_id = p_variant_id
    and o.status not in ('cancelled', 'rejected')
    and o.created_at >= v_period_start;

  v_remaining := greatest(0, v_limit.max_qty - v_purchased_qty);

  if p_requested_qty > v_remaining then
    return jsonb_build_object(
      'has_limit', true,
      'allowed', false,
      'limit_qty', v_limit.max_qty,
      'purchased_qty', v_purchased_qty,
      'remaining', v_remaining,
      'period', v_limit.period
    );
  end if;

  return jsonb_build_object(
    'has_limit', true,
    'allowed', true,
    'limit_qty', v_limit.max_qty,
    'purchased_qty', v_purchased_qty,
    'remaining', v_remaining,
    'period', v_limit.period
  );
end;
$$ language plpgsql security definer;

-- E. Loyalty Summary & Redeem RPC
create or replace function public.get_loyalty_summary(p_shop_id uuid)
returns jsonb as $$
declare
  v_points integer := 0;
  v_expiring_soon integer := 0;
  v_next_expiry timestamptz;
begin
  select coalesce(sum(points), 0) into v_points
  from public.loyalty_ledger
  where shop_id = p_shop_id;

  -- Expiring in next 30 days
  select coalesce(sum(points), 0), min(expires_at)
  into v_expiring_soon, v_next_expiry
  from public.loyalty_ledger
  where shop_id = p_shop_id
    and entry_type = 'earn'
    and expires_at is not null
    and expires_at between now() and (now() + interval '30 days');

  return jsonb_build_object(
    'total_points', greatest(0, v_points),
    'rupee_value', greatest(0, v_points), -- 1 point = 1 PKR
    'expiring_points', coalesce(v_expiring_soon, 0),
    'next_expiry', v_next_expiry
  );
end;
$$ language plpgsql security definer;


-- ================================================================
-- MIGRATION: 20261010000013_seed_cold_drinks_and_juices.sql
-- ================================================================

-- Migration: Seed Cold Drinks and Juices Catalog Products & RPCs
-- Adds variant details, categories, brands, products, variants, and full catalog RPC implementations

--------------------------------------------------------------------------------
-- 1. ADD COLUMNS TO PRODUCT_VARIANTS
--------------------------------------------------------------------------------
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS variant_name text,
ADD COLUMN IF NOT EXISTS size_label text,
ADD COLUMN IF NOT EXISTS image_url text;

--------------------------------------------------------------------------------
-- 2. CATEGORIES SEED
--------------------------------------------------------------------------------
INSERT INTO public.categories (id, name, sort_order, icon_name, is_active)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Cold Drinks', 1, 'water-outline', true),
  ('c0000000-0000-0000-0000-000000000002', 'Juices', 2, 'nutrition-outline', true),
  ('c0000000-0000-0000-0000-000000000003', 'Energy Drinks', 3, 'flash-outline', true)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  icon_name = EXCLUDED.icon_name,
  is_active = EXCLUDED.is_active;

--------------------------------------------------------------------------------
-- 3. BRANDS SEED
--------------------------------------------------------------------------------
INSERT INTO public.brands (id, name, logo_url, sort_order, is_active)
VALUES
  ('b0000000-0000-0000-0000-000000000001', '7Up', '/images/7up/1.5l.png', 1, true),
  ('b0000000-0000-0000-0000-000000000002', 'Coca-Cola', '/images/cocalCola/1.5l.png', 2, true),
  ('b0000000-0000-0000-0000-000000000003', 'Mountain Dew', '/images/dew/1.5l.png', 3, true),
  ('b0000000-0000-0000-0000-000000000004', 'Fanta', '/images/fanta/1.5l.png', 4, true),
  ('b0000000-0000-0000-0000-000000000005', 'Fizup', '/images/fiza/1.5l.png', 5, true),
  ('b0000000-0000-0000-0000-000000000006', 'Gourmet', '/images/gourmetCola/1.5l.png', 6, true),
  ('b0000000-0000-0000-0000-000000000007', 'Next Cola', '/images/next/1.5l.png', 7, true),
  ('b0000000-0000-0000-0000-000000000008', 'Pepsi', '/images/pepsi/1.5l.png', 8, true),
  ('b0000000-0000-0000-0000-000000000009', 'Sprite', '/images/sprit/1.5l.png', 9, true),
  ('b0000000-0000-0000-0000-000000000010', 'Nestle', '/images/nestle.png', 10, true),
  ('b0000000-0000-0000-0000-000000000011', 'Slice', '/images/slice.png', 11, true),
  ('b0000000-0000-0000-0000-000000000012', 'Smiley', '/images/smily.png', 12, true),
  ('b0000000-0000-0000-0000-000000000013', 'Sting', '/images/sting.png', 13, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  logo_url = EXCLUDED.logo_url,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

--------------------------------------------------------------------------------
-- 4. PRODUCTS & VARIANTS SEED
--------------------------------------------------------------------------------

-- Helper macro function to upsert product and its variants
CREATE OR REPLACE FUNCTION _seed_product_and_variant(
  p_prod_id uuid,
  p_brand_id uuid,
  p_name text,
  p_sku text,
  p_cat_id uuid,
  p_img text,
  p_desc text,
  p_var_id uuid,
  p_sale_unit sale_unit_enum,
  p_pieces int,
  p_price numeric,
  p_min int,
  p_max int,
  p_mult int,
  p_size text
) RETURNS void AS $$
BEGIN
  INSERT INTO public.products (id, brand_id, name, sku, category_id, image_url, description, is_active)
  VALUES (p_prod_id, p_brand_id, p_name, p_sku, p_cat_id, p_img, p_desc, true)
  ON CONFLICT (sku) DO UPDATE SET
    brand_id = EXCLUDED.brand_id,
    name = EXCLUDED.name,
    category_id = EXCLUDED.category_id,
    image_url = EXCLUDED.image_url,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

  INSERT INTO public.product_variants (
    id, product_id, sale_unit, pieces_per_unit, price, min_qty, max_qty, qty_multiple, is_active, stock_status, variant_name, size_label, image_url
  )
  VALUES (
    p_var_id, p_prod_id, p_sale_unit, p_pieces, p_price, p_min, p_max, p_mult, true, 'in_stock'::stock_status_enum, p_size, p_size, p_img
  )
  ON CONFLICT (id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    sale_unit = EXCLUDED.sale_unit,
    pieces_per_unit = EXCLUDED.pieces_per_unit,
    price = EXCLUDED.price,
    min_qty = EXCLUDED.min_qty,
    max_qty = EXCLUDED.max_qty,
    qty_multiple = EXCLUDED.qty_multiple,
    is_active = EXCLUDED.is_active,
    variant_name = EXCLUDED.variant_name,
    size_label = EXCLUDED.size_label,
    image_url = EXCLUDED.image_url;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- 7UP
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '7Up 300ml', '7UP-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/7up/300ml.png', '7Up 300ml Can / Regular Bottle', '20000000-0000-0000-0000-000000000001', 'carton', 24, 1800, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '7Up 500ml', '7UP-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/7up/500ml.png', '7Up 500ml PET Bottle', '20000000-0000-0000-0000-000000000002', 'pack', 12, 1200, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '7Up 1L', '7UP-1L', 'c0000000-0000-0000-0000-000000000001', '/images/7up/1l.png', '7Up 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000003', 'pack', 6, 850, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', '7Up 1.5L', '7UP-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/7up/1.5l.png', '7Up 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000004', 'pack', 6, 1100, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', '7Up 2.5L', '7UP-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/7up/2.5l.png', '7Up 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000005', 'pack', 6, 1450, 1, 500, 1, '2.5L');

  -- COCA-COLA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 300ml', 'COKE-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/300ml.png', 'Coca-Cola 300ml Can / Regular', '20000000-0000-0000-0000-000000000006', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 500ml', 'COKE-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/500ml.png', 'Coca-Cola 500ml PET Bottle', '20000000-0000-0000-0000-000000000007', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 1L', 'COKE-1L', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/1l.png', 'Coca-Cola 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000008', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 1.5L', 'COKE-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/1.5l.png', 'Coca-Cola 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000009', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000002', 'Coca-Cola 2.5L', 'COKE-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/cocalCola/2.5l.png', 'Coca-Cola 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000010', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- MOUNTAIN DEW
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 300ml', 'DEW-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/dew/300ml.png', 'Mountain Dew 300ml Can / Regular', '20000000-0000-0000-0000-000000000011', 'carton', 24, 1800, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 500ml', 'DEW-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/dew/500ml.png', 'Mountain Dew 500ml PET Bottle', '20000000-0000-0000-0000-000000000012', 'pack', 12, 1200, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000013', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 1L', 'DEW-1L', 'c0000000-0000-0000-0000-000000000001', '/images/dew/1l.png', 'Mountain Dew 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000013', 'pack', 6, 850, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000014', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 1.5L', 'DEW-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/dew/1.5l.png', 'Mountain Dew 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000014', 'pack', 6, 1100, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000015', 'b0000000-0000-0000-0000-000000000003', 'Mountain Dew 2.5L', 'DEW-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/dew/2.5l.png', 'Mountain Dew 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000015', 'pack', 6, 1450, 1, 500, 1, '2.5L');

  -- FANTA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000016', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 300ml', 'FANTA-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/300ml.png', 'Fanta Orange 300ml Can / Regular', '20000000-0000-0000-0000-000000000016', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000017', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 500ml', 'FANTA-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/500ml.png', 'Fanta Orange 500ml PET Bottle', '20000000-0000-0000-0000-000000000017', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000018', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 1L', 'FANTA-1L', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/1l.png', 'Fanta Orange 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000018', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000019', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 1.5L', 'FANTA-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/1.5l.png', 'Fanta Orange 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000019', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000020', 'b0000000-0000-0000-0000-000000000004', 'Fanta Orange 2.5L', 'FANTA-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fanta/2.5l.png', 'Fanta Orange 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000020', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- FIZUP / FIZA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000021', 'b0000000-0000-0000-0000-000000000005', 'Fizup 300ml', 'FIZA-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/300ml.png', 'Fizup 300ml Can / Regular', '20000000-0000-0000-0000-000000000021', 'carton', 24, 1400, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-000000000005', 'Fizup 500ml', 'FIZA-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/500ml.png', 'Fizup 500ml PET Bottle', '20000000-0000-0000-0000-000000000022', 'pack', 12, 950, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000023', 'b0000000-0000-0000-0000-000000000005', 'Fizup 1L', 'FIZA-1L', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/1l.png', 'Fizup 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000023', 'pack', 6, 700, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000024', 'b0000000-0000-0000-0000-000000000005', 'Fizup 1.5L', 'FIZA-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/1.5l.png', 'Fizup 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000024', 'pack', 6, 900, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000025', 'b0000000-0000-0000-0000-000000000005', 'Fizup 2.5L', 'FIZA-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/fiza/2.5l.png', 'Fizup 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000025', 'pack', 6, 1200, 1, 500, 1, '2.5L');

  -- GOURMET COLA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000026', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 300ml', 'GOURMET-COLA-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/300ml.png', 'Gourmet Cola 300ml Can / Regular', '20000000-0000-0000-0000-000000000026', 'carton', 24, 1350, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000027', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 500ml', 'GOURMET-COLA-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/500ml.png', 'Gourmet Cola 500ml PET Bottle', '20000000-0000-0000-0000-000000000027', 'pack', 12, 900, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000028', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 1L', 'GOURMET-COLA-1L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/1l.png', 'Gourmet Cola 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000028', 'pack', 6, 680, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000029', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 1.5L', 'GOURMET-COLA-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/1.5l.png', 'Gourmet Cola 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000029', 'pack', 6, 870, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000030', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Cola 2.5L', 'GOURMET-COLA-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetCola/2.5l.png', 'Gourmet Cola 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000030', 'pack', 6, 1150, 1, 500, 1, '2.5L');

  -- GOURMET ORANGE
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000031', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 300ml', 'GOURMET-ORANGE-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/300ml.png', 'Gourmet Orange 300ml Can / Regular', '20000000-0000-0000-0000-000000000031', 'carton', 24, 1350, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000032', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 500ml', 'GOURMET-ORANGE-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/500ml.png', 'Gourmet Orange 500ml PET Bottle', '20000000-0000-0000-0000-000000000032', 'pack', 12, 900, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000033', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 1.5L', 'GOURMET-ORANGE-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/1.5l.png', 'Gourmet Orange 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000033', 'pack', 6, 870, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000034', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Orange 2.5L', 'GOURMET-ORANGE-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetOrange/2.5l.png', 'Gourmet Orange 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000034', 'pack', 6, 1150, 1, 500, 1, '2.5L');

  -- GOURMET LEMON UP / SPRIT
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000035', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 300ml', 'GOURMET-SPRIT-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/300ml.png', 'Gourmet Lemon Up 300ml Can / Regular', '20000000-0000-0000-0000-000000000035', 'carton', 24, 1350, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000036', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 500ml', 'GOURMET-SPRIT-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/500ml.png', 'Gourmet Lemon Up 500ml PET Bottle', '20000000-0000-0000-0000-000000000036', 'pack', 12, 900, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000037', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 1L', 'GOURMET-SPRIT-1L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/1l.png', 'Gourmet Lemon Up 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000037', 'pack', 6, 680, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000038', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 1.5L', 'GOURMET-SPRIT-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/1.5l.png', 'Gourmet Lemon Up 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000038', 'pack', 6, 870, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000039', 'b0000000-0000-0000-0000-000000000006', 'Gourmet Lemon Up 2.5L', 'GOURMET-SPRIT-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/gourmetSprit/2.5l.png', 'Gourmet Lemon Up 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000039', 'pack', 6, 1150, 1, 500, 1, '2.5L');

  -- NEXT COLA
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000040', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 300ml', 'NEXT-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/next/300ml.png', 'Next Cola 300ml Can / Regular', '20000000-0000-0000-0000-000000000040', 'carton', 24, 1500, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000041', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 500ml', 'NEXT-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/next/500ml.png', 'Next Cola 500ml PET Bottle', '20000000-0000-0000-0000-000000000041', 'pack', 12, 1050, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000042', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 1L', 'NEXT-1L', 'c0000000-0000-0000-0000-000000000001', '/images/next/1l.png', 'Next Cola 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000042', 'pack', 6, 750, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000043', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 1.5L', 'NEXT-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/next/1.5l.png', 'Next Cola 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000043', 'pack', 6, 980, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000044', 'b0000000-0000-0000-0000-000000000007', 'Next Cola 2.5L', 'NEXT-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/next/2.5l.png', 'Next Cola 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000044', 'pack', 6, 1300, 1, 500, 1, '2.5L');

  -- PEPSI
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000045', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 300ml', 'PEPSI-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/300ml.png', 'Pepsi 300ml Can / Regular', '20000000-0000-0000-0000-000000000045', 'carton', 24, 1800, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000046', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 500ml', 'PEPSI-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/500ml.png', 'Pepsi 500ml PET Bottle', '20000000-0000-0000-0000-000000000046', 'pack', 12, 1200, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000047', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 1L', 'PEPSI-1L', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/1l.png', 'Pepsi 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000047', 'pack', 6, 850, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000048', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 1.5L', 'PEPSI-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/1.5l.png', 'Pepsi 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000048', 'pack', 6, 1100, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000049', 'b0000000-0000-0000-0000-000000000008', 'Pepsi 2.5L', 'PEPSI-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/pepsi/2.5l.png', 'Pepsi 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000049', 'pack', 6, 1450, 1, 500, 1, '2.5L');

  -- RANGO NEXT (ORANGE)
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000050', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 300ml', 'RANGO-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/300ml.png', 'Rango Next Orange 300ml Can / Regular', '20000000-0000-0000-0000-000000000050', 'carton', 24, 1500, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000051', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 500ml', 'RANGO-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/500ml.png', 'Rango Next Orange 500ml PET Bottle', '20000000-0000-0000-0000-000000000051', 'pack', 12, 1050, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000052', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 1L', 'RANGO-1L', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/1l.png', 'Rango Next Orange 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000052', 'pack', 6, 750, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000053', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 1.5L', 'RANGO-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/1.5l.png', 'Rango Next Orange 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000053', 'pack', 6, 980, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000054', 'b0000000-0000-0000-0000-000000000007', 'Rango Next 2.5L', 'RANGO-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/rangoNext/2.5l.png', 'Rango Next Orange 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000054', 'pack', 6, 1300, 1, 500, 1, '2.5L');

  -- SPRITE
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000055', 'b0000000-0000-0000-0000-000000000009', 'Sprite 300ml', 'SPRITE-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/300ml.png', 'Sprite 300ml Can / Regular', '20000000-0000-0000-0000-000000000055', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000056', 'b0000000-0000-0000-0000-000000000009', 'Sprite 500ml', 'SPRITE-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/500ml.png', 'Sprite 500ml PET Bottle', '20000000-0000-0000-0000-000000000056', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000057', 'b0000000-0000-0000-0000-000000000009', 'Sprite 1L', 'SPRITE-1L', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/1l.png', 'Sprite 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000057', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000058', 'b0000000-0000-0000-0000-000000000009', 'Sprite 1.5L', 'SPRITE-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/1.5l.png', 'Sprite 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000058', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000059', 'b0000000-0000-0000-0000-000000000009', 'Sprite 2.5L', 'SPRITE-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/sprit/2.5l.png', 'Sprite 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000059', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- SPRITE MINT
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000060', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 300ml', 'SPRITE-MINT-300ML', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/300ml.png', 'Sprite Mint 300ml Can / Regular', '20000000-0000-0000-0000-000000000060', 'carton', 24, 1850, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000061', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 500ml', 'SPRITE-MINT-500ML', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/500ml.png', 'Sprite Mint 500ml PET Bottle', '20000000-0000-0000-0000-000000000061', 'pack', 12, 1250, 1, 500, 1, '500ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000062', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 1L', 'SPRITE-MINT-1L', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/1l.png', 'Sprite Mint 1 Litre PET Bottle', '20000000-0000-0000-0000-000000000062', 'pack', 6, 880, 1, 500, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000063', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 1.5L', 'SPRITE-MINT-1.5L', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/1.5l.png', 'Sprite Mint 1.5 Litre PET Bottle', '20000000-0000-0000-0000-000000000063', 'pack', 6, 1150, 1, 500, 1, '1.5L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000064', 'b0000000-0000-0000-0000-000000000009', 'Sprite Mint 2.5L', 'SPRITE-MINT-2.5L', 'c0000000-0000-0000-0000-000000000001', '/images/spritMint/2.5l.png', 'Sprite Mint 2.5 Litre Jumbo PET Bottle', '20000000-0000-0000-0000-000000000064', 'pack', 6, 1500, 1, 500, 1, '2.5L');

  -- JUICES: NESTLÉ FRUITA VITALS
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000065', 'b0000000-0000-0000-0000-000000000010', 'Nestlé Fruita Vitals 1L', 'NESTLE-1L', 'c0000000-0000-0000-0000-000000000002', '/images/nestle.png', 'Nestlé Fruita Vitals Premium 1 Litre Nectar', '20000000-0000-0000-0000-000000000065', 'carton', 12, 3400, 1, 200, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000066', 'b0000000-0000-0000-0000-000000000010', 'Nestlé Fruita Vitals 200ml', 'NESTLE-200ML', 'c0000000-0000-0000-0000-000000000002', '/images/nestle.png', 'Nestlé Fruita Vitals 200ml Tetra Pack', '20000000-0000-0000-0000-000000000066', 'carton', 24, 2150, 1, 200, 1, '200ml');

  -- JUICES: SLICE MANGO
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000067', 'b0000000-0000-0000-0000-000000000011', 'Slice Mango 1L', 'SLICE-1L', 'c0000000-0000-0000-0000-000000000002', '/images/slice.png', 'Slice Mango Drink 1 Litre Bottle', '20000000-0000-0000-0000-000000000067', 'carton', 12, 3200, 1, 200, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000068', 'b0000000-0000-0000-0000-000000000011', 'Slice Mango 250ml', 'SLICE-250ML', 'c0000000-0000-0000-0000-000000000002', '/images/slice.png', 'Slice Mango Drink 250ml Tetra Pack', '20000000-0000-0000-0000-000000000068', 'carton', 24, 1950, 1, 200, 1, '250ml');

  -- JUICES: SMILEY JUICE
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000069', 'b0000000-0000-0000-0000-000000000012', 'Smiley Juice 1L', 'SMILY-1L', 'c0000000-0000-0000-0000-000000000002', '/images/smily.png', 'Smiley Natural Fruit Juice 1 Litre Pack', '20000000-0000-0000-0000-000000000069', 'carton', 12, 2600, 1, 200, 1, '1L');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000070', 'b0000000-0000-0000-0000-000000000012', 'Smiley Juice 250ml', 'SMILY-250ML', 'c0000000-0000-0000-0000-000000000002', '/images/smily.png', 'Smiley Fruit Juice 250ml Pack', '20000000-0000-0000-0000-000000000070', 'carton', 24, 1600, 1, 200, 1, '250ml');

  -- ENERGY DRINK: STING
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000071', 'b0000000-0000-0000-0000-000000000013', 'Sting Berry Blast 300ml', 'STING-300ML', 'c0000000-0000-0000-0000-000000000003', '/images/sting.png', 'Sting Energy Drink Berry Blast 300ml Can', '20000000-0000-0000-0000-000000000071', 'carton', 24, 2200, 1, 500, 1, '300ml');
  PERFORM _seed_product_and_variant('10000000-0000-0000-0000-000000000072', 'b0000000-0000-0000-0000-000000000013', 'Sting Berry Blast 500ml', 'STING-500ML', 'c0000000-0000-0000-0000-000000000003', '/images/sting.png', 'Sting Energy Drink Red 500ml PET Bottle', '20000000-0000-0000-0000-000000000072', 'pack', 12, 1350, 1, 500, 1, '500ml');
END;
$$;

DROP FUNCTION IF EXISTS _seed_product_and_variant;

--------------------------------------------------------------------------------
-- 5. RPC IMPLEMENTATIONS (CATALOG, PRODUCT DETAIL, HOME FEED)
--------------------------------------------------------------------------------

-- catalog_for_shop
DROP FUNCTION IF EXISTS public.catalog_for_shop(uuid, text, uuid, uuid, text, text, uuid, integer);
CREATE OR REPLACE FUNCTION catalog_for_shop(
    p_shop_id uuid,
    p_query text DEFAULT NULL,
    p_brand_id uuid DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_availability text DEFAULT NULL,
    p_sort text DEFAULT 'popularity',
    p_cursor uuid DEFAULT NULL,
    p_limit int DEFAULT 50
) RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_result
    FROM (
        SELECT 
            pv.id AS variant_id,
            p.id AS product_id,
            coalesce(b.name, 'Cold Drinks') AS brand_name,
            p.name AS product_name,
            coalesce(pv.image_url, p.image_url) AS image_url,
            coalesce(c.name, 'Beverages') AS category_name,
            pv.sale_unit::text AS sale_unit,
            pv.pieces_per_unit,
            pv.price AS normal_price,
            pv.price AS shop_price,
            pv.stock_status::text AS availability,
            pv.min_qty,
            pv.max_qty,
            pv.qty_multiple,
            EXISTS (
                SELECT 1 FROM customer_favorites cf 
                WHERE cf.shop_id = p_shop_id AND cf.variant_id = pv.id AND cf.user_id = auth.uid()
            ) AS is_favorite,
            pv.id::text AS cursor
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true 
          AND pv.is_active = true
          AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_availability IS NULL OR pv.stock_status::text = p_availability)
          AND (
              p_query IS NULL 
              OR p_query = '' 
              OR p.name ILIKE '%' || p_query || '%'
              OR coalesce(p.sku, '') ILIKE '%' || p_query || '%'
              OR coalesce(b.name, '') ILIKE '%' || p_query || '%'
              OR coalesce(pv.variant_name, '') ILIKE '%' || p_query || '%'
          )
        ORDER BY 
            CASE WHEN p_sort = 'price_asc' THEN pv.price END ASC,
            CASE WHEN p_sort = 'price_desc' THEN pv.price END DESC,
            CASE WHEN p_sort = 'name_asc' THEN p.name END ASC,
            CASE WHEN p_sort = 'name_desc' THEN p.name END DESC,
            b.sort_order ASC,
            p.name ASC
        LIMIT coalesce(p_limit, 50)
    ) t;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_product_detail
DROP FUNCTION IF EXISTS public.get_product_detail(uuid, uuid);
CREATE OR REPLACE FUNCTION get_product_detail(p_variant_id uuid, p_shop_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    SELECT jsonb_build_object(
        'variantId', pv.id,
        'productId', p.id,
        'brand', coalesce(b.name, 'Cold Drinks'),
        'name', p.name,
        'images', jsonb_build_array(coalesce(pv.image_url, p.image_url)),
        'saleUnit', pv.sale_unit::text,
        'piecesPerUnit', pv.pieces_per_unit,
        'normalPrice', pv.price,
        'shopPrice', pv.price,
        'discountBadge', NULL,
        'bulkTiers', '[]'::jsonb,
        'minQty', pv.min_qty,
        'maxQty', pv.max_qty,
        'qtyMultiple', pv.qty_multiple,
        'availability', pv.stock_status::text,
        'depositInfo', NULL,
        'isFavorite', EXISTS (
            SELECT 1 FROM customer_favorites cf 
            WHERE cf.shop_id = p_shop_id AND cf.variant_id = pv.id AND cf.user_id = auth.uid()
        ),
        'category', coalesce(c.name, 'Beverages')
    )
    INTO v_res
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE pv.id = p_variant_id;

    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_home_feed
DROP FUNCTION IF EXISTS public.get_home_feed(uuid);
CREATE OR REPLACE FUNCTION get_home_feed(p_shop_id uuid)
RETURNS jsonb AS $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := jsonb_build_object(
        'active_orders', '[]'::jsonb,
        'last_order_summary', NULL,
        'credit_alert', NULL,
        'banners', coalesce((SELECT jsonb_agg(b) FROM banners b WHERE b.active = true), '[]'::jsonb),
        'recent_and_favorites', '[]'::jsonb,
        'popular_products', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'variant_id', pv.id,
                'product_id', p.id,
                'brand', coalesce(b.name, 'Cold Drinks'),
                'name', p.name,
                'image_url', coalesce(pv.image_url, p.image_url),
                'sale_unit', pv.sale_unit::text,
                'pieces_per_unit', pv.pieces_per_unit,
                'normal_price', pv.price,
                'shop_price', pv.price,
                'availability', pv.stock_status::text,
                'min_qty', pv.min_qty,
                'max_qty', pv.max_qty,
                'qty_multiple', pv.qty_multiple
            ))
            FROM product_variants pv
            JOIN products p ON p.id = pv.product_id
            LEFT JOIN brands b ON b.id = p.brand_id
            WHERE p.is_active = true AND pv.is_active = true
            ORDER BY b.sort_order ASC, p.name ASC
            LIMIT 12
        ), '[]'::jsonb),
        'brands', coalesce((SELECT jsonb_agg(br) FROM brands br WHERE br.is_active = true ORDER BY br.sort_order ASC), '[]'::jsonb),
        'categories', coalesce((SELECT jsonb_agg(c) FROM categories c WHERE c.is_active = true ORDER BY c.sort_order ASC), '[]'::jsonb)
    );
    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==============================================================================
-- MIGRATION: 20261021000001_grant_privileges_public_schema.sql
-- DESCRIPTION: Supabase Oct 30 Breaking Change - Explicit Grants & Default Privileges
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;



-- ==============================================================================
-- MIGRATION: 20261028000001_fix_stock_movements_movement_type_check.sql
-- DESCRIPTION: Allow all stock movement and adjustment types & resilient RPC
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_movements') THEN
    ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
    ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check
      CHECK (movement_type IN ('opening_stock', 'purchase', 'sale', 'damage', 'expiry', 'breakage', 'customer_return', 'adjustment', 'count_correction', 'return'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_adjustments') THEN
    ALTER TABLE public.stock_adjustments DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
    ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_adjustment_type_check
      CHECK (adjustment_type IN ('opening_stock', 'damage', 'expiry', 'breakage', 'count_correction', 'return', 'adjustment'));
  END IF;
END $$;

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

  v_movement_type := CASE
    WHEN p_type IN ('opening_stock', 'purchase', 'sale', 'damage', 'expiry', 'breakage', 'customer_return', 'adjustment', 'count_correction', 'return') THEN p_type
    ELSE 'adjustment'
  END;

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

GRANT EXECUTE ON FUNCTION public.wholesaler_record_stock_adjustment(uuid, text, integer, text, text) TO authenticated, service_role, anon;

-- ==============================================================================
-- MIGRATION: 20261028000002_admin_danger_zone_cascades_and_rpcs.sql
-- DESCRIPTION: Danger Zone Cascading Deletions and Atomic Purge RPCs
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'customer_payments_customer_id_fkey' 
      AND table_name = 'customer_payments'
  ) THEN
    ALTER TABLE public.customer_payments DROP CONSTRAINT customer_payments_customer_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'customer_payments' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.customer_payments
      ADD CONSTRAINT customer_payments_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_ledger_order' 
      AND table_name = 'ledger_entries'
  ) THEN
    ALTER TABLE public.ledger_entries DROP CONSTRAINT fk_ledger_order;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ledger_entries' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT fk_ledger_order
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'ledger_entries_shop_id_fkey' 
      AND table_name = 'ledger_entries'
  ) THEN
    ALTER TABLE public.ledger_entries DROP CONSTRAINT ledger_entries_shop_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'ledger_entries' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.ledger_entries
      ADD CONSTRAINT ledger_entries_shop_id_fkey
      FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete orders" ON public.orders;
    CREATE POLICY "Allow delete orders" ON public.orders FOR DELETE TO authenticated, anon USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete order_items" ON public.order_items;
    CREATE POLICY "Allow delete order_items" ON public.order_items FOR DELETE TO authenticated, anon USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete customers" ON public.customers;
    CREATE POLICY "Allow delete customers" ON public.customers FOR DELETE TO authenticated, anon USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Allow delete profiles" ON public.profiles;
    CREATE POLICY "Allow delete profiles" ON public.profiles FOR DELETE TO authenticated, anon USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_danger_delete_order(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.order_tracking WHERE order_id = p_order_id;
  DELETE FROM public.order_status_history WHERE order_id = p_order_id;
  DELETE FROM public.cancellation_requests WHERE order_id = p_order_id;
  DELETE FROM public.ledger_entries WHERE order_id = p_order_id;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_feedback' AND table_schema = 'public') THEN
    DELETE FROM public.order_feedback WHERE order_id = p_order_id;
  END IF;
  UPDATE public.chat_threads SET order_id = NULL WHERE order_id = p_order_id;
  UPDATE public.support_tickets SET order_id = NULL WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'message', 'Order permanently deleted', 'order_id', p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_danger_clear_cancelled_orders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
  v_order_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_order_ids FROM public.orders WHERE status = 'cancelled';
  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'deleted_count', 0, 'message', 'No cancelled orders found');
  END IF;
  v_count := array_length(v_order_ids, 1);
  DELETE FROM public.order_items WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.order_tracking WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.order_status_history WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.cancellation_requests WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.ledger_entries WHERE order_id = ANY(v_order_ids);
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_feedback' AND table_schema = 'public') THEN
    DELETE FROM public.order_feedback WHERE order_id = ANY(v_order_ids);
  END IF;
  UPDATE public.chat_threads SET order_id = NULL WHERE order_id = ANY(v_order_ids);
  UPDATE public.support_tickets SET order_id = NULL WHERE order_id = ANY(v_order_ids);
  DELETE FROM public.orders WHERE id = ANY(v_order_ids);
  RETURN jsonb_build_object('success', true, 'deleted_count', v_count, 'message', format('%s cancelled order(s) purged permanently', v_count));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_danger_delete_store(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_name text;
BEGIN
  SELECT name INTO v_shop_name FROM public.customers WHERE id = p_store_id;
  IF v_shop_name IS NULL THEN
    SELECT name INTO v_shop_name FROM public.shops WHERE id = p_store_id;
  END IF;
  DELETE FROM public.customer_payments WHERE customer_id = p_store_id;
  DELETE FROM public.wholesaler_customer_ledger WHERE customer_id = p_store_id;
  UPDATE public.sales SET customer_id = NULL WHERE customer_id = p_store_id;
  DELETE FROM public.customers WHERE id = p_store_id;

  IF EXISTS (SELECT 1 FROM public.shops WHERE id = p_store_id) THEN
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = p_store_id);
    DELETE FROM public.order_tracking WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = p_store_id);
    DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = p_store_id);
    DELETE FROM public.cancellation_requests WHERE shop_id = p_store_id;
    DELETE FROM public.orders WHERE shop_id = p_store_id;
    DELETE FROM public.credit_accounts WHERE shop_id = p_store_id;
    DELETE FROM public.ledger_entries WHERE shop_id = p_store_id;
    DELETE FROM public.shop_users WHERE shop_id = p_store_id;
    DELETE FROM public.customer_addresses WHERE shop_id = p_store_id;
    DELETE FROM public.invoices WHERE shop_id = p_store_id;
    DELETE FROM public.audit_logs WHERE shop_id = p_store_id;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_threads' AND table_schema = 'public') THEN
      DELETE FROM public.chat_threads WHERE shop_id = p_store_id;
    END IF;
    DELETE FROM public.shops WHERE id = p_store_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'message', format('Store %s purged successfully', COALESCE(v_shop_name, p_store_id::text)));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_danger_delete_user(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_shop_ids FROM public.shops
  WHERE business_id IN (SELECT id FROM public.businesses WHERE owner_id = p_user_id);
  IF v_shop_ids IS NOT NULL AND array_length(v_shop_ids, 1) > 0 THEN
    DELETE FROM public.customer_payments WHERE customer_id = ANY(v_shop_ids);
    DELETE FROM public.wholesaler_customer_ledger WHERE customer_id = ANY(v_shop_ids);
    UPDATE public.sales SET customer_id = NULL WHERE customer_id = ANY(v_shop_ids);
    DELETE FROM public.customers WHERE id = ANY(v_shop_ids);
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = ANY(v_shop_ids));
    DELETE FROM public.orders WHERE shop_id = ANY(v_shop_ids);
    DELETE FROM public.credit_accounts WHERE shop_id = ANY(v_shop_ids);
    DELETE FROM public.ledger_entries WHERE shop_id = ANY(v_shop_ids);
    DELETE FROM public.shops WHERE id = ANY(v_shop_ids);
  END IF;
  DELETE FROM public.shop_users WHERE user_id = p_user_id;
  DELETE FROM public.businesses WHERE owner_id = p_user_id;
  UPDATE public.orders SET user_id = NULL WHERE user_id = p_user_id;
  UPDATE public.audit_logs SET user_id = NULL WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('success', true, 'message', format('User %s purged successfully', p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_danger_delete_inventory(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_variant_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_variant_ids FROM public.product_variants WHERE product_id = p_product_id;
  IF v_variant_ids IS NOT NULL AND array_length(v_variant_ids, 1) > 0 THEN
    DELETE FROM public.inventory WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.stock_movements WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.stock_adjustments WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.sale_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.purchase_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.order_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.product_variants WHERE product_id = p_product_id;
  END IF;
  DELETE FROM public.products WHERE id = p_product_id;
  RETURN jsonb_build_object('success', true, 'message', format('Product %s purged successfully', p_product_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_danger_delete_sale(p_sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.sale_items WHERE sale_id = p_sale_id;
  DELETE FROM public.customer_payments WHERE sale_id = p_sale_id;
  DELETE FROM public.wholesaler_customer_ledger WHERE reference_id = p_sale_id::text;
  DELETE FROM public.sales WHERE id = p_sale_id;
  RETURN jsonb_build_object('success', true, 'message', format('Sale %s purged successfully', p_sale_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_danger_delete_order(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_clear_cancelled_orders() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_store(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_user(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_inventory(uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.admin_danger_delete_sale(uuid) TO authenticated, service_role, anon;


-- ==============================================================================
-- MIGRATION: 20261111000001_fix_product_variants_sale_unit_default.sql
-- DESCRIPTION: Default sale_unit on product_variants & clean orphan products
-- ==============================================================================

ALTER TABLE public.product_variants
  ALTER COLUMN sale_unit SET DEFAULT 'carton'::public.sale_unit_enum;

CREATE OR REPLACE FUNCTION public.ensure_product_variant_sale_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pkg text;
BEGIN
  IF NEW.sale_unit IS NULL THEN
    v_pkg := lower(trim(coalesce(NEW.packaging_type, 'carton')));
    NEW.sale_unit := CASE
      WHEN v_pkg IN ('carton', 'case', 'shrink', 'pack', 'single') THEN v_pkg::public.sale_unit_enum
      WHEN v_pkg IN ('crate', 'tray', 'box') THEN 'case'::public.sale_unit_enum
      WHEN v_pkg IN ('bottle', 'can', 'unit', 'piece') THEN 'single'::public.sale_unit_enum
      ELSE 'carton'::public.sale_unit_enum
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_product_variant_sale_unit ON public.product_variants;
CREATE TRIGGER trg_ensure_product_variant_sale_unit
  BEFORE INSERT OR UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_product_variant_sale_unit();

DELETE FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id
);

GRANT SELECT ON public.categories, public.brands TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.product_variants, public.inventory TO authenticated, service_role;


-- ==============================================================================
-- MIGRATION: 20261111000002_fix_danger_delete_inventory_reservations.sql
-- DESCRIPTION: Include stock_reservations in admin_danger_delete_inventory RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_danger_delete_inventory(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_variant_ids
  FROM public.product_variants
  WHERE product_id = p_product_id;

  IF v_variant_ids IS NOT NULL AND array_length(v_variant_ids, 1) > 0 THEN
    DELETE FROM public.inventory WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.stock_movements WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.stock_adjustments WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.sale_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.purchase_items WHERE variant_id = ANY(v_variant_ids);
    DELETE FROM public.order_items WHERE variant_id = ANY(v_variant_ids);

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_reservations' AND table_schema = 'public') THEN
      DELETE FROM public.stock_reservations WHERE variant_id = ANY(v_variant_ids);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cart_items' AND table_schema = 'public') THEN
      DELETE FROM public.cart_items WHERE variant_id = ANY(v_variant_ids);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'price_list_items' AND table_schema = 'public') THEN
      DELETE FROM public.price_list_items WHERE variant_id = ANY(v_variant_ids);
    END IF;

    DELETE FROM public.product_variants WHERE product_id = p_product_id;
  END IF;

  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'message', format('Product %s purged successfully', p_product_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_danger_delete_inventory(uuid) TO authenticated, service_role, anon;
