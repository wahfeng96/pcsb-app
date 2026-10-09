-- MAIN PCSB read-only invoice-toggle verification; save output privately.
SELECT jsonb_build_object(
  'project', 'sqryqwlevsgklctkxwok',
  'migration_rows', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261009140000'),
  'ledger_rows', (SELECT count(*) FROM public.other_profit_loss_entries),
  'flagged_rows', (SELECT count(*) FROM public.other_profit_loss_entries WHERE no_invoice),
  'income_flagged', (SELECT count(*) FROM public.other_profit_loss_entries WHERE kind='income' AND no_invoice),
  'column', (SELECT to_jsonb(c) FROM information_schema.columns c WHERE table_schema='public' AND table_name='other_profit_loss_entries' AND column_name='no_invoice'),
  'constraint', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='other_profit_loss_expense_invoice_only'),
  'rls', (SELECT relrowsecurity FROM pg_class WHERE oid='public.other_profit_loss_entries'::regclass),
  'policy_count', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='other_profit_loss_entries'),
  'rpc_definition', pg_get_functiondef('public.set_other_expense_no_invoice(uuid,boolean)'::regprocedure),
  'rpc_security_definer', (SELECT prosecdef FROM pg_proc WHERE oid='public.set_other_expense_no_invoice(uuid,boolean)'::regprocedure),
  'anon_execute', has_function_privilege('anon','public.set_other_expense_no_invoice(uuid,boolean)','EXECUTE'),
  'authenticated_execute', has_function_privilege('authenticated','public.set_other_expense_no_invoice(uuid,boolean)','EXECUTE'),
  'profile_protection', (SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%protect%profile%')
) AS evidence;
