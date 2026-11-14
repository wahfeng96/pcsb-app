import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const owner='00000000-0000-0000-0000-000000000001'
const team='00000000-0000-0000-0000-000000000002'
const booking='10000000-0000-0000-0000-000000000001'
const payment='20000000-0000-0000-0000-000000000001'
const migration=readFileSync('supabase/migrations/20261114063000_accounts_pin_unlock.sql','utf8')
let db: PGlite
// A synthetic test PIN replaces the production verifier only inside this isolated database.
const correctPin='2468'
async function asUser(id: string, sql: string, args: unknown[]=[]) {
  await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',true)`)
  try { const result=await db.query(sql,args); await db.exec('COMMIT'); return result }
  catch(error) { await db.exec('ROLLBACK'); throw error }
}
async function unlock(pin: string, id=owner, target: string|null=payment) {
  return (await asUser(id, 'SELECT unlock_accounts_payment($1,$2,$3,$4) AS result',[booking,'2026-08',target,pin])).rows[0] as {result:{ok:boolean;error?:string}}
}

describe('Accounts database PIN reopening',()=>{
  beforeAll(async()=>{
    db=new PGlite({extensions:{pgcrypto}})
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text,approved boolean);
      CREATE TABLE bookings(id uuid PRIMARY KEY,status text,monthly_rate numeric);
      CREATE TABLE monthly_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid,month text,amount numeric,status text,invoice_number text,settled_at timestamptz);
      CREATE TABLE profit_sharing(id uuid DEFAULT gen_random_uuid(),booking_id uuid,month text,status text);
      CREATE TABLE commissions(id uuid DEFAULT gen_random_uuid(),booking_id uuid,month text,status text);
      CREATE TABLE profit_loss_revenue_assignments(monthly_payment_id uuid,reporting_month date);
      CREATE TABLE profit_loss_month_locks(reporting_month date);
      CREATE FUNCTION is_profit_loss_month_locked(m date) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM profit_loss_month_locks WHERE reporting_month=m) $$;
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      INSERT INTO profiles VALUES('${owner}','owner',true),('${team}','team',true);
      INSERT INTO bookings VALUES('${booking}','completed',4600);
      INSERT INTO monthly_payments VALUES('${payment}','${booking}','2026-08',4600,'completed','@test',now());
      INSERT INTO profit_sharing(booking_id,month,status) VALUES('${booking}','2026-08','waiting_profit_share');
      INSERT INTO commissions(booking_id,month,status) VALUES('${booking}','2026-08','waiting_to_be_paid');`)
    // Rehearse the existing locked P&L trigger together with the proposed migration.
    const existing=readFileSync('supabase/migrations/20261003043000_profit_loss_month_locks.sql','utf8')
    const body=existing.match(/CREATE OR REPLACE FUNCTION public.enforce_locked_paid_revenue_status\(\)[\s\S]*?\$\$;/)![0]
    await db.exec(body)
    await db.exec(`CREATE TRIGGER monthly_payments_locked_revenue_status BEFORE UPDATE OF status,invoice_number,month OR DELETE ON monthly_payments FOR EACH ROW EXECUTE FUNCTION enforce_locked_paid_revenue_status()`)
    await db.exec(migration)
    await db.query("UPDATE accounts_private.unlock_config SET pin_hash=extensions.crypt($1,extensions.gen_salt('bf',4))",[correctPin])
  },30000)
  afterAll(async()=>{await db?.close()})
  it('denies unauthorized callers and hides verifier, attempts, capabilities and audit',async()=>{
    await expect(unlock(correctPin,team)).rejects.toThrow(/Only the owner/)
    for(const table of ['unlock_config','unlock_attempts','unlock_capabilities','unlock_audit']) await expect(asUser(owner,`SELECT * FROM accounts_private.${table}`)).rejects.toThrow(/permission denied/)
    await db.exec('BEGIN; SET LOCAL ROLE anon')
    try { await expect(db.query(`SELECT unlock_accounts_payment(NULL,NULL,NULL,NULL)`)).rejects.toThrow(/permission denied/) } finally {await db.exec('ROLLBACK')}
  })
  it('persists wrong-PIN attempts and blocks the sixth attempt including a correct PIN',async()=>{
    for(let n=0;n<5;n++) expect((await unlock('9999')).result).toMatchObject({ok:false,error:'Incorrect PIN.'})
    expect((await unlock(correctPin)).result.error).toMatch(/Too many attempts/)
    expect((await db.query('SELECT status FROM monthly_payments')).rows[0]).toEqual({status:'completed'})
    await db.exec(`UPDATE accounts_private.unlock_attempts SET window_started=now()-interval '16 minutes'`)
  })
  it('blocks direct updates, deletion, forged reopening metadata and caller-set transaction flags',async()=>{
    for(const sql of [`UPDATE monthly_payments SET status='invoice_sent'`,`DELETE FROM monthly_payments`,`UPDATE monthly_payments SET accounts_reopened_at=now()`]) await expect(asUser(owner,sql)).rejects.toThrow(/PIN/)
    await expect(asUser(owner,`WITH flag AS (SELECT set_config('app.accounts_unlock','true',true)) UPDATE monthly_payments SET status='invoice_sent' FROM flag`)).rejects.toThrow(/PIN/)
    await expect(asUser(owner,`INSERT INTO monthly_payments(booking_id,month,amount,status,accounts_reopened_at) VALUES('${booking}','2026-09',4600,'invoice_sent',now())`)).rejects.toThrow(/PIN/)
  })
  it('retains locked P&L protection even with the correct PIN',async()=>{
    await db.exec(`INSERT INTO profit_loss_revenue_assignments VALUES('${payment}','2026-09-01'); INSERT INTO profit_loss_month_locks VALUES('2026-09-01')`)
    await expect(unlock(correctPin)).rejects.toThrow(/locked P&L month/)
    await db.exec('DELETE FROM profit_loss_month_locks')
  })
  it('atomically reopens only the selected payment, preserving related financial states and assignment',async()=>{
    const before=(await db.query('SELECT * FROM profit_sharing;')).rows
    expect((await unlock(correctPin)).result.ok).toBe(true)
    expect((await db.query('SELECT status,settled_at,accounts_reopened_at IS NOT NULL AS reopened FROM monthly_payments')).rows[0]).toMatchObject({status:'invoice_sent',settled_at:null,reopened:true})
    expect((await db.query('SELECT * FROM profit_sharing')).rows).toEqual(before)
    expect((await db.query('SELECT status FROM commissions')).rows[0]).toEqual({status:'waiting_to_be_paid'})
    expect((await db.query('SELECT * FROM profit_loss_revenue_assignments')).rows).toHaveLength(1)
    expect((await db.query('SELECT * FROM accounts_private.unlock_capabilities')).rows).toHaveLength(0)
    expect((await db.query('SELECT * FROM accounts_private.unlock_audit')).rows).toHaveLength(1)
    expect((await unlock(correctPin)).result).toMatchObject({ok:false})
  })
  it('resets the explicit override on completion and requires PIN for a later reopening',async()=>{
    await asUser(owner,`UPDATE monthly_payments SET status='completed'`)
    expect((await db.query('SELECT accounts_reopened_at FROM monthly_payments')).rows[0]).toEqual({accounts_reopened_at:null})
    await expect(asUser(owner,`UPDATE monthly_payments SET status='invoice_sent'`)).rejects.toThrow(/PIN/)
    expect((await unlock(correctPin,owner,null)).result.error).toMatch(/Entry changed/)
    expect((await unlock(correctPin)).result.ok).toBe(true)
  })
  it('materializes a legacy Profit Sharing-only completed entry through the same guarded RPC',async()=>{
    await db.exec(`DELETE FROM profit_loss_revenue_assignments; DELETE FROM monthly_payments`)
    expect((await unlock(correctPin,owner,null)).result.ok).toBe(true)
    expect((await db.query('SELECT status,accounts_reopened_at IS NOT NULL AS reopened FROM monthly_payments')).rows[0]).toMatchObject({status:'invoice_sent',reopened:true})
  })
})
