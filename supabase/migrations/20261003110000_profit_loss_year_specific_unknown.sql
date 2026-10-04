-- Scope unassigned received revenue to the MYT year in which payment settled.
-- Explicit reporting-month assignments and all accounting source values remain unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.monthly_payments
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- Keep the prior no-auto-month behavior explicit even if migrations are replayed
-- against a database that stopped before the Unknown-revenue migration.
DROP TRIGGER IF EXISTS monthly_payments_assign_paid_revenue_month ON public.monthly_payments;
DROP FUNCTION IF EXISTS public.assign_new_paid_revenue_month();

CREATE OR REPLACE FUNCTION public.capture_monthly_payment_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.settled_at := COALESCE(NEW.settled_at, now());
  ELSIF NEW.status IS DISTINCT FROM 'completed' THEN
    NEW.settled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS monthly_payments_capture_settlement ON public.monthly_payments;
CREATE TRIGGER monthly_payments_capture_settlement
BEFORE INSERT OR UPDATE OF status ON public.monthly_payments
FOR EACH ROW EXECUTE FUNCTION public.capture_monthly_payment_settlement();

CREATE INDEX IF NOT EXISTS monthly_payments_settled_at_idx
  ON public.monthly_payments(settled_at) WHERE status = 'completed';

CREATE OR REPLACE FUNCTION public.get_profit_loss_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_access_profit_loss() THEN RAISE EXCEPTION 'P&L access denied' USING ERRCODE = '42501'; END IF;
  WITH expected AS (
    SELECT b.*, n.i AS expected_index,
           to_char(date_trunc('month', b.start_date) + (n.i * interval '1 month'), 'YYYY-MM') AS billing_month
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(
      0,
      GREATEST(COALESCE(NULLIF(round(b.total_amount / NULLIF(b.monthly_rate, 0)), 0), 1), 1)::integer - 1
    ) AS n(i)
    WHERE b.payment_status = 'settled' AND b.status <> 'cancelled' AND b.monthly_rate > 0 AND b.total_amount > 0
  ), booking_settlement AS (
    SELECT mp.booking_id,
           max(COALESCE(mp.settled_at, mp.created_at)) AS settled_at
    FROM public.monthly_payments mp
    WHERE mp.status = 'completed'
    GROUP BY mp.booking_id
  ), materialized_raw AS (
    SELECT DISTINCT ON (mp.booking_id, mp.month)
           mp.id AS payment_id, mp.booking_id, mp.month AS billing_month, a.reporting_month,
           COALESCE(mp.settled_at, mp.created_at) AS settled_at,
           a.updated_at AS assignment_updated_at, mp.created_at AS payment_created_at,
           mp.invoice_number, b.client_id, b.brand_name, b.billboard_id, b.monthly_rate AS amount
    FROM public.monthly_payments mp
    LEFT JOIN public.profit_loss_revenue_assignments a ON a.monthly_payment_id = mp.id
    JOIN public.bookings b ON b.id = mp.booking_id
    WHERE mp.status = 'completed' AND b.status <> 'cancelled'
    ORDER BY mp.booking_id, mp.month, (a.reporting_month IS NOT NULL) DESC, a.updated_at DESC NULLS LAST, mp.created_at DESC, mp.id
  ), booking_limits AS (
    SELECT b.id AS booking_id,
           GREATEST(COALESCE(NULLIF(round(b.total_amount / NULLIF(b.monthly_rate, 0)), 0), 1), 1)::integer AS expected_count
    FROM public.bookings b
    WHERE b.status <> 'cancelled' AND b.monthly_rate > 0 AND b.total_amount > 0
  ), materialized_ranked AS (
    SELECT mr.*,
           row_number() OVER (
             PARTITION BY mr.booking_id
             ORDER BY (mr.reporting_month IS NOT NULL) DESC,
                      EXISTS (SELECT 1 FROM expected e WHERE e.id = mr.booking_id AND e.billing_month = mr.billing_month) DESC,
                      mr.assignment_updated_at DESC NULLS LAST, mr.payment_created_at DESC, mr.payment_id
           ) AS revenue_rank
    FROM materialized_raw mr
  ), materialized AS (
    SELECT mr.* FROM materialized_ranked mr
    JOIN booking_limits bl ON bl.booking_id = mr.booking_id
    WHERE mr.revenue_rank <= bl.expected_count
  ), materialized_counts AS (
    SELECT booking_id, count(*) AS materialized_count FROM materialized GROUP BY booking_id
  ), exact_counts AS (
    SELECT e.id AS booking_id, count(*) AS exact_count
    FROM expected e JOIN materialized m ON m.booking_id = e.id AND m.billing_month = e.billing_month
    GROUP BY e.id
  ), missing_candidates AS (
    SELECT e.*, row_number() OVER (PARTITION BY e.id ORDER BY e.expected_index) AS unmatched_rank
    FROM expected e
    WHERE NOT EXISTS (SELECT 1 FROM materialized m WHERE m.booking_id = e.id AND m.billing_month = e.billing_month)
  ), missing AS (
    SELECT e.id AS booking_id, e.billing_month,
           (SELECT mp.id FROM public.monthly_payments mp WHERE mp.booking_id = e.id AND mp.month = e.billing_month ORDER BY (mp.status = 'completed') DESC, mp.id LIMIT 1) AS payment_id,
           (SELECT mp.invoice_number FROM public.monthly_payments mp WHERE mp.booking_id = e.id AND mp.month = e.billing_month ORDER BY (mp.status = 'completed') DESC, mp.id LIMIT 1) AS invoice_number,
           COALESCE(bs.settled_at, e.created_at) AS settled_at,
           e.client_id, e.brand_name, e.billboard_id, e.monthly_rate AS amount
    FROM missing_candidates e
    LEFT JOIN materialized_counts mc ON mc.booking_id = e.id
    LEFT JOIN exact_counts ec ON ec.booking_id = e.id
    LEFT JOIN booking_settlement bs ON bs.booking_id = e.id
    WHERE e.unmatched_rank > GREATEST(COALESCE(mc.materialized_count, 0) - COALESCE(ec.exact_count, 0), 0)
  ), revenue_rows AS (
    SELECT 'payment:' || m.payment_id::text AS revenue_id, m.payment_id, m.booking_id, m.billing_month,
           COALESCE(to_char(m.reporting_month, 'YYYY-MM'), 'unknown') AS reporting_month,
           extract(year FROM m.settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::integer AS unknown_year,
           'payment'::text AS source, (m.reporting_month IS NOT NULL) AS has_persisted_assignment,
           m.invoice_number, m.client_id, m.brand_name, m.billboard_id, m.amount
    FROM materialized m
    UNION ALL
    SELECT 'unknown:' || m.booking_id::text || ':' || m.billing_month, m.payment_id, m.booking_id, m.billing_month,
           'unknown', extract(year FROM m.settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::integer,
           'settled_booking', false, m.invoice_number, m.client_id, m.brand_name, m.billboard_id, m.amount
    FROM missing m
  )
  SELECT jsonb_build_object(
    'billboards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location) ORDER BY bb.name) FROM public.billboards bb), '[]'::jsonb),
    'locks', COALESCE((SELECT jsonb_agg(to_char(l.reporting_month, 'YYYY-MM') ORDER BY l.reporting_month) FROM public.profit_loss_month_locks l), '[]'::jsonb),
    'revenue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'revenue_id', r.revenue_id, 'payment_id', r.payment_id, 'booking_id', r.booking_id,
        'billing_month', r.billing_month, 'reporting_month', r.reporting_month, 'unknown_year', r.unknown_year,
        'source', r.source, 'has_persisted_assignment', r.has_persisted_assignment, 'invoice_number', r.invoice_number,
        'client_id', c.id, 'client_name', c.company_name, 'brand_name', r.brand_name,
        'billboard_id', bb.id, 'billboard_name', bb.name, 'billboard_location', bb.location, 'amount', r.amount
      ) ORDER BY (r.reporting_month = 'unknown'), r.unknown_year, r.reporting_month, r.billing_month, r.booking_id)
      FROM revenue_rows r JOIN public.clients c ON c.id = r.client_id JOIN public.billboards bb ON bb.id = r.billboard_id
    ), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', cat.id, 'name', cat.name, 'is_active', cat.is_active) ORDER BY cat.is_active DESC, cat.name) FROM public.profit_loss_cost_categories cat), '[]'::jsonb),
    'costs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cost.id, 'cost_date', cost.cost_date,
        'reporting_months', (SELECT jsonb_agg(to_char(month_value, 'YYYY-MM') ORDER BY month_value) FROM unnest(cost.reporting_months) month_value),
        'category_id', cost.category_id, 'category_name', cat.name, 'description', cost.description,
        'supplier_payee', cost.supplier_payee, 'amount', cost.amount, 'remarks', cost.remarks,
        'allocations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', alloc.id, 'billboard_id', alloc.billboard_id, 'billboard_name', COALESCE(abb.name, 'General / Company Overhead'), 'amount', alloc.amount) ORDER BY abb.name NULLS FIRST) FROM public.profit_loss_cost_allocations alloc LEFT JOIN public.billboards abb ON abb.id = alloc.billboard_id WHERE alloc.cost_id = cost.id), '[]'::jsonb)
      ) ORDER BY cost.cost_date DESC, cost.created_at DESC)
      FROM public.profit_loss_costs cost JOIN public.profit_loss_cost_categories cat ON cat.id = cost.category_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_monthly_payment_settlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profit_loss_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_loss_data() TO authenticated;

COMMENT ON COLUMN public.monthly_payments.settled_at IS 'Status transition timestamp used to scope unassigned P&L revenue to its MYT settlement year.';
COMMENT ON FUNCTION public.get_profit_loss_data() IS 'P&L read model with year-specific Unknown revenue based on MYT settlement year.';
NOTIFY pgrst, 'reload schema';
COMMIT;
