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
        and o.status::text in ('delivered', 'partially_delivered')
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

alter table public.shops
  add column if not exists group_id uuid references public.shop_groups(id) on delete set null;

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
  address_id uuid references public.customer_addresses(id) on delete set null,
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

  if v_order.status::text not in ('delivered', 'partially_delivered') then
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
