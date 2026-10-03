-- Close completed P&L months. Reads remain available; owner writes require an explicit unlock.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.profit_loss_month_locks (
  reporting_month date PRIMARY KEY,
  locked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profit_loss_lock_month_start CHECK (reporting_month = date_trunc('month', reporting_month)::date)
);

ALTER TABLE public.profit_loss_month_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "P&L permitted users view month locks" ON public.profit_loss_month_locks
  FOR SELECT USING (public.can_access_profit_loss());

CREATE OR REPLACE FUNCTION public.is_profit_loss_month_locked(p_month date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profit_loss_month_locks month_lock
    WHERE month_lock.reporting_month = date_trunc('month', p_month)::date
  );
$$;

CREATE OR REPLACE FUNCTION public.lock_profit_loss_month(p_reporting_month date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can lock P&L months' USING ERRCODE = '42501'; END IF;
  IF p_reporting_month IS NULL OR p_reporting_month <> date_trunc('month', p_reporting_month)::date THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.profit_loss_month_locks (reporting_month, locked_by)
  VALUES (p_reporting_month, auth.uid()) ON CONFLICT (reporting_month) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_profit_loss_month(p_reporting_month date, p_unlock_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can unlock P&L months' USING ERRCODE = '42501'; END IF;
  IF p_reporting_month IS NULL OR p_reporting_month <> date_trunc('month', p_reporting_month)::date THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;
  IF extensions.digest(COALESCE(p_unlock_code, ''), 'sha256') <> decode('82b87b56b096bcf4be784d993717c10443d843ebc880e4dae7cd5d049240d451', 'hex') THEN
    RAISE EXCEPTION 'Incorrect unlock code' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.profit_loss_month_locks WHERE reporting_month = p_reporting_month;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_profit_loss_month_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_month date; new_month date; parent_month date;
BEGIN
  IF TG_TABLE_NAME = 'profit_loss_revenue_assignments' THEN
    IF TG_OP <> 'INSERT' THEN old_month := OLD.reporting_month; END IF;
    IF TG_OP <> 'DELETE' THEN new_month := NEW.reporting_month; END IF;
  ELSIF TG_TABLE_NAME = 'profit_loss_costs' THEN
    IF TG_OP <> 'INSERT' THEN old_month := date_trunc('month', OLD.cost_date)::date; END IF;
    IF TG_OP <> 'DELETE' THEN new_month := date_trunc('month', NEW.cost_date)::date; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT date_trunc('month', cost.cost_date)::date INTO old_month
      FROM public.profit_loss_costs cost WHERE cost.id = OLD.cost_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT date_trunc('month', cost.cost_date)::date INTO new_month
      FROM public.profit_loss_costs cost WHERE cost.id = NEW.cost_id;
    END IF;
  END IF;
  IF (old_month IS NOT NULL AND public.is_profit_loss_month_locked(old_month))
     OR (new_month IS NOT NULL AND public.is_profit_loss_month_locked(new_month)) THEN
    RAISE EXCEPTION 'P&L month is locked. Unlock it before making changes.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profit_loss_revenue_month_lock BEFORE INSERT OR UPDATE OR DELETE ON public.profit_loss_revenue_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_profit_loss_month_lock();
CREATE TRIGGER profit_loss_cost_month_lock BEFORE INSERT OR UPDATE OR DELETE ON public.profit_loss_costs
FOR EACH ROW EXECUTE FUNCTION public.enforce_profit_loss_month_lock();
CREATE TRIGGER profit_loss_allocation_month_lock BEFORE INSERT OR UPDATE OR DELETE ON public.profit_loss_cost_allocations
FOR EACH ROW EXECUTE FUNCTION public.enforce_profit_loss_month_lock();

CREATE OR REPLACE FUNCTION public.enforce_locked_paid_revenue_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  assigned_month date;
  changes_reported_revenue boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changes_reported_revenue := OLD.status = 'completed';
  ELSIF TG_OP = 'UPDATE' THEN
    changes_reported_revenue := OLD.status = 'completed' AND
      (NEW.status IS DISTINCT FROM 'completed'
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.month IS DISTINCT FROM OLD.month);
  END IF;
  IF changes_reported_revenue THEN
    SELECT assignment.reporting_month INTO assigned_month
    FROM public.profit_loss_revenue_assignments assignment
    WHERE assignment.monthly_payment_id = OLD.id;
    IF assigned_month IS NOT NULL AND public.is_profit_loss_month_locked(assigned_month) THEN
      RAISE EXCEPTION 'This payment is reported in a locked P&L month. Unlock that month before changing its status.' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER monthly_payments_locked_revenue_status
BEFORE UPDATE OF status, invoice_number, month OR DELETE ON public.monthly_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_locked_paid_revenue_status();

CREATE OR REPLACE FUNCTION public.enforce_locked_booking_revenue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE changes_reported_revenue boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changes_reported_revenue := true;
  ELSE
    changes_reported_revenue := (OLD.monthly_rate, OLD.status, OLD.client_id, OLD.billboard_id, OLD.brand_name)
      IS DISTINCT FROM (NEW.monthly_rate, NEW.status, NEW.client_id, NEW.billboard_id, NEW.brand_name);
  END IF;
  IF changes_reported_revenue AND EXISTS (
    SELECT 1
    FROM public.monthly_payments payment
    JOIN public.profit_loss_revenue_assignments assignment ON assignment.monthly_payment_id = payment.id
    JOIN public.profit_loss_month_locks month_lock ON month_lock.reporting_month = assignment.reporting_month
    WHERE payment.booking_id = OLD.id AND payment.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'This booking has revenue in a locked P&L month. Unlock every affected month before changing P&L-visible booking details.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_locked_revenue_details
BEFORE UPDATE OF monthly_rate, status, client_id, billboard_id, brand_name OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_locked_booking_revenue();

CREATE OR REPLACE FUNCTION public.enforce_locked_booking_revenue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  has_locked_revenue boolean;
  changes_visible_revenue boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.monthly_payments payment
    JOIN public.profit_loss_revenue_assignments assignment ON assignment.monthly_payment_id = payment.id
    JOIN public.profit_loss_month_locks month_lock ON month_lock.reporting_month = assignment.reporting_month
    WHERE payment.booking_id = OLD.id
      AND payment.status = 'completed'
  ) INTO has_locked_revenue;

  IF TG_OP = 'DELETE' THEN
    changes_visible_revenue := true;
  ELSIF TG_OP = 'UPDATE' THEN
    changes_visible_revenue := OLD.monthly_rate IS DISTINCT FROM NEW.monthly_rate
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.client_id IS DISTINCT FROM NEW.client_id
      OR OLD.billboard_id IS DISTINCT FROM NEW.billboard_id
      OR OLD.brand_name IS DISTINCT FROM NEW.brand_name;
  END IF;
  IF has_locked_revenue AND changes_visible_revenue THEN
    RAISE EXCEPTION 'This booking has revenue in a locked P&L month. Unlock that month before changing P&L-visible booking details or deleting the booking.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_locked_profit_loss_revenue
BEFORE UPDATE OF monthly_rate, status, client_id, billboard_id, brand_name OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_locked_booking_revenue();

-- Completing a payment is atomic with its initial P&L placement. A closed current
-- month therefore rejects the completion with a specific error instead of silently
-- omitting or moving revenue into another reporting period.
CREATE OR REPLACE FUNCTION public.assign_new_paid_revenue_month()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_reporting_month date := date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  should_assign boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_assign := NEW.status = 'completed';
  ELSIF TG_OP = 'UPDATE' THEN
    should_assign := NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed';
  END IF;
  IF should_assign THEN
    IF public.is_profit_loss_month_locked(current_reporting_month) THEN
      RAISE EXCEPTION 'Current P&L month is locked. Unlock it before completing the payment.' USING ERRCODE = '55000';
    END IF;
    INSERT INTO public.profit_loss_revenue_assignments (monthly_payment_id, reporting_month, assigned_by)
    VALUES (NEW.id, current_reporting_month, auth.uid())
    ON CONFLICT (monthly_payment_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_profit_loss_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_access_profit_loss() THEN RAISE EXCEPTION 'P&L access denied' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'billboards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location) ORDER BY bb.name) FROM public.billboards bb), '[]'::jsonb),
    'locks', COALESCE((SELECT jsonb_agg(to_char(month_lock.reporting_month, 'YYYY-MM') ORDER BY month_lock.reporting_month) FROM public.profit_loss_month_locks month_lock), '[]'::jsonb),
    'revenue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('payment_id', mp.id, 'booking_id', b.id, 'billing_month', mp.month, 'reporting_month', to_char(COALESCE(a.reporting_month, DATE '2026-10-01'), 'YYYY-MM'), 'has_persisted_assignment', (a.id IS NOT NULL), 'invoice_number', mp.invoice_number, 'client_id', c.id, 'client_name', c.company_name, 'brand_name', b.brand_name, 'billboard_id', bb.id, 'billboard_name', bb.name, 'billboard_location', bb.location, 'amount', b.monthly_rate) ORDER BY COALESCE(a.reporting_month, DATE '2026-10-01'), mp.invoice_number, mp.id)
      FROM public.monthly_payments mp JOIN public.bookings b ON b.id = mp.booking_id JOIN public.clients c ON c.id = b.client_id JOIN public.billboards bb ON bb.id = b.billboard_id LEFT JOIN public.profit_loss_revenue_assignments a ON a.monthly_payment_id = mp.id
      WHERE mp.status = 'completed' AND b.status <> 'cancelled'
    ), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', cat.id, 'name', cat.name, 'is_active', cat.is_active) ORDER BY cat.is_active DESC, cat.name) FROM public.profit_loss_cost_categories cat), '[]'::jsonb),
    'costs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cost.id, 'cost_date', cost.cost_date, 'category_id', cost.category_id, 'category_name', cat.name, 'description', cost.description, 'supplier_payee', cost.supplier_payee, 'amount', cost.amount, 'remarks', cost.remarks, 'allocations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', alloc.id, 'billboard_id', alloc.billboard_id, 'billboard_name', COALESCE(alloc_bb.name, 'General / Company Overhead'), 'amount', alloc.amount) ORDER BY alloc_bb.name NULLS FIRST) FROM public.profit_loss_cost_allocations alloc LEFT JOIN public.billboards alloc_bb ON alloc_bb.id = alloc.billboard_id WHERE alloc.cost_id = cost.id), '[]'::jsonb)) ORDER BY cost.cost_date DESC, cost.created_at DESC)
      FROM public.profit_loss_costs cost JOIN public.profit_loss_cost_categories cat ON cat.id = cost.category_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON TABLE public.profit_loss_month_locks FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_profit_loss_month_locked(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_profit_loss_month(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_profit_loss_month(date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_profit_loss_month_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_locked_paid_revenue_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_locked_booking_revenue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_locked_booking_revenue() FROM PUBLIC;
GRANT SELECT ON TABLE public.profit_loss_month_locks TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profit_loss_month_locked(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_profit_loss_month(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_profit_loss_month(date, text) TO authenticated;

COMMENT ON TABLE public.profit_loss_month_locks IS 'Closed P&L reporting months. Database triggers reject revenue and cost changes affecting a closed month.';
NOTIFY pgrst, 'reload schema';
COMMIT;
