-- Null means legacy/default access to all pages; an array means explicitly selected pages.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_pages text[] DEFAULT NULL;

COMMENT ON COLUMN public.profiles.allowed_pages IS
  'Null grants legacy access to all app pages; otherwise contains the explicitly allowed top-level routes.';
