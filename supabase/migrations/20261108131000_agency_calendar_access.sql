-- Agency: approved users get one bounded calendar RPC, never raw business tables.
-- Apply after the existing migrations; no production identities or business rows change.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner', 'team', 'partner', 'agency'));

-- SECURITY DEFINER avoids recursion when used on profiles itself.
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'team', 'partner'));
$$;
REVOKE ALL ON FUNCTION public.is_internal_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_user() TO authenticated;

-- Replace legacy recursive/profile-wide management policies with known rules.
CREATE OR REPLACE FUNCTION public.is_app_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner');
$$;
REVOKE ALL ON FUNCTION public.is_app_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_owner() TO authenticated;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', p.policyname);
  END LOOP;
END;
$$;
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (public.is_internal_user() OR id = auth.uid());
CREATE POLICY profiles_owner_manage ON public.profiles FOR ALL TO authenticated USING (public.is_app_owner()) WITH CHECK (public.is_app_owner());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() AND public.is_internal_user()) WITH CHECK (id = auth.uid() AND public.is_internal_user());

-- Restrictive policies AND with all legacy permissive policies, including broad
-- authenticated commission/payment reads and stale billboard edit assignments.
-- Include every current public table, not only the tables the UI presently uses.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e'
    )
  LOOP
    -- Preserve authenticated internal access on any legacy table that did not
    -- previously use RLS. Restrictive policies alone never grant access.
    IF NOT t.relrowsecurity AND t.relname <> 'profiles' THEN
      EXECUTE format('CREATE POLICY legacy_internal_access ON public.%I FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user())', t.relname);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    -- These table privileges bypass row policies and have no browser-app use.
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated, anon, PUBLIC', t.relname);
    -- The app has no anonymous business-data surface: dropping the session must
    -- not regain rows through an older PUBLIC/anon permissive policy.
    EXECUTE format('CREATE POLICY agency_anonymous_deny ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t.relname);
    IF t.relname = 'profiles' THEN
      EXECUTE 'CREATE POLICY agency_profile_read_fence ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_internal_user() OR id = auth.uid())';
      EXECUTE 'CREATE POLICY agency_profile_insert_fence ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_internal_user())';
      EXECUTE 'CREATE POLICY agency_profile_update_fence ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user())';
      EXECUTE 'CREATE POLICY agency_profile_delete_fence ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_internal_user())';
    ELSE
      EXECUTE format('CREATE POLICY agency_internal_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user())', t.relname);
    END IF;
  END LOOP;
  -- Owner-created views otherwise bypass base-table RLS on PostgreSQL 15+.
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e'
    )
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', t.relname);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'm') THEN
    RAISE EXCEPTION 'Review materialized view grants before enabling Agency';
  END IF;
END;
$$;

-- Owner-only access-field changes even if a legacy policy permits updating
-- another user's profile. Agency profiles cannot acquire editor/page grants.
CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role'
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner') THEN
    IF TG_OP = 'INSERT' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.approved IS DISTINCT FROM OLD.approved OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.allowed_pages IS DISTINCT FROM OLD.allowed_pages
      OR NEW.can_edit_profit_loss IS DISTINCT FROM OLD.can_edit_profit_loss
      OR NEW.can_edit_other_profit_loss IS DISTINCT FROM OLD.can_edit_other_profit_loss THEN
      RAISE EXCEPTION 'Only the owner can change access fields' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.role = 'agency' THEN
    NEW.allowed_pages := ARRAY['/calendar'];
    NEW.can_edit_profit_loss := false;
    NEW.can_edit_other_profit_loss := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protect_access_fields ON public.profiles;
CREATE TRIGGER profiles_protect_access_fields BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();

-- Definer RPCs bypass RLS: their shared permission helpers must exclude Agency
-- even when a profile retains a previous role's explicit page/editor grants.
-- Live-only get_profit_loss_data_before_cost_months() also calls
-- can_access_profit_loss(); preserving that helper guard protects its original
-- internal reporting semantics without replacing or dropping the legacy RPC.
CREATE OR REPLACE FUNCTION public.can_access_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'team', 'partner')
 AND (p.role = 'owner' OR (p.approved = true AND '/profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[])))));
$$;
CREATE OR REPLACE FUNCTION public.is_profit_loss_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'team', 'partner')
 AND (p.role = 'owner' OR (p.approved = true AND p.can_edit_profit_loss = true AND '/profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[])))));
$$;
CREATE OR REPLACE FUNCTION public.can_access_other_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'team', 'partner')
 AND (p.role = 'owner' OR (p.approved = true AND '/other-profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[])))));
$$;
CREATE OR REPLACE FUNCTION public.can_edit_other_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'team', 'partner')
 AND (p.role = 'owner' OR (p.approved = true AND p.can_edit_other_profit_loss = true AND '/other-profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[])))));
$$;
CREATE OR REPLACE FUNCTION public.is_profit_loss_month_locked(p_month date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 -- Preserve enforcement for internal users and trusted service/database triggers,
 -- including service-key operations without a user JWT. Agency learns no lock state.
 SELECT (public.is_internal_user() OR auth.uid() IS NULL OR auth.role() = 'service_role')
 AND EXISTS (SELECT 1 FROM public.profit_loss_month_locks WHERE reporting_month = date_trunc('month', p_month)::date);
$$;

REVOKE ALL ON FUNCTION public.is_profit_loss_month_locked(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_profit_loss_month_locked(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_agency_calendar(p_month date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  month_floor date := date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  month_end date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'agency' AND approved = true) THEN
    RAISE EXCEPTION 'Approved Agency access required' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR NOT isfinite(p_month) OR p_month <> date_trunc('month', p_month)::date OR p_month < month_floor OR p_month > DATE '9999-12-01' THEN
    RAISE EXCEPTION 'Only current and future Malaysia months are available' USING ERRCODE = '42501';
  END IF;
  month_end := (p_month + interval '1 month - 1 day')::date;
  RETURN jsonb_build_object(
    'billboards', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'location', location, 'max_slots', max_slots) ORDER BY name) FROM public.billboards), '[]'::jsonb),
    'bookings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'billboard_id', b.billboard_id,
      'brand_name', COALESCE(NULLIF(btrim(b.brand_name), ''), c.company_name), 'campaign_name', b.campaign_name,
      'start_date', greatest(b.start_date, p_month), 'end_date', least(b.end_date, month_end),
      'start_event', b.start_date >= p_month, 'end_event', b.end_date <= month_end,
      'status', b.status, 'spot_size', b.spot_size,
      'billboard', jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location, 'max_slots', bb.max_slots)
    ) ORDER BY b.start_date, b.id)
      FROM public.bookings b JOIN public.billboards bb ON bb.id = b.billboard_id JOIN public.clients c ON c.id = b.client_id
      WHERE b.status <> 'cancelled' AND b.start_date <= month_end AND b.end_date >= p_month), '[]'::jsonb),
    'content_changes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', cc.id, 'brand_name', cc.brand_name, 'billboard_id', cc.billboard_id, 'change_date', cc.change_date,
      'billboard', jsonb_build_object('id', bb.id, 'name', bb.name, 'location', bb.location, 'max_slots', bb.max_slots)
    ) ORDER BY cc.change_date, cc.id)
      FROM public.content_changes cc JOIN public.billboards bb ON bb.id = cc.billboard_id
      WHERE cc.change_date BETWEEN p_month AND month_end), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_agency_calendar(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agency_calendar(date) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
