import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003053000_profit_loss_unknown_revenue.sql'), 'utf8')

describe('P&L Unknown revenue migration', () => {
  it('derives settled, non-cancelled booking months with stable UI IDs', () => {
    expect(migration).toContain("b.payment_status = 'settled'")
    expect(migration).toContain("b.status <> 'cancelled'")
    expect(migration).toContain("'unknown:' || m.booking_id::text || ':' || m.billing_month")
    expect(migration).toContain('round(b.total_amount / NULLIF(b.monthly_rate, 0))')
    expect(migration).toContain('generate_series(')
    expect(migration).toContain("date_trunc('month', b.start_date) + (n.i * interval '1 month')")
  })
  it('removes auto-assignment and atomically reuses or creates a payment', () => {
    expect(migration).toContain('DROP TRIGGER IF EXISTS monthly_payments_assign_paid_revenue_month')
    expect(migration).toContain("UPDATE public.monthly_payments SET status = 'completed'")
    expect(migration).toContain('INSERT INTO public.monthly_payments (booking_id, month, amount, status)')
    expect(migration).toContain('INSERT INTO public.profit_loss_revenue_assignments')
  })
  it('enforces owner access and an unlocked target without invoice fabrication', () => {
    expect(migration).toContain('IF NOT public.is_profit_loss_owner()')
    expect(migration).toContain('IF public.is_profit_loss_month_locked(p_reporting_month)')
    expect(migration).toContain("RAISE EXCEPTION 'P&L month is locked. Unlock it before assigning revenue.'")
    expect(migration).not.toMatch(/INSERT INTO public\.monthly_payments \([^)]*invoice_number/i)
  })
  it('guards partial rows and prevents assignment double counting', () => {
    expect(migration).toContain("ORDER BY (mp.status = 'completed') DESC")
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("UPDATE public.monthly_payments SET status = 'completed'")
    expect(migration).not.toMatch(/UPDATE public\.monthly_payments SET[^;]*invoice_number/is)
    expect(migration).toContain('DISTINCT ON (mp.booking_id, mp.month)')
    expect(migration).toContain('RETURN assigned_payment_id')
  })
})
