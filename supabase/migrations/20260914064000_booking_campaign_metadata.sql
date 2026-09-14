-- MAIN PCSB only. Additive, nullable, no defaults/backfill or policy changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.bookings
  ADD COLUMN campaign_name varchar(200),
  ADD COLUMN booking_number varchar(100);
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_campaign_name_no_controls CHECK (campaign_name IS NULL OR campaign_name !~ '[[:cntrl:]]'),
  ADD CONSTRAINT bookings_booking_number_no_controls CHECK (booking_number IS NULL OR booking_number !~ '[[:cntrl:]]');
NOTIFY pgrst, 'reload schema';
COMMIT;
