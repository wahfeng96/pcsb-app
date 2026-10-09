-- MAIN PCSB only. Independent manual non-advertising ledger; no business-row updates.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.can_access_other_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.role = 'owner' OR (p.approved = true
      AND '/other-profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[]))))
  );
$$;
CREATE FUNCTION public.can_edit_other_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'owner');
$$;
REVOKE ALL ON FUNCTION public.can_access_other_profit_loss() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_other_profit_loss() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_other_profit_loss() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_other_profit_loss() TO authenticated;

CREATE TABLE public.other_profit_loss_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL CHECK (entry_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  kind text NOT NULL CHECK (kind IN ('income', 'expense')),
  description varchar(300) NOT NULL CHECK (btrim(description) <> '' AND description !~ '[[:cntrl:]]'),
  category varchar(100) CHECK (category IS NULL OR (btrim(category) <> '' AND category !~ '[[:cntrl:]]')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.other_profit_loss_entries IS
  'Independent manual non-advertising income and expenses. Never included in advertising P&L or Accounts.';
CREATE INDEX other_profit_loss_entries_date_idx ON public.other_profit_loss_entries(entry_date DESC, id);
ALTER TABLE public.other_profit_loss_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.other_profit_loss_entries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_profit_loss_entries TO authenticated;
CREATE POLICY other_profit_loss_read ON public.other_profit_loss_entries
  FOR SELECT TO authenticated USING (public.can_access_other_profit_loss());
CREATE POLICY other_profit_loss_insert ON public.other_profit_loss_entries
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_other_profit_loss() AND created_by = auth.uid());
CREATE POLICY other_profit_loss_update ON public.other_profit_loss_entries
  FOR UPDATE TO authenticated USING (public.can_edit_other_profit_loss()) WITH CHECK (public.can_edit_other_profit_loss());
CREATE POLICY other_profit_loss_delete ON public.other_profit_loss_entries
  FOR DELETE TO authenticated USING (public.can_edit_other_profit_loss());

CREATE FUNCTION public.other_profit_loss_touch_entry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;
CREATE TRIGGER other_profit_loss_entry_updated BEFORE UPDATE ON public.other_profit_loss_entries
FOR EACH ROW EXECUTE FUNCTION public.other_profit_loss_touch_entry();
NOTIFY pgrst, 'reload schema';
COMMIT;
