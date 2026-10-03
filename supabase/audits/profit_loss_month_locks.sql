-- Read-only verification after applying the P&L month-lock migration.
SELECT reporting_month, locked_at, locked_by FROM public.profit_loss_month_locks ORDER BY reporting_month;

SELECT tgname, tgrelid::regclass AS protected_table
FROM pg_trigger
WHERE tgname IN ('profit_loss_revenue_month_lock', 'profit_loss_cost_month_lock', 'profit_loss_allocation_month_lock', 'monthly_payments_locked_revenue_status', 'bookings_locked_revenue_details')
  AND NOT tgisinternal
ORDER BY tgname;

SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('lock_profit_loss_month', 'unlock_profit_loss_month', 'is_profit_loss_month_locked')
ORDER BY routine_name;
