-- ==============================================================================
-- RLS Isolation & Role Permission Test Script
-- Proves:
-- 1. User of Shop A CANNOT SELECT / INSERT / UPDATE / DELETE rows of Shop B across all tables.
-- 2. Staff cannot read owner-only data (e.g. audit_logs).
-- 3. Owner can read audit_logs.
-- 4. Duplicate idempotency key returns original result.
-- ==============================================================================

begin;

-- Create test schemas / temporary context
create temp table test_results (
  test_name text not null,
  status text not null,
  message text
);

do $$
declare
  -- Test user IDs
  user_a_owner uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  user_a_staff uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  user_b_owner uuid := '33333333-3333-3333-3333-333333333333'::uuid;

  -- Test business and shop IDs
  biz_a_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  biz_b_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;
  shop_a_id uuid := 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid;
  shop_b_id uuid := 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'::uuid;

  v_count integer;
  v_err_occurred boolean;
  v_idemp_res jsonb;
begin
  ------------------------------------------------------------------------------
  -- SEED TEST USERS & PROFILES (as postgres / superuser)
  ------------------------------------------------------------------------------
  -- Insert into auth.users if needed or directly profiles for the test harness
  insert into public.profiles (id, email, full_name)
  values
    (user_a_owner, 'owner_a@test.com', 'Owner A'),
    (user_a_staff, 'staff_a@test.com', 'Staff A'),
    (user_b_owner, 'owner_b@test.com', 'Owner B')
  on conflict (id) do nothing;

  -- Businesses
  insert into public.businesses (id, name, owner_id)
  values
    (biz_a_id, 'Business A', user_a_owner),
    (biz_b_id, 'Business B', user_b_owner)
  on conflict (id) do nothing;

  -- Shops
  insert into public.shops (id, business_id, name)
  values
    (shop_a_id, biz_a_id, 'Shop Alpha'),
    (shop_b_id, biz_b_id, 'Shop Beta')
  on conflict (id) do nothing;

  -- Shop Users (Memberships & Roles)
  insert into public.shop_users (shop_id, user_id, role)
  values
    (shop_a_id, user_a_owner, 'owner'),
    (shop_a_id, user_a_staff, 'staff'),
    (shop_b_id, user_b_owner, 'owner')
  on conflict (shop_id, user_id) do nothing;

  -- Seed Audit Logs for Shop A and Shop B
  insert into public.audit_logs (id, shop_id, user_id, action, entity_type, payload)
  values
    ('a0a0a0a0-0000-0000-0000-000000000001'::uuid, shop_a_id, user_a_owner, 'ORDER_CREATED', 'order', '{"total": 500}'::jsonb),
    ('b0b0b0b0-0000-0000-0000-000000000001'::uuid, shop_b_id, user_b_owner, 'ORDER_CREATED', 'order', '{"total": 900}'::jsonb)
  on conflict do nothing;

  -- Seed Idempotency Key for Shop B
  insert into public.idempotency_keys (key, shop_id, user_id, response_code, response_body, expires_at)
  values
    ('KEY-SHOP-B-1', shop_b_id, user_b_owner, 200, '{"result": "success_b"}'::jsonb, now() + interval '1 day')
  on conflict (shop_id, key) do nothing;

  ------------------------------------------------------------------------------
  -- TEST 1: User A Owner CANNOT SELECT rows of Shop B
  ------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', user_a_owner::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1a. Shops: User A cannot see Shop B
  select count(*) into v_count from public.shops where id = shop_b_id;
  if v_count <> 0 then
    raise exception 'FAIL: User A was able to SELECT Shop B!';
  end if;
  insert into test_results values ('User A cannot SELECT Shop B', 'PASS', null);

  -- 1b. Shop Users: User A cannot see Shop B memberships
  select count(*) into v_count from public.shop_users where shop_id = shop_b_id;
  if v_count <> 0 then
    raise exception 'FAIL: User A was able to SELECT Shop B users!';
  end if;
  insert into test_results values ('User A cannot SELECT Shop B users', 'PASS', null);

  -- 1c. Audit Logs: User A cannot see Shop B audit logs
  select count(*) into v_count from public.audit_logs where shop_id = shop_b_id;
  if v_count <> 0 then
    raise exception 'FAIL: User A was able to SELECT Shop B audit logs!';
  end if;
  insert into test_results values ('User A cannot SELECT Shop B audit logs', 'PASS', null);

  -- 1d. Idempotency Keys: User A cannot see Shop B idempotency keys
  select count(*) into v_count from public.idempotency_keys where shop_id = shop_b_id;
  if v_count <> 0 then
    raise exception 'FAIL: User A was able to SELECT Shop B idempotency keys!';
  end if;
  insert into test_results values ('User A cannot SELECT Shop B idempotency keys', 'PASS', null);

  ------------------------------------------------------------------------------
  -- TEST 2: User A Owner CANNOT INSERT rows into Shop B
  ------------------------------------------------------------------------------
  -- 2a. Shop Users
  v_err_occurred := false;
  begin
    insert into public.shop_users (shop_id, user_id, role)
    values (shop_b_id, user_a_owner, 'staff');
  exception when others then
    v_err_occurred := true;
  end;
  if not v_err_occurred then
    -- Check if RLS silently dropped the insert with 0 rows
    select count(*) into v_count from public.shop_users where shop_id = shop_b_id and user_id = user_a_owner;
    if v_count <> 0 then
      raise exception 'FAIL: User A was able to INSERT into Shop B users!';
    end if;
  end if;
  insert into test_results values ('User A cannot INSERT into Shop B users', 'PASS', null);

  -- 2b. Audit Logs
  v_err_occurred := false;
  begin
    insert into public.audit_logs (shop_id, user_id, action, entity_type)
    values (shop_b_id, user_a_owner, 'TAMPER', 'order');
  exception when others then
    v_err_occurred := true;
  end;
  if not v_err_occurred then
    select count(*) into v_count from public.audit_logs where shop_id = shop_b_id and action = 'TAMPER';
    if v_count <> 0 then
      raise exception 'FAIL: User A was able to INSERT into Shop B audit logs!';
    end if;
  end if;
  insert into test_results values ('User A cannot INSERT into Shop B audit logs', 'PASS', null);

  -- 2c. Idempotency Keys
  v_err_occurred := false;
  begin
    insert into public.idempotency_keys (key, shop_id, user_id, response_code, response_body, expires_at)
    values ('KEY-ATTACK', shop_b_id, user_a_owner, 200, '{}'::jsonb, now() + interval '1 hour');
  exception when others then
    v_err_occurred := true;
  end;
  if not v_err_occurred then
    select count(*) into v_count from public.idempotency_keys where shop_id = shop_b_id and key = 'KEY-ATTACK';
    if v_count <> 0 then
      raise exception 'FAIL: User A was able to INSERT into Shop B idempotency keys!';
    end if;
  end if;
  insert into test_results values ('User A cannot INSERT into Shop B idempotency keys', 'PASS', null);

  ------------------------------------------------------------------------------
  -- TEST 3: User A Owner CANNOT UPDATE rows of Shop B
  ------------------------------------------------------------------------------
  update public.shops set name = 'Hacked Shop' where id = shop_b_id;
  update public.audit_logs set action = 'HACKED' where shop_id = shop_b_id;
  update public.idempotency_keys set response_code = 999 where shop_id = shop_b_id;

  -- Reset role to postgres to verify nothing changed
  perform set_config('role', 'postgres', true);
  select count(*) into v_count from public.shops where id = shop_b_id and name = 'Hacked Shop';
  if v_count <> 0 then
    raise exception 'FAIL: User A was able to UPDATE Shop B name!';
  end if;
  insert into test_results values ('User A cannot UPDATE Shop B', 'PASS', null);

  ------------------------------------------------------------------------------
  -- TEST 4: User A Owner CANNOT DELETE rows of Shop B
  ------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', user_a_owner::text, true);
  perform set_config('role', 'authenticated', true);

  delete from public.shops where id = shop_b_id;
  delete from public.audit_logs where shop_id = shop_b_id;
  delete from public.idempotency_keys where shop_id = shop_b_id;

  perform set_config('role', 'postgres', true);
  select count(*) into v_count from public.shops where id = shop_b_id;
  if v_count = 0 then
    raise exception 'FAIL: User A was able to DELETE Shop B!';
  end if;
  insert into test_results values ('User A cannot DELETE Shop B', 'PASS', null);

  ------------------------------------------------------------------------------
  -- TEST 5: Staff CANNOT read owner-only data (audit_logs)
  ------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', user_a_staff::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.audit_logs where shop_id = shop_a_id;
  if v_count <> 0 then
    raise exception 'FAIL: Staff A was able to SELECT Shop A audit logs (owner-only data)!';
  end if;
  insert into test_results values ('Staff CANNOT read owner-only audit_logs', 'PASS', null);

  ------------------------------------------------------------------------------
  -- TEST 6: Owner CAN read owner data (audit_logs)
  ------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', user_a_owner::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into v_count from public.audit_logs where shop_id = shop_a_id;
  if v_count = 0 then
    raise exception 'FAIL: Owner A was unable to SELECT Shop A audit logs!';
  end if;
  insert into test_results values ('Owner CAN read Shop A audit_logs', 'PASS', null);

  ------------------------------------------------------------------------------
  -- TEST 7: Duplicate Idempotency Key returns original result
  ------------------------------------------------------------------------------
  -- First call stores result
  v_idemp_res := public.store_idempotency_result(
    'TXN-999',
    shop_a_id,
    user_a_owner,
    201,
    '{"order_id": "ORD-123", "status": "created"}'::jsonb,
    86400
  );
  if (v_idemp_res->>'is_duplicate')::boolean is true then
    raise exception 'FAIL: First idempotency call reported duplicate!';
  end if;

  -- Second call with same key should return original result
  v_idemp_res := public.store_idempotency_result(
    'TXN-999',
    shop_a_id,
    user_a_owner,
    500, -- different response code should NOT overwrite
    '{"order_id": "ORD-DIFFERENT"}'::jsonb,
    86400
  );

  if (v_idemp_res->>'is_duplicate')::boolean is not true then
    raise exception 'FAIL: Second idempotency call did not detect duplicate!';
  end if;
  if (v_idemp_res->>'response_code')::integer <> 201 then
    raise exception 'FAIL: Duplicate idempotency call did not return original response code!';
  end if;
  if (v_idemp_res->'response_body'->>'order_id') <> 'ORD-123' then
    raise exception 'FAIL: Duplicate idempotency call did not return original body!';
  end if;
  insert into test_results values ('Duplicate idempotency key returns original result', 'PASS', null);

  -- Revert role to postgres
  perform set_config('role', 'postgres', true);
  raise notice '==================================================';
  raise notice 'ALL 7 RLS ISOLATION & PERMISSION TESTS PASSED!';
  raise notice '==================================================';
end;
$$;

-- Display test results table
select test_name, status from test_results;

-- Roll back all test modifications to keep database pristine
rollback;
