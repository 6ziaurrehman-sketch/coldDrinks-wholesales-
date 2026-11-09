-- Migration: Update customer_payments check constraint to allow payment types

ALTER TABLE public.customer_payments
DROP CONSTRAINT IF EXISTS customer_payments_payment_method_check;

ALTER TABLE public.customer_payments
ADD CONSTRAINT customer_payments_payment_method_check
CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'credit', 'partial', 'other'));
