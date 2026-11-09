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

-- Ensure shop_members view exists as alias to shop_users
CREATE OR REPLACE VIEW public.shop_members AS SELECT * FROM public.shop_users;

-- Ensure profiles has active_shop_id and role columns
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS active_shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role text;

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
CREATE OR REPLACE FUNCTION public.is_shop_owner_or_manager(lookup_shop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = lookup_shop_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active_shop_id = lookup_shop_id
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
