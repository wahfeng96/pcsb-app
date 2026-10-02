-- MAIN PCSB only. Additive P&L reporting tables, protected read API, and owner-only writes.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.can_access_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.role = 'owner' OR (p.approved = true AND '/profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[]))))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_profit_loss_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'owner');
$$;

REVOKE ALL ON FUNCTION public.can_access_profit_loss() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_profit_loss_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_profit_loss() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profit_loss_owner() TO authenticated;

CREATE TABLE public.profit_loss_revenue_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_payment_id uuid NOT NULL UNIQUE REFERENCES public.monthly_payments(id) ON DELETE CASCADE,
  reporting_month date NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profit_loss_revenue_month_start CHECK (reporting_month = date_trunc('month', reporting_month)::date)
);
CREATE INDEX profit_loss_revenue_reporting_month_idx ON public.profit_loss_revenue_assignments(reporting_month);

CREATE TABLE public.profit_loss_cost_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profit_loss_cost_category_name_nonblank CHECK (btrim(name) <> ''),
  CONSTRAINT profit_loss_cost_category_name_no_controls CHECK (name !~ '[[:cntrl:]]')
);
CREATE UNIQUE INDEX profit_loss_cost_categories_name_unique ON public.profit_loss_cost_categories(lower(btrim(name)));

CREATE TABLE public.profit_loss_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_date date NOT NULL,
  category_id uuid NOT NULL REFERENCES public.profit_loss_cost_categories(id) ON DELETE RESTRICT,
  description varchar(300) NOT NULL,
  supplier_payee varchar(200) NOT NULL,
  amount numeric(14,2) NOT NULL,
  remarks text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profit_loss_cost_amount_positive CHECK (amount > 0),
  CONSTRAINT profit_loss_cost_description_nonblank CHECK (btrim(description) <> ''),
  CONSTRAINT profit_loss_cost_supplier_nonblank CHECK (btrim(supplier_payee) <> ''),
  CONSTRAINT profit_loss_cost_description_no_controls CHECK (description !~ '[[:cntrl:]]'),
  CONSTRAINT profit_loss_cost_supplier_no_controls CHECK (supplier_payee !~ '[[:cntrl:]]')
);
CREATE INDEX profit_loss_costs_date_idx ON public.profit_loss_costs(cost_date);
CREATE INDEX profit_loss_costs_category_idx ON public.profit_loss_costs(category_id);

CREATE TABLE public.profit_loss_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_id uuid NOT NULL REFERENCES public.profit_loss_costs(id) ON DELETE CASCADE,
  billboard_id uuid REFERENCES public.billboards(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profit_loss_allocation_amount_positive CHECK (amount > 0)
);
CREATE UNIQUE INDEX profit_loss_cost_allocations_billboard_unique ON public.profit_loss_cost_allocations(cost_id, billboard_id) WHERE billboard_id IS NOT NULL;
CREATE UNIQUE INDEX profit_loss_cost_allocations_general_unique ON public.profit_loss_cost_allocations(cost_id) WHERE billboard_id IS NULL;
CREATE INDEX profit_loss_cost_allocations_billboard_idx ON public.profit_loss_cost_allocations(billboard_id);

CREATE OR REPLACE FUNCTION public.validate_profit_loss_cost_allocation_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  target_cost_id uuid;
  cost_total numeric;
  allocated_total numeric;
BEGIN
  IF TG_TABLE_NAME = 'profit_loss_costs' THEN
    target_cost_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_cost_id := OLD.cost_id;
  ELSE
    target_cost_id := NEW.cost_id;
  END IF;
  SELECT cost.amount INTO cost_total
  FROM public.profit_loss_costs cost
  WHERE cost.id = target_cost_id;

  -- Cascading allocation deletes run after their parent cost no longer exists.
  IF cost_total IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(allocation.amount), 0) INTO allocated_total
  FROM public.profit_loss_cost_allocations allocation
  WHERE allocation.cost_id = target_cost_id;

  IF allocated_total <> cost_total THEN
    RAISE EXCEPTION 'Cost allocations must sum exactly to the cost total' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER profit_loss_cost_total_matches_allocations
  AFTER INSERT OR UPDATE ON public.profit_loss_costs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_profit_loss_cost_allocation_total();
CREATE CONSTRAINT TRIGGER profit_loss_allocation_total_matches_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.profit_loss_cost_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_profit_loss_cost_allocation_total();

ALTER TABLE public.profit_loss_revenue_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_loss_cost_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_loss_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_loss_cost_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "P&L permitted users view revenue assignments" ON public.profit_loss_revenue_assignments FOR SELECT USING (public.can_access_profit_loss());
CREATE POLICY "P&L owner manages revenue assignments" ON public.profit_loss_revenue_assignments FOR ALL USING (public.is_profit_loss_owner()) WITH CHECK (public.is_profit_loss_owner());
CREATE POLICY "P&L permitted users view cost categories" ON public.profit_loss_cost_categories FOR SELECT USING (public.can_access_profit_loss());
CREATE POLICY "P&L owner manages cost categories" ON public.profit_loss_cost_categories FOR ALL USING (public.is_profit_loss_owner()) WITH CHECK (public.is_profit_loss_owner());
CREATE POLICY "P&L permitted users view costs" ON public.profit_loss_costs FOR SELECT USING (public.can_access_profit_loss());
CREATE POLICY "P&L owner manages costs" ON public.profit_loss_costs FOR ALL USING (public.is_profit_loss_owner()) WITH CHECK (public.is_profit_loss_owner());
CREATE POLICY "P&L permitted users view cost allocations" ON public.profit_loss_cost_allocations FOR SELECT USING (public.can_access_profit_loss());
CREATE POLICY "P&L owner manages cost allocations" ON public.profit_loss_cost_allocations FOR ALL USING (public.is_profit_loss_owner()) WITH CHECK (public.is_profit_loss_owner());

CREATE OR REPLACE FUNCTION public.profit_loss_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER profit_loss_revenue_assignments_updated_at BEFORE UPDATE ON public.profit_loss_revenue_assignments FOR EACH ROW EXECUTE FUNCTION public.profit_loss_touch_updated_at();
CREATE TRIGGER profit_loss_cost_categories_updated_at BEFORE UPDATE ON public.profit_loss_cost_categories FOR EACH ROW EXECUTE FUNCTION public.profit_loss_touch_updated_at();
CREATE TRIGGER profit_loss_costs_updated_at BEFORE UPDATE ON public.profit_loss_costs FOR EACH ROW EXECUTE FUNCTION public.profit_loss_touch_updated_at();

CREATE OR REPLACE FUNCTION public.assign_new_paid_revenue_month()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.profit_loss_revenue_assignments (monthly_payment_id, reporting_month, assigned_by)
      VALUES (NEW.id, date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, auth.uid())
      ON CONFLICT (monthly_payment_id) DO NOTHING;
    ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
      INSERT INTO public.profit_loss_revenue_assignments (monthly_payment_id, reporting_month, assigned_by)
      VALUES (NEW.id, date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, auth.uid())
      ON CONFLICT (monthly_payment_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER monthly_payments_assign_paid_revenue_month AFTER INSERT OR UPDATE OF status ON public.monthly_payments FOR EACH ROW EXECUTE FUNCTION public.assign_new_paid_revenue_month();

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
        'amount', mp.amount
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

CREATE OR REPLACE FUNCTION public.set_profit_loss_revenue_month(p_payment_id uuid, p_reporting_month date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can reassign paid revenue' USING ERRCODE = '42501'; END IF;
  IF p_reporting_month IS NULL OR p_reporting_month <> date_trunc('month', p_reporting_month)::date THEN
    RAISE EXCEPTION 'Reporting month must be the first day of a month' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.monthly_payments mp WHERE mp.id = p_payment_id AND mp.status = 'completed') THEN
    RAISE EXCEPTION 'Completed payment not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.profit_loss_revenue_assignments (monthly_payment_id, reporting_month, assigned_by)
  VALUES (p_payment_id, p_reporting_month, auth.uid())
  ON CONFLICT (monthly_payment_id) DO UPDATE SET reporting_month = EXCLUDED.reporting_month, assigned_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.save_profit_loss_category(p_category_id uuid, p_name text, p_is_active boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved_id uuid;
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can manage cost categories' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR btrim(p_name) = '' OR length(btrim(p_name)) > 100 OR btrim(p_name) ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Category name is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_category_id IS NULL THEN
    INSERT INTO public.profit_loss_cost_categories (name, is_active, created_by)
    VALUES (btrim(p_name), COALESCE(p_is_active, true), auth.uid()) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.profit_loss_cost_categories SET name = btrim(p_name), is_active = COALESCE(p_is_active, true)
    WHERE id = p_category_id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Cost category not found' USING ERRCODE = '22023'; END IF;
  END IF;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_profit_loss_cost(
  p_cost_id uuid, p_cost_date date, p_category_id uuid, p_description text,
  p_supplier_payee text, p_amount numeric, p_remarks text, p_allocations jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  saved_id uuid;
  allocation_total numeric;
  allocation_count integer;
  distinct_count integer;
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can manage costs' USING ERRCODE = '42501'; END IF;
  IF p_cost_date IS NULL OR p_category_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Date, category and positive amount are required' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' OR length(btrim(p_description)) > 300 OR btrim(p_description) ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Description is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_supplier_payee IS NULL OR btrim(p_supplier_payee) = '' OR length(btrim(p_supplier_payee)) > 200 OR btrim(p_supplier_payee) ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Supplier/payee is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profit_loss_cost_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Cost category not found' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Allocations must be an array' USING ERRCODE = '22023';
  END IF;
  SELECT COUNT(*), COALESCE(SUM((item->>'amount')::numeric), 0), COUNT(DISTINCT COALESCE(NULLIF(item->>'billboard_id', ''), '__general__'))
  INTO allocation_count, allocation_total, distinct_count FROM jsonb_array_elements(p_allocations) item;
  IF allocation_count < 1 OR allocation_count <> distinct_count OR allocation_total <> p_amount THEN
    RAISE EXCEPTION 'Allocations must be unique and sum exactly to the total cost' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) item
    WHERE (item->>'amount')::numeric <= 0
       OR (NULLIF(item->>'billboard_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.billboards bb WHERE bb.id = (item->>'billboard_id')::uuid
       ))
  ) THEN RAISE EXCEPTION 'Every allocation must have a positive amount and valid billboard' USING ERRCODE = '22023'; END IF;
  IF p_cost_id IS NULL THEN
    INSERT INTO public.profit_loss_costs (cost_date, category_id, description, supplier_payee, amount, remarks, created_by)
    VALUES (p_cost_date, p_category_id, btrim(p_description), btrim(p_supplier_payee), p_amount, NULLIF(btrim(COALESCE(p_remarks, '')), ''), auth.uid())
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.profit_loss_costs SET cost_date = p_cost_date, category_id = p_category_id,
      description = btrim(p_description), supplier_payee = btrim(p_supplier_payee), amount = p_amount,
      remarks = NULLIF(btrim(COALESCE(p_remarks, '')), '')
    WHERE id = p_cost_id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Cost not found' USING ERRCODE = '22023'; END IF;
    DELETE FROM public.profit_loss_cost_allocations WHERE cost_id = saved_id;
  END IF;
  INSERT INTO public.profit_loss_cost_allocations (cost_id, billboard_id, amount)
  SELECT saved_id, NULLIF(item->>'billboard_id', '')::uuid, (item->>'amount')::numeric FROM jsonb_array_elements(p_allocations) item;
  RETURN saved_id;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Allocation values are invalid' USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_profit_loss_cost(p_cost_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_profit_loss_owner() THEN RAISE EXCEPTION 'Only the owner can delete costs' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.profit_loss_costs WHERE id = p_cost_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cost not found' USING ERRCODE = '22023'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profit_loss_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_profit_loss_revenue_month(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_profit_loss_category(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_profit_loss_cost(uuid, date, uuid, text, text, numeric, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_profit_loss_cost(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_loss_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profit_loss_revenue_month(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_profit_loss_category(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_profit_loss_cost(uuid, date, uuid, text, text, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_profit_loss_cost(uuid) TO authenticated;

-- Existing self-profile updates must not permit users to grant themselves P&L access or a stronger role.
CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() = OLD.id AND OLD.role <> 'owner' AND (
    NEW.role IS DISTINCT FROM OLD.role OR NEW.approved IS DISTINCT FROM OLD.approved
    OR NEW.allowed_pages IS DISTINCT FROM OLD.allowed_pages OR NEW.email IS DISTINCT FROM OLD.email
  ) THEN RAISE EXCEPTION 'Only the owner can change access fields' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_protect_access_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();

COMMENT ON TABLE public.profit_loss_revenue_assignments IS 'Reporting-month overrides for completed monthly payments. Existing completed rows fall back to 2026-10 without backfill.';
COMMENT ON TABLE public.profit_loss_cost_categories IS 'P&L cost categories are deactivated rather than deleted so historical costs retain their labels.';
COMMENT ON TABLE public.profit_loss_cost_allocations IS 'A NULL billboard_id represents General / Company Overhead.';

NOTIFY pgrst, 'reload schema';
COMMIT;
