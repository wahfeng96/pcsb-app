-- Allow owner (role='owner') to insert and update profit_sharing records
CREATE POLICY "Owner can insert profit sharing" ON public.profit_sharing
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
    )
  );

CREATE POLICY "Owner can update profit sharing" ON public.profit_sharing
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'owner'
    )
  );
