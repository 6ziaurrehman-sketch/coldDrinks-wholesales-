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
