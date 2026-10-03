-- Read-only post-migration audit. Expected result: zero duplicate assigned booking/months.
SELECT mp.booking_id, mp.month, count(*) AS assigned_rows
FROM public.monthly_payments mp
JOIN public.profit_loss_revenue_assignments a ON a.monthly_payment_id = mp.id
WHERE mp.status = 'completed'
GROUP BY mp.booking_id, mp.month
HAVING count(*) > 1;

-- Settled booking coverage, including the production example. This does not mutate data.
SELECT b.id, b.payment_status, b.monthly_rate, b.total_amount,
       count(DISTINCT mp.month) FILTER (WHERE mp.status = 'completed') AS completed_payment_months,
       count(DISTINCT mp.month) FILTER (WHERE a.monthly_payment_id IS NOT NULL) AS assigned_months
FROM public.bookings b
LEFT JOIN public.monthly_payments mp ON mp.booking_id = b.id
LEFT JOIN public.profit_loss_revenue_assignments a ON a.monthly_payment_id = mp.id
WHERE b.payment_status = 'settled' OR b.id = 'a8a7252f-1c91-4426-8f76-ebd711b3635c'
GROUP BY b.id, b.payment_status, b.monthly_rate, b.total_amount
ORDER BY b.id;

SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.monthly_payments'::regclass AND NOT tgisinternal
ORDER BY tgname;
