-- MAIN PCSB: expense invoice flag only; financial CRUD policies remain owner-only.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.other_profit_loss_entries
  ADD COLUMN no_invoice boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT other_profit_loss_expense_invoice_only CHECK (kind = 'expense' OR no_invoice = false);
COMMENT ON COLUMN public.other_profit_loss_entries.no_invoice IS
  'Accountant flags a missing expense invoice; false is the default and clears the flag.';
CREATE FUNCTION public.set_other_expense_no_invoice(p_entry_id uuid, p_no_invoice boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_other_profit_loss() THEN
    RAISE EXCEPTION 'Other P&L access required' USING ERRCODE = '42501';
  END IF;
  IF p_no_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice flag is required' USING ERRCODE = '22004';
  END IF;
  UPDATE public.other_profit_loss_entries SET no_invoice = p_no_invoice
    WHERE id = p_entry_id AND kind = 'expense' RETURNING no_invoice INTO saved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.set_other_expense_no_invoice(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_other_expense_no_invoice(uuid, boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
