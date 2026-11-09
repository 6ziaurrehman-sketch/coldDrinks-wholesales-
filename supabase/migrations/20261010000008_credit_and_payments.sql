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
DROP TABLE IF EXISTS public.payment_proofs CASCADE;
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
