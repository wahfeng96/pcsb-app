-- Make sales_person nullable for per-booking records
ALTER TABLE public.profit_sharing ALTER COLUMN sales_person DROP NOT NULL;
