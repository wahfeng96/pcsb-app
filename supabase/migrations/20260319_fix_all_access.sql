-- Fix ALL access policies for non-owner users

-- 1. user_billboard_access: users can read their own access
CREATE POLICY "Users can view own access" ON public.user_billboard_access 
  FOR SELECT USING (user_id = auth.uid());

-- 2. billboards: users with billboard access can see those billboards
CREATE POLICY "Users see assigned billboards" ON public.billboards 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_billboard_access WHERE user_id = auth.uid() AND billboard_id = id)
  );

-- 3. clients: users with billboard access can see clients on their billboards
CREATE POLICY "Users can view clients on their billboards" ON public.clients 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.user_billboard_access uba ON b.billboard_id = uba.billboard_id
      WHERE b.client_id = clients.id AND uba.user_id = auth.uid()
    )
  );

-- 4. bookings: users with billboard access can see bookings on their billboards
CREATE POLICY "Users can view bookings on their billboards" ON public.bookings 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_billboard_access uba
      WHERE uba.billboard_id = bookings.billboard_id AND uba.user_id = auth.uid()
    )
  );

-- 5. billboard_costs: users with billboard access can view costs
CREATE POLICY "Users can view billboard costs" ON public.billboard_costs 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_billboard_access uba
      WHERE uba.billboard_id = billboard_costs.billboard_id AND uba.user_id = auth.uid()
    )
  );
