-- Allow owner to delete profit_sharing records (needed for booking deletion)
CREATE POLICY "Owner can delete profit sharing" ON public.profit_sharing
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
  );
