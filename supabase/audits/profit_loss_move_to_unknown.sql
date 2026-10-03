-- Read-only post-migration audit. No assignment rows should change when the migration is applied.
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'unassign_profit_loss_revenue';

SELECT count(*) AS assigned_revenue_rows
FROM public.profit_loss_revenue_assignments;

SELECT count(*) AS completed_unassigned_revenue_rows
FROM public.monthly_payments payment
JOIN public.bookings booking ON booking.id = payment.booking_id
LEFT JOIN public.profit_loss_revenue_assignments assignment ON assignment.monthly_payment_id = payment.id
WHERE payment.status = 'completed'
  AND booking.payment_status = 'settled'
  AND booking.status <> 'cancelled'
  AND assignment.monthly_payment_id IS NULL;
