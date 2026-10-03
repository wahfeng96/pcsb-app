-- Read-only pre/post migration audit for booking-owned dependent values.
-- A clean post-migration result returns zero rows from each mismatch query.

SELECT
  payment.id AS monthly_payment_id,
  payment.invoice_number,
  payment.month,
  payment.status,
  payment.amount AS stored_amount,
  booking.monthly_rate AS booking_amount
FROM public.monthly_payments payment
JOIN public.bookings booking ON booking.id = payment.booking_id
WHERE payment.amount IS DISTINCT FROM booking.monthly_rate
ORDER BY payment.invoice_number NULLS LAST, payment.month, payment.id;

SELECT
  share.id AS profit_sharing_id,
  share.month,
  share.status,
  share.amount AS stored_amount,
  booking.monthly_rate AS booking_amount,
  share.billboard_id AS stored_billboard_id,
  booking.billboard_id AS booking_billboard_id,
  share.sales_person AS stored_sales_person,
  booking.sales_person AS booking_sales_person
FROM public.profit_sharing share
JOIN public.bookings booking ON booking.id = share.booking_id
WHERE (share.amount, share.billboard_id, share.sales_person) IS DISTINCT FROM
      (booking.monthly_rate, booking.billboard_id, NULLIF(btrim(booking.sales_person), ''))
ORDER BY share.month, share.id;

SELECT
  commission.id AS commission_id,
  commission.month,
  commission.status,
  commission.amount AS stored_amount,
  booking.monthly_rate * booking.commission_percent / 100 AS booking_amount
FROM public.commissions commission
JOIN public.bookings booking ON booking.id = commission.booking_id
WHERE commission.amount IS DISTINCT FROM booking.monthly_rate * booking.commission_percent / 100
ORDER BY commission.month, commission.id;

-- Duplicate workflow rows are not repaired automatically because invoice/payment history
-- needs human review before records can be merged or removed.
SELECT
  payment.booking_id,
  payment.month,
  count(*) AS row_count,
  array_agg(payment.invoice_number ORDER BY payment.id) AS invoice_numbers,
  array_agg(payment.status ORDER BY payment.id) AS statuses
FROM public.monthly_payments payment
GROUP BY payment.booking_id, payment.month
HAVING count(*) > 1
ORDER BY row_count DESC, payment.booking_id, payment.month;
