-- Keep booking-owned commercial fields authoritative across all dependent ledgers.
-- Workflow fields (invoice number, month and settlement status) remain independent.

CREATE OR REPLACE FUNCTION public.sync_booking_dependent_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.monthly_payments
  SET amount = NEW.monthly_rate
  WHERE booking_id = NEW.id
    AND amount IS DISTINCT FROM NEW.monthly_rate;

  UPDATE public.profit_sharing
  SET amount = NEW.monthly_rate,
      billboard_id = NEW.billboard_id,
      sales_person = NULLIF(btrim(NEW.sales_person), '')
  WHERE booking_id = NEW.id
    AND (amount, billboard_id, sales_person) IS DISTINCT FROM
        (NEW.monthly_rate, NEW.billboard_id, NULLIF(btrim(NEW.sales_person), ''));

  UPDATE public.commissions
  SET amount = NEW.monthly_rate * NEW.commission_percent / 100
  WHERE booking_id = NEW.id
    AND amount IS DISTINCT FROM NEW.monthly_rate * NEW.commission_percent / 100;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_sync_dependent_values ON public.bookings;
CREATE TRIGGER bookings_sync_dependent_values
AFTER INSERT OR UPDATE OF monthly_rate, commission_percent, billboard_id, sales_person
ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_booking_dependent_values();

CREATE OR REPLACE FUNCTION public.enforce_booking_dependent_values()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE booking_row public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO booking_row
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % does not exist', NEW.booking_id USING ERRCODE = '23503';
  END IF;

  IF TG_TABLE_NAME = 'monthly_payments' THEN
    NEW.amount := booking_row.monthly_rate;
  ELSIF TG_TABLE_NAME = 'profit_sharing' THEN
    NEW.amount := booking_row.monthly_rate;
    NEW.billboard_id := booking_row.billboard_id;
    NEW.sales_person := NULLIF(btrim(booking_row.sales_person), '');
  ELSIF TG_TABLE_NAME = 'commissions' THEN
    NEW.amount := booking_row.monthly_rate * booking_row.commission_percent / 100;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monthly_payments_enforce_booking_values ON public.monthly_payments;
CREATE TRIGGER monthly_payments_enforce_booking_values
BEFORE INSERT OR UPDATE ON public.monthly_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_dependent_values();

DROP TRIGGER IF EXISTS profit_sharing_enforce_booking_values ON public.profit_sharing;
CREATE TRIGGER profit_sharing_enforce_booking_values
BEFORE INSERT OR UPDATE ON public.profit_sharing
FOR EACH ROW
WHEN (NEW.booking_id IS NOT NULL)
EXECUTE FUNCTION public.enforce_booking_dependent_values();

DROP TRIGGER IF EXISTS commissions_enforce_booking_values ON public.commissions;
CREATE TRIGGER commissions_enforce_booking_values
BEFORE INSERT OR UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_dependent_values();

-- Repair existing derived values, including @1379-shaped completed payments,
-- without changing invoice numbers, months or any workflow status.
UPDATE public.monthly_payments payment
SET amount = booking.monthly_rate
FROM public.bookings booking
WHERE booking.id = payment.booking_id
  AND payment.amount IS DISTINCT FROM booking.monthly_rate;

UPDATE public.profit_sharing share
SET amount = booking.monthly_rate,
    billboard_id = booking.billboard_id,
    sales_person = NULLIF(btrim(booking.sales_person), '')
FROM public.bookings booking
WHERE booking.id = share.booking_id
  AND (share.amount, share.billboard_id, share.sales_person) IS DISTINCT FROM
      (booking.monthly_rate, booking.billboard_id, NULLIF(btrim(booking.sales_person), ''));

UPDATE public.commissions commission
SET amount = booking.monthly_rate * booking.commission_percent / 100
FROM public.bookings booking
WHERE booking.id = commission.booking_id
  AND commission.amount IS DISTINCT FROM booking.monthly_rate * booking.commission_percent / 100;

CREATE OR REPLACE FUNCTION public.get_profit_loss_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_access_profit_loss() THEN RAISE EXCEPTION 'P&L access denied' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'billboards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location) ORDER BY bb.name)
      FROM public.billboards bb
    ), '[]'::jsonb),
    'revenue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'payment_id', mp.id,
        'booking_id', b.id,
        'billing_month', mp.month,
        'reporting_month', to_char(COALESCE(a.reporting_month, DATE '2026-10-01'), 'YYYY-MM'),
        'has_persisted_assignment', (a.id IS NOT NULL),
        'invoice_number', mp.invoice_number,
        'client_id', c.id,
        'client_name', c.company_name,
        'brand_name', b.brand_name,
        'billboard_id', bb.id,
        'billboard_name', bb.name,
        'billboard_location', bb.location,
        'amount', b.monthly_rate
      ) ORDER BY COALESCE(a.reporting_month, DATE '2026-10-01'), mp.invoice_number, mp.id)
      FROM public.monthly_payments mp
      JOIN public.bookings b ON b.id = mp.booking_id
      JOIN public.clients c ON c.id = b.client_id
      JOIN public.billboards bb ON bb.id = b.billboard_id
      LEFT JOIN public.profit_loss_revenue_assignments a ON a.monthly_payment_id = mp.id
      WHERE mp.status = 'completed' AND b.status <> 'cancelled'
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cat.id, 'name', cat.name, 'is_active', cat.is_active) ORDER BY cat.is_active DESC, cat.name)
      FROM public.profit_loss_cost_categories cat
    ), '[]'::jsonb),
    'costs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cost.id,
        'cost_date', cost.cost_date,
        'category_id', cost.category_id,
        'category_name', cat.name,
        'description', cost.description,
        'supplier_payee', cost.supplier_payee,
        'amount', cost.amount,
        'remarks', cost.remarks,
        'allocations', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', alloc.id,
            'billboard_id', alloc.billboard_id,
            'billboard_name', COALESCE(alloc_bb.name, 'General / Company Overhead'),
            'amount', alloc.amount
          ) ORDER BY alloc_bb.name NULLS FIRST)
          FROM public.profit_loss_cost_allocations alloc
          LEFT JOIN public.billboards alloc_bb ON alloc_bb.id = alloc.billboard_id
          WHERE alloc.cost_id = cost.id
        ), '[]'::jsonb)
      ) ORDER BY cost.cost_date DESC, cost.created_at DESC)
      FROM public.profit_loss_costs cost
      JOIN public.profit_loss_cost_categories cat ON cat.id = cost.category_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_booking_dependent_values() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_booking_dependent_values() FROM PUBLIC;
