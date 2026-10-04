-- Place the approved 2024/2025 Sales Summary revenue rows in Unknown for their billing year.
-- Preserve source accounting rows and archive any matching manual P&L assignments before removal.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.profit_loss_revenue_year_overrides (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  billing_month date NOT NULL,
  unknown_year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, billing_month),
  CONSTRAINT profit_loss_revenue_year_override_month_start
    CHECK (billing_month = date_trunc('month', billing_month)::date),
  CONSTRAINT profit_loss_revenue_year_override_supported_year
    CHECK (unknown_year IN (2024, 2025)),
  CONSTRAINT profit_loss_revenue_year_override_matches_month
    CHECK (unknown_year = extract(year FROM billing_month)::integer)
);

CREATE TABLE public.profit_loss_revenue_assignment_archive (
  assignment_id uuid PRIMARY KEY,
  monthly_payment_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  billing_month date NOT NULL,
  reporting_month date NOT NULL,
  assigned_by uuid,
  assignment_created_at timestamptz NOT NULL,
  assignment_updated_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archive_reason text NOT NULL,
  CONSTRAINT profit_loss_revenue_archive_month_start
    CHECK (billing_month = date_trunc('month', billing_month)::date),
  CONSTRAINT profit_loss_revenue_archive_reason
    CHECK (archive_reason = '2024/2025 Sales Summary revenue-year reset')
);

ALTER TABLE public.profit_loss_revenue_year_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_loss_revenue_assignment_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profit_loss_revenue_year_overrides FROM anon, authenticated;
REVOKE ALL ON public.profit_loss_revenue_assignment_archive FROM anon, authenticated;
GRANT SELECT ON public.profit_loss_revenue_year_overrides TO authenticated;
GRANT SELECT ON public.profit_loss_revenue_assignment_archive TO authenticated;

CREATE POLICY "P&L permitted users view revenue year overrides"
  ON public.profit_loss_revenue_year_overrides FOR SELECT
  USING (public.can_access_profit_loss());
CREATE POLICY "P&L permitted users view revenue assignment archive"
  ON public.profit_loss_revenue_assignment_archive FOR SELECT
  USING (public.can_access_profit_loss());
-- Deliberately no write grants or policies: users cannot self-write migration controls or audit history.

WITH expected AS (
  SELECT b.id AS booking_id,
         (date_trunc('month', b.start_date) + (n.i * interval '1 month'))::date AS billing_month
  FROM public.bookings b
  CROSS JOIN LATERAL generate_series(
    0,
    GREATEST(COALESCE(NULLIF(round(b.total_amount / NULLIF(b.monthly_rate, 0)), 0), 1), 1)::integer - 1
  ) AS n(i)
  WHERE b.payment_status = 'settled'
    AND b.status <> 'cancelled'
    AND b.monthly_rate > 0
    AND b.total_amount > 0
    AND extract(year FROM date_trunc('month', b.start_date) + (n.i * interval '1 month'))::integer IN (2024, 2025)
)
INSERT INTO public.profit_loss_revenue_year_overrides (booking_id, billing_month, unknown_year)
SELECT booking_id, billing_month, extract(year FROM billing_month)::integer
FROM expected;

DO $$
DECLARE
  y2024_count integer;
  y2025_count integer;
  y2024_total numeric;
  y2025_total numeric;
BEGIN
  SELECT count(*), COALESCE(sum(b.monthly_rate), 0)
    INTO y2024_count, y2024_total
  FROM public.profit_loss_revenue_year_overrides o
  JOIN public.bookings b ON b.id = o.booking_id
  WHERE o.unknown_year = 2024;

  SELECT count(*), COALESCE(sum(b.monthly_rate), 0)
    INTO y2025_count, y2025_total
  FROM public.profit_loss_revenue_year_overrides o
  JOIN public.bookings b ON b.id = o.booking_id
  WHERE o.unknown_year = 2025;

  IF y2024_count <> 113 OR y2024_total <> 724448
     OR y2025_count <> 171 OR y2025_total <> 1145637 THEN
    RAISE EXCEPTION 'Historical P&L scope mismatch: 2024 % rows/% total; 2025 % rows/% total',
      y2024_count, y2024_total, y2025_count, y2025_total USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO public.profit_loss_revenue_assignment_archive (
  assignment_id, monthly_payment_id, booking_id, billing_month, reporting_month,
  assigned_by, assignment_created_at, assignment_updated_at, archive_reason
)
SELECT a.id, a.monthly_payment_id, mp.booking_id, (mp.month || '-01')::date, a.reporting_month,
       a.assigned_by, a.created_at, a.updated_at, '2024/2025 Sales Summary revenue-year reset'
FROM public.profit_loss_revenue_assignments a
JOIN public.monthly_payments mp ON mp.id = a.monthly_payment_id
JOIN public.profit_loss_revenue_year_overrides o
  ON o.booking_id = mp.booking_id AND o.billing_month = (mp.month || '-01')::date;

DELETE FROM public.profit_loss_revenue_assignments a
USING public.monthly_payments mp, public.profit_loss_revenue_year_overrides o
WHERE mp.id = a.monthly_payment_id
  AND o.booking_id = mp.booking_id
  AND o.billing_month = (mp.month || '-01')::date
  AND EXISTS (
    SELECT 1 FROM public.profit_loss_revenue_assignment_archive ar
    WHERE ar.assignment_id = a.id AND ar.monthly_payment_id = a.monthly_payment_id
  );

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
    SELECT mp.booking_id, max(COALESCE(mp.settled_at, mp.created_at)) AS settled_at
    FROM public.monthly_payments mp WHERE mp.status = 'completed' GROUP BY mp.booking_id
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
    FROM public.bookings b WHERE b.status <> 'cancelled' AND b.monthly_rate > 0 AND b.total_amount > 0
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
    FROM expected e JOIN materialized m ON m.booking_id = e.id AND m.billing_month = e.billing_month GROUP BY e.id
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
           CASE WHEN m.reporting_month IS NULL THEN COALESCE(o.unknown_year, extract(year FROM m.settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::integer)
                ELSE extract(year FROM m.reporting_month)::integer END AS unknown_year,
           'payment'::text AS source, (m.reporting_month IS NOT NULL) AS has_persisted_assignment,
           m.invoice_number, m.client_id, m.brand_name, m.billboard_id, m.amount
    FROM materialized m
    LEFT JOIN public.profit_loss_revenue_year_overrides o
      ON o.booking_id = m.booking_id AND to_char(o.billing_month, 'YYYY-MM') = m.billing_month
    UNION ALL
    SELECT 'unknown:' || m.booking_id::text || ':' || m.billing_month, m.payment_id, m.booking_id, m.billing_month,
           'unknown', COALESCE(o.unknown_year, extract(year FROM m.settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::integer),
           'settled_booking', false, m.invoice_number, m.client_id, m.brand_name, m.billboard_id, m.amount
    FROM missing m
    LEFT JOIN public.profit_loss_revenue_year_overrides o
      ON o.booking_id = m.booking_id AND to_char(o.billing_month, 'YYYY-MM') = m.billing_month
  )
  SELECT jsonb_build_object(
    'billboards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location) ORDER BY bb.name) FROM public.billboards bb), '[]'::jsonb),
    'locks', COALESCE((SELECT jsonb_agg(to_char(l.reporting_month, 'YYYY-MM') ORDER BY l.reporting_month) FROM public.profit_loss_month_locks l), '[]'::jsonb),
    'revenue', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'revenue_id', r.revenue_id, 'payment_id', r.payment_id, 'booking_id', r.booking_id,
      'billing_month', r.billing_month, 'reporting_month', r.reporting_month, 'unknown_year', r.unknown_year,
      'source', r.source, 'has_persisted_assignment', r.has_persisted_assignment, 'invoice_number', r.invoice_number,
      'client_id', c.id, 'client_name', c.company_name, 'brand_name', r.brand_name,
      'billboard_id', bb.id, 'billboard_name', bb.name, 'billboard_location', bb.location, 'amount', r.amount
    ) ORDER BY (r.reporting_month = 'unknown'), r.unknown_year, r.reporting_month, r.billing_month, r.booking_id)
    FROM revenue_rows r JOIN public.clients c ON c.id = r.client_id JOIN public.billboards bb ON bb.id = r.billboard_id), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', cat.id, 'name', cat.name, 'is_active', cat.is_active) ORDER BY cat.is_active DESC, cat.name) FROM public.profit_loss_cost_categories cat), '[]'::jsonb),
    'costs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', cost.id, 'cost_date', cost.cost_date,
      'reporting_months', (SELECT jsonb_agg(to_char(month_value, 'YYYY-MM') ORDER BY month_value) FROM unnest(cost.reporting_months) month_value),
      'category_id', cost.category_id, 'category_name', cat.name, 'description', cost.description,
      'supplier_payee', cost.supplier_payee, 'amount', cost.amount, 'remarks', cost.remarks,
      'allocations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', alloc.id, 'billboard_id', alloc.billboard_id, 'billboard_name', COALESCE(abb.name, 'General / Company Overhead'), 'amount', alloc.amount) ORDER BY abb.name NULLS FIRST) FROM public.profit_loss_cost_allocations alloc LEFT JOIN public.billboards abb ON abb.id = alloc.billboard_id WHERE alloc.cost_id = cost.id), '[]'::jsonb)
    ) ORDER BY cost.cost_date DESC, cost.created_at DESC)
    FROM public.profit_loss_costs cost JOIN public.profit_loss_cost_categories cat ON cat.id = cost.category_id), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profit_loss_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_loss_data() TO authenticated;

COMMENT ON TABLE public.profit_loss_revenue_year_overrides IS 'Immutable migration-owned Unknown-year placement for approved historical Sales Summary rows.';
COMMENT ON TABLE public.profit_loss_revenue_assignment_archive IS 'Durable backup of historical P&L assignments removed by the 2024/2025 revenue-year reset.';
COMMENT ON FUNCTION public.get_profit_loss_data() IS 'P&L read model: explicit assignments win; historical overrides otherwise win; all other Unknown rows use MYT settlement year.';
NOTIFY pgrst, 'reload schema';
COMMIT;
