-- Add invoice_number to monthly_payments
ALTER TABLE monthly_payments ADD COLUMN IF NOT EXISTS invoice_number TEXT;
