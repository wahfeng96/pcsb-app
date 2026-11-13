-- Keep explicit P&L month placement and its original billing-month workflow atomic.
-- No backfill: existing data is unchanged until an assignment is edited.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sync_profit_loss_profit_sharing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  payment_ids uuid[];
  payment_id uuid;
  payment_row record;
  next_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    payment_ids := ARRAY[NEW.monthly_payment_id];
  ELSIF TG_OP = 'DELETE' THEN
    payment_ids := ARRAY[OLD.monthly_payment_id];
  ELSE
    payment_ids := ARRAY[OLD.monthly_payment_id, NEW.monthly_payment_id];
  END IF;

  FOR payment_id IN SELECT DISTINCT value FROM unnest(payment_ids) AS ids(value) ORDER BY value LOOP
    SELECT mp.booking_id, mp.month, b.monthly_rate, b.billboard_id, b.sales_person
    INTO payment_row
    FROM public.monthly_payments mp JOIN public.bookings b ON b.id = mp.booking_id
    WHERE mp.id = payment_id;
    -- Cascading deletion of a payment/booking must not recreate its dependent rows.
    IF NOT FOUND THEN CONTINUE; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'pnl-profit-share:' || payment_row.booking_id::text || ':' || payment_row.month, 0));

    -- Another assigned legacy payment for the same booking/month still means Settled.
    IF EXISTS (
      SELECT 1 FROM public.profit_loss_revenue_assignments a
      JOIN public.monthly_payments mp ON mp.id = a.monthly_payment_id
      WHERE mp.booking_id = payment_row.booking_id AND mp.month = payment_row.month
    ) THEN next_status := 'settled';
    ELSE next_status := 'waiting_profit_share'; END IF;

    UPDATE public.profit_sharing SET status = next_status
    WHERE booking_id = payment_row.booking_id AND month = payment_row.month;
    IF NOT FOUND THEN
      INSERT INTO public.profit_sharing (booking_id, month, amount, billboard_id, sales_person, status)
      VALUES (payment_row.booking_id, payment_row.month, payment_row.monthly_rate,
              payment_row.billboard_id, NULLIF(btrim(payment_row.sales_person), ''), next_status);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profit_loss_profit_sharing() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profit_loss_assignment_sync_profit_sharing
AFTER INSERT OR UPDATE OR DELETE ON public.profit_loss_revenue_assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_profit_loss_profit_sharing();
COMMENT ON FUNCTION public.sync_profit_loss_profit_sharing() IS
  'Assignment-only workflow sync: assigned revenue is Settled; returning to Unknown is Waiting Profit Share, keyed by original booking/billing month. Does not modify Accounting or Commission.';
COMMIT;
