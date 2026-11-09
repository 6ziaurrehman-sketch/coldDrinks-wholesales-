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
