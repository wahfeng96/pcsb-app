-- Allow owners to return assigned paid revenue to Unknown without changing payment status.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.unassign_profit_loss_revenue(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  selected_payment public.monthly_payments%ROWTYPE;
BEGIN
  IF NOT public.is_profit_loss_owner() THEN
    RAISE EXCEPTION 'Only the owner can move received revenue to Unknown' USING ERRCODE = '42501';
  END IF;
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_payment_id::text, 0));
  SELECT * INTO selected_payment
  FROM public.monthly_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR selected_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed paid revenue can be moved to Unknown' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.profit_loss_revenue_assignments
  WHERE monthly_payment_id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revenue is already Unknown' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unassign_profit_loss_revenue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unassign_profit_loss_revenue(uuid) TO authenticated;
COMMENT ON FUNCTION public.unassign_profit_loss_revenue(uuid) IS 'Owner-only move of completed paid revenue back to Unknown; existing month locks remain enforced by assignment triggers.';

NOTIFY pgrst, 'reload schema';
COMMIT;
