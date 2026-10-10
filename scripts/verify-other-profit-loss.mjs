// Synthetic PostgreSQL integration checks. Never connects to a remote database.
// Usage: node scripts/verify-other-profit-loss.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
let checks = 0
const check = (condition, message) => { assert.ok(condition, message); checks++ }
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text, approved boolean, allowed_pages text[]);
  INSERT INTO public.profiles VALUES
    ('00000000-0000-0000-0000-000000000001','owner',true,NULL),
    ('00000000-0000-0000-0000-000000000002','team',true,ARRAY['/other-profit-loss']),
    ('00000000-0000-0000-0000-000000000003','partner',true,NULL),
    ('00000000-0000-0000-0000-000000000004','team',false,ARRAY['/other-profit-loss']),
    ('00000000-0000-0000-0000-000000000005','team',true,ARRAY['/profit-loss']);
  CREATE TABLE public.bookings (id integer, amount numeric);
  INSERT INTO public.bookings VALUES (1,123.45);
`)
const migration = readFileSync(new URL('../supabase/migrations/20261009120000_other_profit_loss.sql', import.meta.url), 'utf8')
const before = await db.query('SELECT * FROM public.profiles ORDER BY id')
await db.exec(migration.replace(/COMMIT;\s*$/, 'ROLLBACK;'))
check((await db.query("SELECT to_regclass('public.other_profit_loss_entries') AS table_name")).rows[0].table_name === null, 'rollback dry run leaves no table')
await db.exec(migration)
check(JSON.stringify((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows) === JSON.stringify(before.rows), 'existing profiles unchanged')
check((await db.query('SELECT amount FROM public.bookings')).rows[0].amount === '123.45', 'existing advertising sentinel unchanged')
check((await db.query('SELECT count(*)::int AS n FROM public.other_profit_loss_entries')).rows[0].n === 0, 'new ledger empty')
check((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.other_profit_loss_entries'::regclass")).rows[0].relrowsecurity, 'RLS enabled')
check((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename='other_profit_loss_entries'")).rows[0].n === 4, 'four explicit policies')
async function identity(id) {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [`00000000-0000-0000-0000-${String(id).padStart(12, '0')}`])
  await db.exec('SET ROLE authenticated')
}
async function rejects(sql, message) {
  await assert.rejects(db.exec(sql), undefined, message)
  checks++
}
await identity(1)
await db.exec("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income','Synthetic manual income',100.10), ('2026-10-09','expense','Synthetic expense',30.20)")
check((await db.query('SELECT count(*)::int AS n FROM public.other_profit_loss_entries')).rows[0].n === 2, 'owner creates both kinds')
check((await db.query('SELECT sum(CASE WHEN kind=\'income\' THEN amount ELSE -amount END) AS net FROM public.other_profit_loss_entries')).rows[0].net === '69.90', 'database totals exact')
const original = (await db.query("SELECT * FROM public.other_profit_loss_entries WHERE kind='income'")).rows[0]
await db.exec("UPDATE public.other_profit_loss_entries SET description='Updated literal <script>', created_by=NULL, created_at='2000-01-01', updated_at='2000-01-01' WHERE kind='income'")
const updated = (await db.query("SELECT * FROM public.other_profit_loss_entries WHERE kind='income'")).rows[0]
check(updated.description === 'Updated literal <script>', 'owner edits safely stored literal text')
check(updated.created_by === original.created_by && String(updated.created_at) === String(original.created_at), 'creator provenance immutable')
check(new Date(updated.updated_at).getTime() !== new Date('2000-01-01T00:00:00.000Z').getTime(), 'updated timestamp maintained')
for (const amount of ['0', '-1', "'NaN'", '1000000000000']) await rejects(`INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income','invalid',${amount})`, `reject amount ${amount}`)
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','wrong','invalid',1)", 'reject kind')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income','   ',1)", 'reject blank description')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income',E'bad\\ntext',1)", 'reject control text')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,category,amount) VALUES ('2026-10-09','income','invalid',' ',1)", 'reject blank category')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-02-30','income','invalid',1)", 'reject invalid date')
// A PostgREST array insert is one PostgreSQL INSERT statement, so one invalid
// monthly row rolls back every row in that request. Use only synthetic records.
await db.exec("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-01-31','expense','Synthetic monthly rental',1000), ('2026-02-28','expense','Synthetic monthly rental',1000), ('2026-03-31','expense','Synthetic monthly rental',1000)")
check((await db.query("SELECT count(*)::int AS n, sum(amount) AS total FROM public.other_profit_loss_entries WHERE description='Synthetic monthly rental'")).rows[0].total === '3000.00', 'batch stores amount per month')
check((await db.query("SELECT count(*)::int AS n FROM public.other_profit_loss_entries WHERE description='Synthetic monthly rental'")).rows[0].n === 3, 'batch stores three independent entries')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-01-01','expense','Failed batch',1000), ('2026-02-01','expense','Failed batch',0), ('2026-03-01','expense','Failed batch',1000)", 'invalid middle row rejects whole batch')
check((await db.query("SELECT count(*)::int AS n FROM public.other_profit_loss_entries WHERE description='Failed batch'")).rows[0].n === 0, 'failed batch leaves no partial entries')
await db.exec("UPDATE public.other_profit_loss_entries SET amount=1100 WHERE description='Synthetic monthly rental' AND entry_date='2026-02-28'")
check((await db.query("SELECT sum(amount) AS total FROM public.other_profit_loss_entries WHERE description='Synthetic monthly rental'")).rows[0].total === '3100.00', 'single-row edit does not multiply across batch')
await db.exec("DELETE FROM public.other_profit_loss_entries WHERE description='Synthetic monthly rental' AND entry_date='2026-02-28'")
check((await db.query("SELECT sum(amount) AS total FROM public.other_profit_loss_entries WHERE description='Synthetic monthly rental'")).rows[0].total === '2000.00', 'single-row delete preserves sibling months')
await db.exec("DELETE FROM public.other_profit_loss_entries WHERE description='Synthetic monthly rental'")
await identity(2)
check((await db.query('SELECT count(*)::int AS n FROM public.other_profit_loss_entries')).rows[0].n === 2, 'approved explicit viewer reads')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income','viewer write',1)", 'viewer cannot insert')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-01-01','expense','Viewer batch',1000), ('2026-02-01','expense','Viewer batch',1000)", 'viewer cannot insert a multi-month batch')
check((await db.query("UPDATE public.other_profit_loss_entries SET amount=999 RETURNING id")).rows.length === 0, 'viewer cannot update')
check((await db.query('DELETE FROM public.other_profit_loss_entries RETURNING id')).rows.length === 0, 'viewer cannot delete')
for (const id of [3,4,5]) {
  await identity(id)
  check((await db.query('SELECT count(*)::int AS n FROM public.other_profit_loss_entries')).rows[0].n === 0, `denied profile ${id} cannot read`)
  await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income','denied',1)", `denied profile ${id} cannot insert`)
}
await db.exec('RESET ROLE; SET ROLE anon')
await rejects('SELECT * FROM public.other_profit_loss_entries', 'anonymous cannot read')
await rejects('SELECT public.can_access_other_profit_loss()', 'anonymous cannot invoke read guard despite explicit default grant')
await rejects('SELECT public.can_edit_other_profit_loss()', 'anonymous cannot invoke write guard despite explicit default grant')
await db.exec('RESET ROLE')
const invoiceMigration = readFileSync(new URL('../supabase/migrations/20261009140000_other_expense_no_invoice.sql', import.meta.url), 'utf8')
const ledgerBefore = (await db.query('SELECT * FROM public.other_profit_loss_entries ORDER BY id')).rows
await db.exec(invoiceMigration.replace(/COMMIT;\s*$/, 'ROLLBACK;'))
check((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='other_profit_loss_entries' AND column_name='no_invoice'")).rows[0].n === 0, 'invoice rollback leaves no column')
await db.exec(invoiceMigration)
const ledgerAfter = (await db.query('SELECT * FROM public.other_profit_loss_entries ORDER BY id')).rows
check(ledgerAfter.every(row => row.no_invoice === false), 'existing entries default false')
check(JSON.stringify(ledgerAfter.map(({ no_invoice, ...row }) => row)) === JSON.stringify(ledgerBefore), 'all existing ledger values unchanged')
const expenseId = ledgerAfter.find(row => row.kind === 'expense').id
const incomeId = ledgerAfter.find(row => row.kind === 'income').id
for (const id of [1, 2]) {
  await identity(id)
  check((await db.query(`SELECT public.set_other_expense_no_invoice('${expenseId}', true) AS flag`)).rows[0].flag === true, `authorized profile ${id} flags expense`)
  check((await db.query(`SELECT public.set_other_expense_no_invoice('${expenseId}', false) AS flag`)).rows[0].flag === false, `authorized profile ${id} clears expense`)
  await rejects(`SELECT public.set_other_expense_no_invoice('${incomeId}', true)`, 'RPC rejects income')
  await rejects(`SELECT public.set_other_expense_no_invoice('${expenseId}', NULL)`, 'RPC rejects null')
  await rejects("SELECT public.set_other_expense_no_invoice('00000000-0000-0000-0000-000000000099', true)", 'RPC rejects missing ID')
}
await identity(2)
for (const patch of ["amount=999", "kind='income'", "entry_date='2025-01-01'", "description='changed'", "category='changed'", "no_invoice=true", "created_by=NULL", "created_at='2000-01-01'"]) {
  check((await db.query(`UPDATE public.other_profit_loss_entries SET ${patch} RETURNING id`)).rows.length === 0, `viewer direct update denied: ${patch}`)
}
for (const id of [3, 4, 5]) {
  await identity(id)
  await rejects(`SELECT public.set_other_expense_no_invoice('${expenseId}', true)`, `invoice denied profile ${id}`)
}
await db.exec('RESET ROLE; SET ROLE anon')
await rejects(`SELECT public.set_other_expense_no_invoice('${expenseId}', true)`, 'anon invoice RPC denied despite explicit default grants')
await db.exec('RESET ROLE')
check((await db.query("SELECT has_function_privilege('anon', 'public.set_other_expense_no_invoice(uuid,boolean)', 'EXECUTE') AS allowed")).rows[0].allowed === false, 'anon RPC privilege revoked')
check(JSON.stringify((await db.query('SELECT * FROM public.other_profit_loss_entries ORDER BY id')).rows.map(({ no_invoice, updated_at, ...row }) => row)) === JSON.stringify(ledgerBefore.map(({ updated_at, ...row }) => row)), 'invoice RPC preserves financial details and provenance')
await identity(1)
await rejects(`UPDATE public.other_profit_loss_entries SET no_invoice=true WHERE id='${incomeId}'`, 'constraint rejects income flags for owner')
await db.exec("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-01-01','expense','Invoice default batch',1), ('2026-02-01','expense','Invoice default batch',1)")
check((await db.query("SELECT bool_and(no_invoice=false) AS defaults FROM public.other_profit_loss_entries WHERE description='Invoice default batch'")).rows[0].defaults, 'multi-month entries default false')
await db.exec("DELETE FROM public.other_profit_loss_entries WHERE description='Invoice default batch'")
await identity(1)
check((await db.query("DELETE FROM public.other_profit_loss_entries WHERE kind='expense' RETURNING id")).rows.length === 1, 'owner deletes')
await db.exec('RESET ROLE')
check(JSON.stringify((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows) === JSON.stringify(before.rows), 'profiles remain unchanged after synthetic operations')
// Exercise the separate editor permission using synthetic identities and finances only.
await db.exec(`
  ALTER TABLE public.profiles ADD COLUMN email text, ADD COLUMN can_edit_profit_loss boolean NOT NULL DEFAULT false;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  INSERT INTO public.profiles (id,role,approved,allowed_pages,email)
    VALUES ('a4495656-bce4-41f6-9263-52269985afcf','partner',true,ARRAY['/other-profit-loss'],'seeleylee91@gmail.com');
  INSERT INTO auth.users VALUES ('a4495656-bce4-41f6-9263-52269985afcf','seeleylee91@gmail.com');
  GRANT SELECT, UPDATE ON public.profiles TO authenticated;
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY synthetic_profile_read ON public.profiles FOR SELECT TO authenticated USING (true);
  CREATE POLICY synthetic_profile_update ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='owner'));
`)
// Avoid recursive synthetic profile policy; production policies are inspected separately.
await db.exec(`DROP POLICY synthetic_profile_update ON public.profiles;
  CREATE FUNCTION public.synthetic_user_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT role FROM public.profiles WHERE id=auth.uid() $$;
  CREATE POLICY synthetic_profile_update ON public.profiles FOR UPDATE TO authenticated USING (id=auth.uid() OR public.synthetic_user_role()='owner') WITH CHECK (id=auth.uid() OR public.synthetic_user_role()='owner');`)
const oldGuard = readFileSync(new URL('../supabase/migrations/20261003094000_profit_loss_editor_permission.sql', import.meta.url),'utf8').split('CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()')[1].split('-- Explicitly approved')[0]
await db.exec('CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()'+oldGuard)
await db.exec('CREATE TRIGGER profiles_protect_access_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();')
const editorMigration = readFileSync(new URL('../supabase/migrations/20261010043000_other_profit_loss_editor_permission.sql', import.meta.url),'utf8')
const profilesBeforeEditor = (await db.query('SELECT * FROM public.profiles ORDER BY id')).rows
await db.exec(editorMigration.replace(/COMMIT;\s*$/, 'ROLLBACK;'))
check((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='profiles' AND column_name='can_edit_other_profit_loss'")).rows[0].n===0,'editor rollback leaves no column')
await db.exec(editorMigration)
const profilesAfterEditor = (await db.query('SELECT * FROM public.profiles ORDER BY id')).rows
check(JSON.stringify(profilesAfterEditor.map(({can_edit_other_profit_loss,...row})=>row))===JSON.stringify(profilesBeforeEditor),'all prior profile fields preserved')
check(profilesAfterEditor.filter(row=>row.can_edit_other_profit_loss).length===1,'only exact target granted')
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['a4495656-bce4-41f6-9263-52269985afcf'])
await db.exec('SET ROLE authenticated')
check((await db.query('SELECT public.can_edit_other_profit_loss() AS allowed')).rows[0].allowed,'approved partner editor guard passes')
check((await db.query("UPDATE public.profiles SET can_edit_other_profit_loss=true WHERE id='00000000-0000-0000-0000-000000000002' RETURNING id")).rows.length===0,'editor cannot grant another user')
await db.exec("INSERT INTO public.other_profit_loss_entries(entry_date,kind,description,amount) VALUES ('2026-01-01','income','Editor income',10),('2026-01-31','expense','Editor batch',5),('2026-02-28','expense','Editor batch',5)")
check((await db.query("UPDATE public.other_profit_loss_entries SET amount=11 WHERE description='Editor income' RETURNING id")).rows.length===1,'editor updates income')
check((await db.query("UPDATE public.other_profit_loss_entries SET amount=6 WHERE description='Editor batch' AND entry_date='2026-02-28' RETURNING id")).rows.length===1,'editor updates one batch month')
const editorExpense=(await db.query("SELECT id FROM public.other_profit_loss_entries WHERE description='Editor batch' LIMIT 1")).rows[0].id
check((await db.query(`SELECT public.set_other_expense_no_invoice('${editorExpense}',true) AS flag`)).rows[0].flag,'editor invoice RPC works')
await rejects("INSERT INTO public.other_profit_loss_entries(entry_date,kind,description,amount) VALUES ('2026-01-01','expense','Invalid editor batch',1),('2026-02-01','expense','Invalid editor batch',0)",'editor invalid batch atomic')
check((await db.query("SELECT count(*)::int AS n FROM public.other_profit_loss_entries WHERE description='Invalid editor batch'")).rows[0].n===0,'invalid editor batch leaves zero rows')
check((await db.query("DELETE FROM public.other_profit_loss_entries WHERE description IN ('Editor income','Editor batch') RETURNING id")).rows.length===3,'editor deletes both kinds')
for (const patch of ["can_edit_other_profit_loss=false","can_edit_profit_loss=true","role='owner'","approved=false","allowed_pages=ARRAY['/accounts']","email='other@example.test'"]) await rejects(`UPDATE public.profiles SET ${patch} WHERE id=auth.uid()`, `editor self-access change denied: ${patch}`)
await identity(2)
await rejects('UPDATE public.profiles SET can_edit_other_profit_loss=true WHERE id=auth.uid()','viewer cannot self-grant editor')
check((await db.query('SELECT public.can_edit_other_profit_loss() AS allowed')).rows[0].allowed===false,'viewer remains financially read only')
await rejects("INSERT INTO public.other_profit_loss_entries(entry_date,kind,description,amount) VALUES ('2026-01-01','income','Viewer after grant',1)",'viewer insert still denied')
check((await db.query('UPDATE public.other_profit_loss_entries SET amount=999 RETURNING id')).rows.length===0,'viewer update still denied')
check((await db.query('DELETE FROM public.other_profit_loss_entries RETURNING id')).rows.length===0,'viewer delete still denied')
await db.exec('RESET ROLE')
for (const patch of ["approved=false", "allowed_pages=ARRAY['/profit-loss']", "allowed_pages=NULL", "can_edit_other_profit_loss=false"]) {
  await db.exec('BEGIN')
  await db.exec(`UPDATE public.profiles SET ${patch} WHERE id='a4495656-bce4-41f6-9263-52269985afcf'`)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['a4495656-bce4-41f6-9263-52269985afcf'])
  await db.exec('SET LOCAL ROLE authenticated')
  check((await db.query('SELECT public.can_edit_other_profit_loss() AS allowed')).rows[0].allowed===false,`editor fail closed: ${patch}`)
  await rejects("INSERT INTO public.other_profit_loss_entries(entry_date,kind,description,amount) VALUES ('2026-01-01','income','Denied editor',1)",`denied editor insert: ${patch}`)
  await db.exec('ROLLBACK; RESET ROLE')
}
await identity(1)
check((await db.query('SELECT public.can_edit_other_profit_loss() AS allowed')).rows[0].allowed,'owner retains editor rights without flag')
check((await db.query("UPDATE public.profiles SET can_edit_other_profit_loss=true WHERE id='00000000-0000-0000-0000-000000000002' RETURNING id")).rows.length===1,'owner can grant explicit editor permission')
await db.exec("UPDATE public.profiles SET can_edit_other_profit_loss=false WHERE id='00000000-0000-0000-0000-000000000002'")
await db.exec('RESET ROLE; SET ROLE anon')
await rejects('SELECT public.can_edit_other_profit_loss()','anon editor helper denied after replacement')
await db.exec('RESET ROLE')
console.log(`PASS: ${checks} synthetic PostgreSQL migration, constraint, CRUD and RLS checks`)
await db.close()
