-- Add approved column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Auto-approve the owner
UPDATE public.profiles SET approved = true WHERE role = 'owner';

-- Update the trigger to include approved field
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, approved)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', ''), 'team', false);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
