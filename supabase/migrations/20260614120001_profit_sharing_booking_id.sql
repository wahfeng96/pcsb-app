-- Add booking_id column for per-booking status tracking
ALTER TABLE public.profit_sharing ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id);

-- Make billboard_id nullable (not needed for per-booking records)
ALTER TABLE public.profit_sharing ALTER COLUMN billboard_id DROP NOT NULL;
