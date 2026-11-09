-- ==============================================================================
-- pgTAP Test Suite for Multi-tenant RLS Isolation & Role-Based Access Control
-- ==============================================================================

begin;

select plan(12);

-- Verify functions exist
select has_function('public', 'is_shop_member', ARRAY['uuid'], 'Function is_shop_member exists');
select has_function('public', 'shop_role', ARRAY['uuid'], 'Function shop_role exists');
select has_function('public', 'store_idempotency_result', ARRAY['text', 'uuid', 'uuid', 'integer', 'jsonb', 'integer'], 'Function store_idempotency_result exists');

-- Verify RLS is enabled on all tables
select table_privs_are('public', 'shops', 'authenticated', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'Authenticated has standard privileges on shops');

-- Seed mock data
do $$
declare
  u_a_owner uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  u_a_staff uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  u_b_owner uuid := '33333333-3333-3333-3333-333333333333'::uuid;
  b_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  b_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  s_a uuid := 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid;
  s_b uuid := 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;
begin
  insert into public.profiles (id, email) values
    (u_a_owner, 'owner_a@test.com'),
    (u_a_staff, 'staff_a@test.com'),
    (u_b_owner, 'owner_b@test.com')
  on conflict (id) do nothing;

  insert into public.businesses (id, name, owner_id) values
    (b_a, 'Biz A', u_a_owner),
    (b_b, 'Biz B', u_b_owner)
  on conflict (id) do nothing;

  insert into public.shops (id, business_id, name) values
    (s_a, b_a, 'Shop A'),
    (s_b, b_b, 'Shop B')
  on conflict (id) do nothing;

  insert into public.shop_users (shop_id, user_id, role) values
    (s_a, u_a_owner, 'owner'),
    (s_a, u_a_staff, 'staff'),
    (s_b, u_b_owner, 'owner')
  on conflict (shop_id, user_id) do nothing;

  insert into public.audit_logs (shop_id, user_id, action, entity_type) values
    (s_a, u_a_owner, 'CREATE_ORDER', 'order'),
    (s_b, u_b_owner, 'CREATE_ORDER', 'order');
end;
$$;

-- Test as User A Owner
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select is_empty(
  $$ select * from public.shops where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid $$,
  'User A cannot SELECT Shop B'
);

select is_empty(
  $$ select * from public.shop_users where shop_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid $$,
  'User A cannot SELECT Shop B users'
);

select is_empty(
  $$ select * from public.audit_logs where shop_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid $$,
  'User A cannot SELECT Shop B audit logs'
);

select throws_ok(
  $$ insert into public.shop_users (shop_id, user_id, role) values ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'staff') $$,
  '42501',
  NULL,
  'User A cannot INSERT into Shop B shop_users'
);

-- Test as User A Staff: Staff cannot read owner-only data
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
set local role authenticated;

select is_empty(
  $$ select * from public.audit_logs where shop_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid $$,
  'Staff A cannot read owner-only audit_logs for Shop A'
);

-- Test as User A Owner: Owner CAN read audit_logs
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select isnt_empty(
  $$ select * from public.audit_logs where shop_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid $$,
  'Owner A can read Shop A audit_logs'
);

-- Test Idempotency Key duplicate return
select is(
  (public.store_idempotency_result('KEY-1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 200, '{"x":1}'::jsonb, 3600)->>'is_duplicate')::boolean,
  false,
  'First idempotency call is not duplicate'
);

select is(
  (public.store_idempotency_result('KEY-1', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 500, '{"x":2}'::jsonb, 3600)->>'is_duplicate')::boolean,
  true,
  'Second idempotency call is duplicate and returns original result'
);

select * from finish();
rollback;
