import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const booking = '10000000-0000-0000-0000-000000000001'
const payment = '20000000-0000-0000-0000-000000000001'
let db: PGlite
const sql = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8')

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${booking}'::uuid $$;
    CREATE FUNCTION public.is_profit_loss_owner() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.editor', true), '') = 'yes' $$;
    CREATE TABLE bookings(id uuid PRIMARY KEY, monthly_rate numeric, total_amount numeric, start_date date, payment_status text, status text, billboard_id uuid, sales_person text);
    CREATE TABLE monthly_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid REFERENCES bookings ON DELETE CASCADE, month text, amount numeric, status text);
    CREATE TABLE profit_sharing(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid REFERENCES bookings ON DELETE CASCADE, month text, amount numeric, billboard_id uuid, sales_person text, status text CHECK(status IN ('settled','waiting_profit_share','pending_payment')));
    CREATE TABLE commissions(id uuid PRIMARY KEY, status text);
    CREATE TABLE profit_loss_revenue_assignments(monthly_payment_id uuid PRIMARY KEY REFERENCES monthly_payments ON DELETE CASCADE, reporting_month date, assigned_by uuid);
    CREATE TABLE profit_loss_month_locks(reporting_month date PRIMARY KEY);
    CREATE FUNCTION is_profit_loss_month_locked(m date) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT FROM profit_loss_month_locks WHERE reporting_month = m) $$;
    CREATE FUNCTION check_assignment_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP <> 'INSERT' AND is_profit_loss_month_locked(OLD.reporting_month) THEN RAISE EXCEPTION 'locked'; END IF;
      IF TG_OP <> 'DELETE' AND is_profit_loss_month_locked(NEW.reporting_month) THEN RAISE EXCEPTION 'locked'; END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END $$;
    CREATE TRIGGER assignment_lock BEFORE INSERT OR UPDATE OR DELETE ON profit_loss_revenue_assignments FOR EACH ROW EXECUTE FUNCTION check_assignment_lock();
    ALTER TABLE profit_loss_revenue_assignments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY editor ON profit_loss_revenue_assignments TO authenticated USING(is_profit_loss_owner()) WITH CHECK(is_profit_loss_owner());
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT ALL ON profit_loss_revenue_assignments TO authenticated;
    INSERT INTO bookings VALUES('${booking}',3000,3000,'2026-06-06','settled','active',gen_random_uuid(),'Wah Feng');
    INSERT INTO monthly_payments VALUES('${payment}','${booking}','2026-06',3000,'completed');
    INSERT INTO commissions VALUES(gen_random_uuid(),'waiting_to_be_paid');
    SELECT set_config('test.editor','yes',false);
  `)
  const assign = sql('20261003071000_profit_loss_cap_materialized_revenue').match(/CREATE OR REPLACE FUNCTION public.assign_profit_loss_revenue[\s\S]*?\$\$;/)![0]
  await db.exec(assign)
  await db.exec(sql('20261003063000_profit_loss_move_to_unknown'))
  // Supabase default grants must not expose the trigger helper.
  await db.exec('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated')
  await db.exec(sql('20261113131500_profit_loss_profit_sharing_sync'))
})
afterEach(async () => { await db?.close() })

async function assign(month = '2026-10-01') {
  await db.query(`SELECT assign_profit_loss_revenue($1,'2026-06',$2)`, [booking, month])
}
async function shares() { return (await db.query<{ month: string; amount: string; status: string }>('SELECT month,amount,status FROM profit_sharing ORDER BY month')).rows }

describe('P&L / Profit Sharing atomic database synchronization', () => {
  it('creates the original billing month as Settled, not the reporting month; preserves other ledgers', async () => {
    await assign()
    expect(await shares()).toEqual([{ month: '2026-06', amount: '3000', status: 'settled' }])
    expect((await db.query('SELECT status FROM monthly_payments')).rows).toEqual([{ status: 'completed' }])
    expect((await db.query('SELECT status FROM commissions')).rows).toEqual([{ status: 'waiting_to_be_paid' }])
  })
  it('moves to Unknown as Waiting Profit Share and can reassign without duplicates', async () => {
    await assign()
    await db.query('SELECT unassign_profit_loss_revenue($1)', [payment])
    expect(await shares()).toEqual([{ month: '2026-06', amount: '3000', status: 'waiting_profit_share' }])
    await assign('2026-11-01')
    await assign('2026-12-01')
    expect(await shares()).toEqual([{ month: '2026-06', amount: '3000', status: 'settled' }])
  })
  it('updates existing statuses and leaves unrelated booking months alone', async () => {
    await db.exec(`INSERT INTO profit_sharing(booking_id,month,amount,status) VALUES('${booking}','2026-06',3000,'pending_payment'),('${booking}','2026-07',3000,'pending_payment')`)
    await assign()
    expect((await shares()).map(r => r.status)).toEqual(['settled','pending_payment'])
  })
  it('rolls back assignment changes if a Profit Sharing write fails', async () => {
    await assign()
    await db.exec(`CREATE FUNCTION reject_share() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'share failure'; END $$; CREATE TRIGGER reject_share BEFORE UPDATE ON profit_sharing FOR EACH ROW EXECUTE FUNCTION reject_share()`)
    await expect(db.query('SELECT unassign_profit_loss_revenue($1)', [payment])).rejects.toThrow('share failure')
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM profit_loss_revenue_assignments')).rows[0].n).toBe(1)
    expect((await shares())[0].status).toBe('settled')
  })
  it('honors locked source and destination months without status changes', async () => {
    await assign()
    await db.exec("INSERT INTO profit_loss_month_locks VALUES('2026-10-01'),('2026-11-01')")
    await expect(assign('2026-11-01')).rejects.toThrow(/locked/)
    await expect(db.query('SELECT unassign_profit_loss_revenue($1)', [payment])).rejects.toThrow(/locked/)
    expect((await shares())[0].status).toBe('settled')
  })
  it('rejects unauthorized RPCs and direct assignment writes and protects the helper', async () => {
    await db.exec("SELECT set_config('test.editor','no',false); SET ROLE authenticated")
    await expect(assign()).rejects.toThrow(/owner/)
    await expect(db.query(`INSERT INTO profit_loss_revenue_assignments VALUES($1,'2026-10-01',null)`, [payment])).rejects.toThrow(/row-level security/)
    await db.exec('RESET ROLE')
    expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon','sync_profit_loss_profit_sharing()','EXECUTE') AS allowed")).rows[0].allowed).toBe(false)
    expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','sync_profit_loss_profit_sharing()','EXECUTE') AS allowed")).rows[0].allowed).toBe(false)
    expect(await shares()).toEqual([])
  })
  it('retains Settled while another payment for the same billing month is assigned', async () => {
    await assign()
    await db.exec(`INSERT INTO monthly_payments VALUES('20000000-0000-0000-0000-000000000002','${booking}','2026-06',3000,'completed'); INSERT INTO profit_loss_revenue_assignments VALUES('20000000-0000-0000-0000-000000000002','2026-11-01',null)`)
    await db.query('SELECT unassign_profit_loss_revenue($1)', [payment])
    expect((await shares())[0].status).toBe('settled')
  })
  it('does not recreate rows when an assigned payment is cascade-deleted', async () => {
    await assign()
    await db.exec('DELETE FROM profit_sharing; DELETE FROM monthly_payments')
    expect(await shares()).toEqual([])
  })
})
