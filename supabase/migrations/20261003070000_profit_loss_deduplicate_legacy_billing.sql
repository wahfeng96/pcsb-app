-- Prevent legacy payment-month differences from creating a second synthetic
-- Unknown row for the same settled sale. This migration changes read/move logic only.
BEGIN;
SET LOCAL lock_timeout = '5s';

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
  ), materialized AS (
    SELECT DISTINCT ON (mp.booking_id, mp.month)
           mp.id AS payment_id, mp.booking_id, mp.month AS billing_month, a.reporting_month,
           mp.invoice_number, b.client_id, b.brand_name, b.billboard_id, b.monthly_rate AS amount
    FROM public.monthly_payments mp
    LEFT JOIN public.profit_loss_revenue_assignments a ON a.monthly_payment_id = mp.id
    JOIN public.bookings b ON b.id = mp.booking_id
    WHERE mp.status = 'completed' AND b.status <> 'cancelled'
    ORDER BY mp.booking_id, mp.month, (a.reporting_month IS NOT NULL) DESC, a.updated_at DESC NULLS LAST, mp.id
  ), materialized_counts AS (
    SELECT booking_id, count(*) AS materialized_count
    FROM materialized GROUP BY booking_id
  ), exact_counts AS (
    SELECT e.id AS booking_id, count(*) AS exact_count
    FROM expected e
    JOIN materialized m ON m.booking_id = e.id AND m.billing_month = e.billing_month
    GROUP BY e.id
  ), missing_candidates AS (
    SELECT e.*,
           row_number() OVER (PARTITION BY e.id ORDER BY e.expected_index) AS unmatched_rank
    FROM expected e
    WHERE NOT EXISTS (
      SELECT 1 FROM materialized m WHERE m.booking_id = e.id AND m.billing_month = e.billing_month
    )
  ), missing AS (
    SELECT e.id AS booking_id, e.billing_month,
           (SELECT mp.id FROM public.monthly_payments mp
            WHERE mp.booking_id = e.id AND mp.month = e.billing_month
            ORDER BY (mp.status = 'completed') DESC, mp.id LIMIT 1) AS payment_id,
           (SELECT mp.invoice_number FROM public.monthly_payments mp
            WHERE mp.booking_id = e.id AND mp.month = e.billing_month
            ORDER BY (mp.status = 'completed') DESC, mp.id LIMIT 1) AS invoice_number,
           e.client_id, e.brand_name, e.billboard_id, e.monthly_rate AS amount
    FROM missing_candidates e
    LEFT JOIN materialized_counts mc ON mc.booking_id = e.id
    LEFT JOIN exact_counts ec ON ec.booking_id = e.id
    WHERE e.unmatched_rank > GREATEST(COALESCE(mc.materialized_count, 0) - COALESCE(ec.exact_count, 0), 0)
  ), revenue_rows AS (
    SELECT 'payment:' || m.payment_id::text AS revenue_id, m.payment_id, m.booking_id, m.billing_month,
           COALESCE(to_char(m.reporting_month, 'YYYY-MM'), 'unknown') AS reporting_month, 'payment'::text AS source,
           (m.reporting_month IS NOT NULL) AS has_persisted_assignment, m.invoice_number, m.client_id, m.brand_name, m.billboard_id, m.amount
    FROM materialized m
    UNION ALL
    SELECT 'unknown:' || m.booking_id::text || ':' || m.billing_month, m.payment_id, m.booking_id, m.billing_month,
           'unknown', 'settled_booking', false, m.invoice_number, m.client_id, m.brand_name, m.billboard_id, m.amount
    FROM missing m
  )
  SELECT jsonb_build_object(
    'billboards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location) ORDER BY bb.name) FROM public.billboards bb), '[]'::jsonb),
    'locks', COALESCE((SELECT jsonb_agg(to_char(l.reporting_month, 'YYYY-MM') ORDER BY l.reporting_month) FROM public.profit_loss_month_locks l), '[]'::jsonb),
    'revenue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'revenue_id', r.revenue_id, 'payment_id', r.payment_id, 'booking_id', r.booking_id,
        'billing_month', r.billing_month, 'reporting_month', r.reporting_month, 'source', r.source,
        'has_persisted_assignment', r.has_persisted_assignment, 'invoice_number', r.invoice_number,
        'client_id', c.id, 'client_name', c.company_name, 'brand_name', r.brand_name,
        'billboard_id', bb.id, 'billboard_name', bb.name, 'billboard_location', bb.location, 'amount', r.amount
      ) ORDER BY (r.reporting_month = 'unknown'), r.reporting_month, r.billing_month, r.booking_id)
      FROM revenue_rows r JOIN public.clients c ON c.id = r.client_id JOIN public.billboards bb ON bb.id = r.billboard_id
    ), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', cat.id, 'name', cat.name, 'is_active', cat.is_active) ORDER BY cat.is_active DESC, cat.name) FROM public.profit_loss_cost_categories cat), '[]'::jsonb),
    'costs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cost.id, 'cost_date', cost.cost_date, 'category_id', cost.category_id, 'category_name', cat.name, 'description', cost.description, 'supplier_payee', cost.supplier_payee, 'amount', cost.amount, 'remarks', cost.remarks,
        'allocations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', alloc.id, 'billboard_id', alloc.billboard_id, 'billboard_name', COALESCE(abb.name, 'General / Company Overhead'), 'amount', alloc.amount) ORDER BY abb.name NULLS FIRST) FROM public.profit_loss_cost_allocations alloc LEFT JOIN public.billboards abb ON abb.id = alloc.billboard_id WHERE alloc.cost_id = cost.id), '[]'::jsonb)) ORDER BY cost.cost_date DESC, cost.created_at DESC)
      FROM public.profit_loss_costs cost JOIN public.profit_loss_cost_categories cat ON cat.id = cost.category_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_profit_loss_revenue(
  p_booking_id uuid, p_billing_month text, p_reporting_month date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE selected_payment public.monthly_payments%ROWTYPE; expected_month_count integer; materialized_payment_count integer; expected_start date;
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can assign received revenue' USING ERRCODE = '42501'; END IF;
  IF p_reporting_month IS NULL OR p_reporting_month <> date_trunc('month', p_reporting_month)::date THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;
  IF public.is_profit_loss_month_locked(p_reporting_month) THEN
    RAISE EXCEPTION 'P&L month is locked. Unlock it before assigning revenue.' USING ERRCODE = '55000';
  END IF;

  -- Serialize every materialization/reassignment for this booking month. This
  -- prevents concurrent owner requests from both observing no payment and
  -- inserting duplicates without imposing a new uniqueness rule on legacy rows.
  PERFORM pg_advisory_xact_lock(hashtext(p_booking_id::text || ':' || p_billing_month));

  SELECT * INTO selected_payment
  FROM public.monthly_payments mp
  WHERE mp.booking_id = p_booking_id AND mp.month = p_billing_month AND mp.status = 'completed'
  ORDER BY mp.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    INSERT INTO public.profit_loss_revenue_assignments (monthly_payment_id, reporting_month, assigned_by)
    VALUES (selected_payment.id, p_reporting_month, auth.uid())
    ON CONFLICT (monthly_payment_id) DO UPDATE
      SET reporting_month = EXCLUDED.reporting_month, assigned_by = EXCLUDED.assigned_by;
    RETURN selected_payment.id;
  END IF;

  SELECT GREATEST(COALESCE(NULLIF(round(b.total_amount / NULLIF(b.monthly_rate, 0)), 0), 1), 1)::integer,
         date_trunc('month', b.start_date)::date
  INTO expected_month_count, expected_start
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.payment_status = 'settled' AND b.status <> 'cancelled'
    AND b.monthly_rate > 0 AND b.total_amount > 0
  FOR UPDATE;
  IF NOT FOUND OR p_billing_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
     OR to_date(p_billing_month || '-01', 'YYYY-MM-DD') < expected_start
     OR to_date(p_billing_month || '-01', 'YYYY-MM-DD') >= expected_start + expected_month_count * interval '1 month' THEN
    RAISE EXCEPTION 'Revenue is not an unassigned month of this settled booking' USING ERRCODE = '22023';
  END IF;
  SELECT count(DISTINCT mp.month) INTO materialized_payment_count
  FROM public.monthly_payments mp
  WHERE mp.booking_id = p_booking_id AND mp.status = 'completed';
  IF materialized_payment_count >= expected_month_count THEN
    RAISE EXCEPTION 'All revenue months for this booking are already assigned' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO selected_payment FROM public.monthly_payments mp
  WHERE mp.booking_id = p_booking_id AND mp.month = p_billing_month
  ORDER BY (mp.status = 'completed') DESC, mp.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.monthly_payments SET status = 'completed' WHERE id = selected_payment.id RETURNING * INTO selected_payment;
  ELSE
    INSERT INTO public.monthly_payments (booking_id, month, amount, status)
    SELECT b.id, p_billing_month, b.monthly_rate, 'completed' FROM public.bookings b WHERE b.id = p_booking_id
    RETURNING * INTO selected_payment;
  END IF;
  INSERT INTO public.profit_loss_revenue_assignments (monthly_payment_id, reporting_month, assigned_by)
  VALUES (selected_payment.id, p_reporting_month, auth.uid());
  RETURN selected_payment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_profit_loss_revenue(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_profit_loss_revenue(uuid, text, date) TO authenticated;
COMMENT ON FUNCTION public.assign_profit_loss_revenue(uuid, text, date) IS 'Atomically materializes only an expected missing month from a settled booking and assigns it to an unlocked P&L month.';
NOTIFY pgrst, 'reload schema';
COMMIT;
