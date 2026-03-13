-- Allow owner to delete profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owner can delete profiles' AND tablename = 'profiles') THEN
    CREATE POLICY "Owner can delete profiles" ON public.profiles FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner')
    );
  END IF;
END $$;
