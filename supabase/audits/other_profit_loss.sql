-- Read-only MAIN PCSB release evidence. Run the first two queries before migration.
-- Save their results privately and compare the business counts after migration.
SELECT c.relname AS business_table,
  (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS row_count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'other_profit_loss_entries'
ORDER BY c.relname;

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261009120000') AS applied_versions,
  to_regclass('public.other_profit_loss_entries') AS ledger_table,
  to_regprocedure('public.can_access_other_profit_loss()') AS read_guard,
  to_regprocedure('public.can_edit_other_profit_loss()') AS write_guard;

-- Post-migration only: ledger starts empty, RLS enabled, four policies, owner-only writes.
SELECT count(*) AS ledger_rows FROM public.other_profit_loss_entries;
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.other_profit_loss_entries'::regclass;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'other_profit_loss_entries' ORDER BY policyname;
SELECT pg_get_functiondef('public.can_access_other_profit_loss()'::regprocedure),
  pg_get_functiondef('public.can_edit_other_profit_loss()'::regprocedure);
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.other_profit_loss_entries'::regclass AND NOT tgisinternal;
SELECT has_table_privilege('anon', 'public.other_profit_loss_entries', 'SELECT') AS anon_can_read,
  has_function_privilege('anon', 'public.can_access_other_profit_loss()', 'EXECUTE') AS anon_can_call_read_guard;
SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20261009120000';
