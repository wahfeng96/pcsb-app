-- MAIN PCSB only. Add an explicit, owner-controlled P&L editor permission.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_edit_profit_loss boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_edit_profit_loss IS
  'Owner-controlled permission to edit P&L while retaining the user''s existing role.';

-- This legacy helper is only used by P&L policies and RPC mutation guards.
-- Preserve owner access and extend it to approved explicit editors who can view P&L.
CREATE OR REPLACE FUNCTION public.is_profit_loss_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'owner'
        OR (
          p.approved = true
          AND p.can_edit_profit_loss = true
          AND '/profit-loss' = ANY(COALESCE(p.allowed_pages, ARRAY[]::text[]))
        )
      )
  );
$$;

-- Existing self-profile updates must not permit users to grant themselves edit access.
CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() = OLD.id AND OLD.role <> 'owner' AND (
    NEW.role IS DISTINCT FROM OLD.role OR NEW.approved IS DISTINCT FROM OLD.approved
    OR NEW.allowed_pages IS DISTINCT FROM OLD.allowed_pages OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.can_edit_profit_loss IS DISTINCT FROM OLD.can_edit_profit_loss
  ) THEN RAISE EXCEPTION 'Only the owner can change access fields' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END;
$$;

-- Explicitly approved by the PCSB owner for Lee See Ley's existing account.
UPDATE public.profiles
SET can_edit_profit_loss = true
WHERE lower(email) = 'seeleylee91@gmail.com'
  AND approved = true
  AND '/profit-loss' = ANY(COALESCE(allowed_pages, ARRAY[]::text[]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(email) = 'seeleylee91@gmail.com'
      AND approved = true
      AND can_edit_profit_loss = true
      AND '/profit-loss' = ANY(COALESCE(allowed_pages, ARRAY[]::text[]))
  ) THEN
    RAISE EXCEPTION 'Lee See Ley P&L editor grant was not applied';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
