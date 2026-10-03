-- Add explicit single- or multi-month reporting allocation to P&L costs.
-- Existing costs retain the month of cost_date. Multiple months split the total in the UI.
BEGIN;

ALTER TABLE public.profit_loss_costs ADD COLUMN reporting_months date[];
UPDATE public.profit_loss_costs
SET reporting_months = ARRAY[date_trunc('month', cost_date)::date]
WHERE reporting_months IS NULL;
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.profit_loss_costs ALTER COLUMN reporting_months SET NOT NULL;

CREATE OR REPLACE FUNCTION public.valid_profit_loss_reporting_months(p_months date[], p_cost_date date)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE month_value date;
BEGIN
  IF p_months IS NULL OR cardinality(p_months) < 1 OR cardinality(p_months) > 12
     OR cardinality(p_months) <> (SELECT count(DISTINCT value) FROM unnest(p_months) value) THEN
    RETURN false;
  END IF;
  FOREACH month_value IN ARRAY p_months LOOP
    IF month_value IS NULL OR month_value <> date_trunc('month', month_value)::date
       OR extract(year FROM month_value) <> extract(year FROM p_cost_date) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.profit_loss_costs
  ADD CONSTRAINT profit_loss_cost_reporting_months_valid
  CHECK (public.valid_profit_loss_reporting_months(reporting_months, cost_date));

CREATE INDEX profit_loss_costs_reporting_months_idx
  ON public.profit_loss_costs USING gin(reporting_months);

CREATE OR REPLACE FUNCTION public.enforce_profit_loss_month_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_months date[]; new_months date[];
BEGIN
  IF TG_TABLE_NAME = 'profit_loss_revenue_assignments' THEN
    IF TG_OP <> 'INSERT' THEN old_months := ARRAY[OLD.reporting_month]; END IF;
    IF TG_OP <> 'DELETE' THEN new_months := ARRAY[NEW.reporting_month]; END IF;
  ELSIF TG_TABLE_NAME = 'profit_loss_costs' THEN
    IF TG_OP <> 'INSERT' THEN old_months := OLD.reporting_months; END IF;
    IF TG_OP <> 'DELETE' THEN new_months := NEW.reporting_months; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT cost.reporting_months INTO old_months FROM public.profit_loss_costs cost WHERE cost.id = OLD.cost_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT cost.reporting_months INTO new_months FROM public.profit_loss_costs cost WHERE cost.id = NEW.cost_id;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(old_months, ARRAY[]::date[]) || COALESCE(new_months, ARRAY[]::date[])) month_value
    WHERE public.is_profit_loss_month_locked(month_value)
  ) THEN
    RAISE EXCEPTION 'P&L month is locked. Unlock it before making changes.' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_profit_loss_cost(
  p_cost_id uuid, p_cost_date date, p_category_id uuid, p_description text,
  p_supplier_payee text, p_amount numeric, p_remarks text, p_allocations jsonb,
  p_reporting_months date[]
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
  IF NOT public.valid_profit_loss_reporting_months(p_reporting_months, p_cost_date) THEN
    RAISE EXCEPTION 'Select one or more unique reporting months from the cost year' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_reporting_months) month_value WHERE public.is_profit_loss_month_locked(month_value)) THEN
    RAISE EXCEPTION 'P&L month is locked. Unlock it before making changes.' USING ERRCODE = '55000';
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
  SELECT count(*), coalesce(sum((item->>'amount')::numeric), 0), count(DISTINCT coalesce(nullif(item->>'billboard_id', ''), '__general__'))
  INTO allocation_count, allocation_total, distinct_count FROM jsonb_array_elements(p_allocations) item;
  IF allocation_count < 1 OR allocation_count <> distinct_count OR allocation_total <> p_amount THEN
    RAISE EXCEPTION 'Allocations must be unique and sum exactly to the total cost' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) item
    WHERE (item->>'amount')::numeric <= 0
       OR (nullif(item->>'billboard_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.billboards bb WHERE bb.id = (item->>'billboard_id')::uuid
       ))
  ) THEN RAISE EXCEPTION 'Every allocation must have a positive amount and valid billboard' USING ERRCODE = '22023'; END IF;
  IF p_cost_id IS NULL THEN
    INSERT INTO public.profit_loss_costs (cost_date, category_id, description, supplier_payee, amount, remarks, reporting_months, created_by)
    VALUES (p_cost_date, p_category_id, btrim(p_description), btrim(p_supplier_payee), p_amount, nullif(btrim(coalesce(p_remarks, '')), ''), p_reporting_months, auth.uid())
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.profit_loss_costs SET cost_date = p_cost_date, category_id = p_category_id,
      description = btrim(p_description), supplier_payee = btrim(p_supplier_payee), amount = p_amount,
      remarks = nullif(btrim(coalesce(p_remarks, '')), ''), reporting_months = p_reporting_months
    WHERE id = p_cost_id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Cost not found' USING ERRCODE = '22023'; END IF;
    DELETE FROM public.profit_loss_cost_allocations WHERE cost_id = saved_id;
  END IF;
  INSERT INTO public.profit_loss_cost_allocations (cost_id, billboard_id, amount)
  SELECT saved_id, nullif(item->>'billboard_id', '')::uuid, (item->>'amount')::numeric FROM jsonb_array_elements(p_allocations) item;
  RETURN saved_id;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'Allocation values are invalid' USING ERRCODE = '22023';
END;
$$;

-- Keep the previous RPC compatible during a rolling frontend deployment.
CREATE OR REPLACE FUNCTION public.save_profit_loss_cost(
  p_cost_id uuid, p_cost_date date, p_category_id uuid, p_description text,
  p_supplier_payee text, p_amount numeric, p_remarks text, p_allocations jsonb
)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.save_profit_loss_cost(
    p_cost_id, p_cost_date, p_category_id, p_description, p_supplier_payee,
    p_amount, p_remarks, p_allocations, ARRAY[date_trunc('month', p_cost_date)::date]
  );
$$;

ALTER FUNCTION public.get_profit_loss_data() RENAME TO get_profit_loss_data_before_cost_months;
CREATE OR REPLACE FUNCTION public.get_profit_loss_data()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  result := public.get_profit_loss_data_before_cost_months();
  RETURN jsonb_set(result, '{costs}', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cost.id, 'cost_date', cost.cost_date, 'reporting_months',
        (SELECT jsonb_agg(to_char(month_value, 'YYYY-MM') ORDER BY month_value) FROM unnest(cost.reporting_months) month_value),
      'category_id', cost.category_id, 'category_name', cat.name, 'description', cost.description,
      'supplier_payee', cost.supplier_payee, 'amount', cost.amount, 'remarks', cost.remarks,
      'allocations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', alloc.id, 'billboard_id', alloc.billboard_id,
          'billboard_name', COALESCE(bb.name, 'General / Company Overhead'), 'amount', alloc.amount
        ) ORDER BY bb.name NULLS FIRST)
        FROM public.profit_loss_cost_allocations alloc
        LEFT JOIN public.billboards bb ON bb.id = alloc.billboard_id
        WHERE alloc.cost_id = cost.id
      ), '[]'::jsonb)
    ) ORDER BY cost.cost_date DESC, cost.created_at DESC)
    FROM public.profit_loss_costs cost
    JOIN public.profit_loss_cost_categories cat ON cat.id = cost.category_id
  ), '[]'::jsonb), true);
END;
$$;

REVOKE ALL ON FUNCTION public.valid_profit_loss_reporting_months(date[], date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profit_loss_data_before_cost_months() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profit_loss_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_profit_loss_cost(uuid, date, uuid, text, text, numeric, text, jsonb, date[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_loss_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_profit_loss_cost(uuid, date, uuid, text, text, numeric, text, jsonb, date[]) TO authenticated;

COMMENT ON COLUMN public.profit_loss_costs.reporting_months IS 'One to twelve month-start dates in the cost year. The total cost is reported evenly across these months.';
COMMENT ON FUNCTION public.save_profit_loss_cost(uuid, date, uuid, text, text, numeric, text, jsonb, date[]) IS 'Owner-only cost save with validated single- or multi-month reporting allocation.';
NOTIFY pgrst, 'reload schema';
COMMIT;
