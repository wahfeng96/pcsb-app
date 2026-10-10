-- MAIN PCSB: explicit Other P&L editor grant; no other permissions or ledger changes.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.profiles
  ADD COLUMN can_edit_other_profit_loss boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.can_edit_other_profit_loss IS
  'Owner-controlled Other P&L editor permission; requires approval and explicit page access.';

CREATE OR REPLACE FUNCTION public.can_edit_other_profit_loss()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
    AND (p.role = 'owner' OR (p.approved = true
      AND p.can_edit_other_profit_loss = true
      AND '/other-profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[]))))
  );
$$;
REVOKE ALL ON FUNCTION public.can_edit_other_profit_loss() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_other_profit_loss() TO authenticated;

-- Extend the established self-profile guard without weakening existing protections.
CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() = OLD.id AND OLD.role <> 'owner' AND (
    NEW.role IS DISTINCT FROM OLD.role OR NEW.approved IS DISTINCT FROM OLD.approved
    OR NEW.allowed_pages IS DISTINCT FROM OLD.allowed_pages OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.can_edit_profit_loss IS DISTINCT FROM OLD.can_edit_profit_loss
    OR NEW.can_edit_other_profit_loss IS DISTINCT FROM OLD.can_edit_other_profit_loss
  ) THEN RAISE EXCEPTION 'Only the owner can change access fields' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;

-- Immutable identity verified read-only before this owner-authorized grant.
-- Fail closed if identity, approval or existing explicit page access has changed.
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE lower(email) = 'seeleylee91@gmail.com') <> 1
    OR (SELECT count(*) FROM auth.users WHERE lower(email) = 'seeleylee91@gmail.com') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one existing target identity';
  END IF;
  UPDATE public.profiles p SET can_edit_other_profit_loss = true
  FROM auth.users u
  WHERE p.id = 'a4495656-bce4-41f6-9263-52269985afcf'::uuid
    AND u.id = p.id AND p.email = 'seeleylee91@gmail.com' AND u.email = p.email
    AND p.approved = true
    AND '/other-profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[]));
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Other P&L editor grant was not applied'; END IF;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
