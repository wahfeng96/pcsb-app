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
await identity(2)
check((await db.query('SELECT count(*)::int AS n FROM public.other_profit_loss_entries')).rows[0].n === 2, 'approved explicit viewer reads')
await rejects("INSERT INTO public.other_profit_loss_entries (entry_date,kind,description,amount) VALUES ('2026-10-09','income','viewer write',1)", 'viewer cannot insert')
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
await identity(1)
check((await db.query("DELETE FROM public.other_profit_loss_entries WHERE kind='expense' RETURNING id")).rows.length === 1, 'owner deletes')
await db.exec('RESET ROLE')
check(JSON.stringify((await db.query('SELECT * FROM public.profiles ORDER BY id')).rows) === JSON.stringify(before.rows), 'profiles remain unchanged after synthetic operations')
console.log(`PASS: ${checks} synthetic PostgreSQL migration, constraint, CRUD and RLS checks`)
await db.close()
