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
