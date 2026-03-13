-- Approve ALL existing users (they were already given access before the approval system was added)
UPDATE public.profiles SET approved = true WHERE approved = false;
