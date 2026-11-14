import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const agency = '00000000-0000-0000-0000-000000000001'
const owner = '00000000-0000-0000-0000-000000000002'
const team = '00000000-0000-0000-0000-000000000003'
type AgencyData = { bookings: Array<Record<string, unknown> & { end_date: string }>; content_changes: unknown[] }
let db: PGlite
let month: string

async function asUser(id: string, sql: string) {
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${id}', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true);`)
  try { return await db.query<Record<string, unknown>>(sql) } finally { await db.exec('ROLLBACK') }
}

describe('Agency migration against real local PostgreSQL (PGlite)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      CREATE TABLE profiles (id uuid PRIMARY KEY, email text, name text, role text CONSTRAINT profiles_role_check CHECK (role IN ('owner','team','partner')), approved boolean, allowed_pages text[], can_edit_profit_loss boolean DEFAULT false, can_edit_other_profit_loss boolean DEFAULT false);
      CREATE TABLE billboards (id uuid PRIMARY KEY, name text, location text, max_slots integer, costing numeric);
      CREATE TABLE clients (id uuid PRIMARY KEY, company_name text, phone text, email text, notes text);
      CREATE TABLE bookings (id uuid PRIMARY KEY, client_id uuid REFERENCES clients, billboard_id uuid REFERENCES billboards, start_date date, end_date date, brand_name text, campaign_name text, status text, spot_size numeric, monthly_rate numeric, booking_number text, notes text);
      CREATE TABLE content_changes (id uuid PRIMARY KEY, billboard_id uuid, brand_name text, change_date date, notes text);
      CREATE TABLE profit_loss_month_locks (reporting_month date);
      CREATE TABLE commissions (id uuid, amount numeric);
      CREATE TABLE monthly_payments (id uuid);
      CREATE TABLE user_billboard_access (user_id uuid, billboard_id uuid, can_edit boolean);
      CREATE VIEW legacy_finance_view AS SELECT * FROM commissions;
      DO $$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
        EXECUTE format('CREATE POLICY legacy_open ON %I FOR ALL TO public USING (true) WITH CHECK (true)', t.tablename);
      END LOOP; END $$;
      CREATE TABLE legacy_unprotected (id integer);
      INSERT INTO legacy_unprotected VALUES (1);
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
      INSERT INTO profiles VALUES ('${owner}', 'owner@example.test', 'Owner', 'owner', true, NULL, false, false), ('${team}', 'team@example.test', 'Team', 'team', true, ARRAY['/profit-loss','/other-profit-loss'], true, true);
    `)
    await db.exec(readFileSync('supabase/migrations/20261108131000_agency_calendar_access.sql', 'utf8'))
    // Load the actual latest deployed-source RPC bodies as well as the new
    // helper definitions: test that definer entry points stop before touching data.
    const rpcBodies = new Map<string, string>()
    for (const file of readdirSync('supabase/migrations').sort().filter(file => file.endsWith('.sql') && !file.startsWith('20261108'))) {
      const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
      for (const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\([\s\S]*?\$\$[\s\S]*?\$\$;/g)) {
        if (match[0].includes('SECURITY DEFINER') && match[0].includes('LANGUAGE plpgsql') && !match[0].includes('RETURNS trigger')) rpcBodies.set(match[1], match[0])
      }
    }
    for (const body of rpcBodies.values()) await db.exec(body)
    await db.exec(readFileSync('src/lib/__fixtures__/agency-live-legacy-profit-loss.sql', 'utf8'))
    await db.exec('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated')
    await db.exec(`
      INSERT INTO profiles VALUES ('${agency}', 'agency@example.test', 'Agency', 'agency', true, ARRAY['/profit-loss','/users'], true, true);
      INSERT INTO billboards VALUES ('10000000-0000-0000-0000-000000000001','Screen','Tawau',10,999);
      INSERT INTO clients VALUES ('20000000-0000-0000-0000-000000000001','Public brand fallback','PRIVATE PHONE','PRIVATE EMAIL','PRIVATE NOTES');
      INSERT INTO bookings SELECT '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', (date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur') - interval '2 month')::date, (date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur') + interval '2 month')::date, '', 'Campaign', 'live', 0.5, 12345, 'PRIVATE BOOKING', 'PRIVATE NOTES';
      INSERT INTO bookings SELECT '30000000-0000-0000-0000-000000000002', client_id, billboard_id, start_date, start_date + 1, 'HISTORICAL SECRET', NULL, 'completed', 1, 100, 'OLD REF', NULL FROM bookings;
      INSERT INTO bookings SELECT '30000000-0000-0000-0000-000000000003', client_id, billboard_id, start_date, end_date, 'CANCELLED SECRET', NULL, 'cancelled', 1, 100, NULL, NULL FROM bookings LIMIT 1;
      INSERT INTO content_changes SELECT '40000000-0000-0000-0000-000000000001', billboard_id, 'New video', date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, 'PRIVATE CONTENT NOTE' FROM bookings LIMIT 1;
      INSERT INTO content_changes SELECT '40000000-0000-0000-0000-000000000002', billboard_id, 'HISTORICAL CONTENT', start_date, 'PRIVATE CONTENT NOTE' FROM bookings LIMIT 1;
      INSERT INTO commissions VALUES ('50000000-0000-0000-0000-000000000001',1000);
      INSERT INTO user_billboard_access VALUES ('${agency}','10000000-0000-0000-0000-000000000001',true);
      INSERT INTO profit_loss_month_locks SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    `)
    month = (await db.query<{ month: string }>(`SELECT to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM') AS month`)).rows[0].month
  }, 30000)
  afterAll(async () => { await db?.close() })

  it('blocks raw reads, nested join data, views, writes and stale billboard assignments', async () => {
    for (const table of ['bookings', 'clients', 'billboards', 'content_changes', 'commissions', 'user_billboard_access', 'profit_loss_month_locks', 'legacy_finance_view', 'legacy_unprotected']) {
      expect((await asUser(agency, `SELECT * FROM ${table}`)).rows).toEqual([])
    }
    expect((await asUser(agency, `SELECT * FROM bookings JOIN clients ON bookings.client_id = clients.id`)).rows).toEqual([])
    await expect(asUser(agency, `INSERT INTO commissions VALUES (gen_random_uuid(),1)`)).rejects.toThrow(/row-level security/)
    await expect(asUser(agency, 'TRUNCATE commissions')).rejects.toThrow(/permission denied/)
    expect((await asUser(agency, `UPDATE commissions SET amount=0 RETURNING *`)).rows).toEqual([])
    expect((await asUser(agency, `DELETE FROM bookings RETURNING *`)).rows).toEqual([])
  })
  it('shows only the own profile and prevents escalation, permission changes and deleting it', async () => {
    const rows = (await asUser(agency, 'SELECT * FROM profiles')).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: agency, role: 'agency', allowed_pages: ['/calendar'], can_edit_profit_loss: false, can_edit_other_profit_loss: false })
    for (const change of ["role='owner'", 'approved=true', "allowed_pages=ARRAY['/users']", 'can_edit_profit_loss=true', "name='Changed'"]) {
      expect((await asUser(agency, `UPDATE profiles SET ${change} WHERE id='${agency}' RETURNING *`)).rows).toEqual([])
    }
    expect((await asUser(agency, `DELETE FROM profiles WHERE id='${agency}' RETURNING *`)).rows).toEqual([])
    await expect(asUser(agency, `INSERT INTO profiles (id, role, approved) VALUES (gen_random_uuid(), 'owner', true)`)).rejects.toThrow(/Only the owner|row-level security/)
    await expect(asUser(team, `UPDATE profiles SET role='owner' WHERE id='${team}'`)).rejects.toThrow(/Only the owner/)
    expect((await asUser(team, `UPDATE profiles SET role='owner' WHERE id='${agency}' RETURNING *`)).rows).toEqual([])
  })
  it('serves just the selected month with clipped overlap dates, correct event flags and no private fields', async () => {
    const data = (await asUser(agency, `SELECT get_agency_calendar('${month}-01') AS data`)).rows[0].data as AgencyData
    expect(data.bookings).toHaveLength(1)
    expect(data.bookings[0]).toMatchObject({ brand_name: 'Public brand fallback', start_date: `${month}-01`, start_event: false, end_event: false, spot_size: 0.5 })
    expect(data.bookings[0].end_date.slice(0, 7)).toBe(month)
    expect(data.content_changes).toHaveLength(1)
    expect(Object.keys(data.bookings[0]).sort()).toEqual(['id','billboard_id','brand_name','campaign_name','start_date','end_date','start_event','end_event','status','spot_size','billboard'].sort())
    const serialized = JSON.stringify(data)
    for (const secret of ['PRIVATE', '12345', 'monthly_rate', 'costing', 'booking_number', 'client_id', 'HISTORICAL', 'CANCELLED']) expect(serialized).not.toContain(secret)
  })
  it('rejects historical and invalid RPC requests, unapproved users and all other roles', async () => {
    for (const expression of ["date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - interval '1 month'", `'${month}-02'::date`, 'NULL::date', "'infinity'::date"]) {
      await expect(asUser(agency, `SELECT get_agency_calendar((${expression})::date)`)).rejects.toThrow(/Only current and future/)
    }
    for (const id of [owner, team]) await expect(asUser(id, `SELECT get_agency_calendar('${month}-01')`)).rejects.toThrow(/Approved Agency/)
    await db.exec(`UPDATE profiles SET approved=false WHERE id='${agency}'`)
    await expect(asUser(agency, `SELECT get_agency_calendar('${month}-01')`)).rejects.toThrow(/Approved Agency/)
    await db.exec(`UPDATE profiles SET approved=true WHERE id='${agency}'`)
  })
  it('denies financial definer helpers despite legacy grants while keeping owner/team access', async () => {
    for (const helper of ['can_access_profit_loss()', 'is_profit_loss_owner()', 'can_access_other_profit_loss()', 'can_edit_other_profit_loss()', `is_profit_loss_month_locked('${month}-01')`]) {
      expect((await asUser(agency, `SELECT ${helper} AS allowed`)).rows[0].allowed).toBe(false)
      expect((await asUser(owner, `SELECT ${helper} AS allowed`)).rows[0].allowed).toBe(true)
      expect((await asUser(team, `SELECT ${helper} AS allowed`)).rows[0].allowed).toBe(true)
    }
    expect((await db.query<{ locked: boolean }>(`SELECT is_profit_loss_month_locked('${month}-01') AS locked`)).rows[0].locked).toBe(true)
    expect((await asUser(owner, 'SELECT * FROM commissions')).rows).toHaveLength(1)
    expect((await asUser(team, 'SELECT * FROM commissions')).rows).toHaveLength(1)
    expect((await asUser(team, 'SELECT * FROM legacy_unprotected')).rows).toHaveLength(1)
  })
  it('supports future months, uses Malaysia time independently of session timezone and denies anonymous RPC execution', async () => {
    await db.exec("SET TIME ZONE 'America/Los_Angeles'")
    const future = (await asUser(agency, "SELECT get_agency_calendar((date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur') + interval '1 month')::date) AS data")).rows[0].data as AgencyData
    expect(future.bookings).toHaveLength(1)
    expect(future.bookings[0].start_event).toBe(false)
    expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon', 'public.get_agency_calendar(date)', 'EXECUTE') AS allowed")).rows[0].allowed).toBe(false)
    await db.exec('BEGIN; SET LOCAL ROLE anon')
    try {
      expect((await db.query('SELECT * FROM commissions')).rows).toEqual([])
      expect((await db.query('SELECT * FROM profiles')).rows).toEqual([])
      await expect(db.query(`SELECT get_agency_calendar('${month}-01')`)).rejects.toThrow(/permission denied/)
    } finally { await db.exec("ROLLBACK; SET TIME ZONE 'UTC'") }
  })
  it('rejects all existing financial SECURITY DEFINER RPC entry points', async () => {
    const calls = [
      'get_profit_loss_data()', 'get_profit_loss_data_before_cost_months()',
      "unlock_accounts_payment(NULL, '2026-08', NULL, '2468')",
      'set_profit_loss_revenue_month(NULL, current_date)',
      "save_profit_loss_category(NULL, 'Injected', true)",
      "save_profit_loss_cost(NULL, current_date, NULL, 'Injected', NULL, 1, NULL, '[]'::jsonb, ARRAY[current_date])",
      'delete_profit_loss_cost(NULL)', 'lock_profit_loss_month(current_date)',
      "unlock_profit_loss_month(current_date, 'spoof')",
      "assign_profit_loss_revenue(NULL, '2026-11', current_date)",
      'unassign_profit_loss_revenue(NULL)', 'set_other_expense_no_invoice(NULL, true)',
    ]
    for (const call of calls) await expect(asUser(agency, `SELECT ${call}`)).rejects.toThrow(/access|owner|permission/i)
  })
  it('denies legacy finance RPC and helpers even with stale Agency page/editor fields', async () => {
    // Bypass only the fixture normalization trigger to model a legacy role
    // conversion/import with retained grants. Production callers cannot do this.
    await db.exec(`ALTER TABLE profiles DISABLE TRIGGER profiles_protect_access_fields;
      UPDATE profiles SET allowed_pages=ARRAY['/profit-loss','/other-profit-loss'], can_edit_profit_loss=true, can_edit_other_profit_loss=true WHERE id='${agency}';
      ALTER TABLE profiles ENABLE TRIGGER profiles_protect_access_fields;`)
    try {
      for (const helper of ['can_access_profit_loss()', 'is_profit_loss_owner()', 'can_access_other_profit_loss()', 'can_edit_other_profit_loss()']) {
        expect((await asUser(agency, `SELECT ${helper} AS allowed`)).rows[0].allowed).toBe(false)
      }
      await expect(asUser(agency, 'SELECT get_profit_loss_data_before_cost_months()')).rejects.toThrow(/P&L access denied/)
      await expect(asUser(agency, 'SELECT get_profit_loss_data()')).rejects.toThrow(/P&L access denied/)
      await expect(asUser(agency, "SELECT save_profit_loss_category(NULL, 'Injected', true)")).rejects.toThrow(/Only the owner/)
      await expect(asUser(agency, 'SELECT set_other_expense_no_invoice(NULL, true)')).rejects.toThrow(/access required/)
    } finally {
      await db.exec(`UPDATE profiles SET allowed_pages=ARRAY['/calendar'] WHERE id='${agency}'`)
    }
  })
  it('allows owner assignment and normalizes agency permissions atomically', async () => {
    expect((await asUser(owner, `UPDATE profiles SET role='agency', allowed_pages=ARRAY['/users'], can_edit_profit_loss=true WHERE id='${team}' RETURNING role, allowed_pages, can_edit_profit_loss`)).rows[0]).toMatchObject({ role: 'agency', allowed_pages: ['/calendar'], can_edit_profit_loss: false })
  })
})
