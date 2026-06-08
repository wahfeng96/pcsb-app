-- Content change calendar markers (blue entries)
CREATE TABLE IF NOT EXISTS public.content_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  billboard_id uuid NOT NULL REFERENCES public.billboards(id) ON DELETE CASCADE,
  change_date date NOT NULL,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_changes_change_date_idx ON public.content_changes(change_date);
CREATE INDEX IF NOT EXISTS content_changes_billboard_id_idx ON public.content_changes(billboard_id);

ALTER TABLE public.content_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner and team can view content changes" ON public.content_changes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'team'))
  );

CREATE POLICY "Users can view content changes on assigned billboards" ON public.content_changes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_billboard_access uba
      WHERE uba.user_id = auth.uid() AND uba.billboard_id = content_changes.billboard_id
    )
  );

CREATE POLICY "Owner and team can manage content changes" ON public.content_changes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'team'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'team'))
  );

CREATE POLICY "Users can manage content changes on assigned billboards" ON public.content_changes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_billboard_access uba
      WHERE uba.user_id = auth.uid() AND uba.billboard_id = content_changes.billboard_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_billboard_access uba
      WHERE uba.user_id = auth.uid() AND uba.billboard_id = content_changes.billboard_id
    )
  );

DROP TRIGGER IF EXISTS content_changes_updated_at ON public.content_changes;
CREATE TRIGGER content_changes_updated_at BEFORE UPDATE ON public.content_changes
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();
