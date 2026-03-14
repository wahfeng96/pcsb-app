-- Profit sharing: authenticated users can view all (it's summary data)
DROP POLICY IF EXISTS "Users can view profit sharing" ON public.profit_sharing;
CREATE POLICY "Authenticated users can view profit sharing" ON public.profit_sharing FOR SELECT USING (auth.uid() IS NOT NULL);

-- Monthly payments: authenticated users can view all
DROP POLICY IF EXISTS "Users can view monthly payments" ON public.monthly_payments;
CREATE POLICY "Authenticated users can view monthly payments" ON public.monthly_payments FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users with billboard access can manage clients
DROP POLICY IF EXISTS "Users with edit access can manage clients" ON public.clients;
CREATE POLICY "Users with access can manage clients" ON public.clients FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_billboard_access uba WHERE uba.user_id = auth.uid()
  )
);

-- Users with billboard access can manage bookings on their billboards
DROP POLICY IF EXISTS "Users with edit access can manage bookings" ON public.bookings;
CREATE POLICY "Users with access can manage bookings" ON public.bookings FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_billboard_access uba
    WHERE uba.billboard_id = bookings.billboard_id AND uba.user_id = auth.uid()
  )
);
