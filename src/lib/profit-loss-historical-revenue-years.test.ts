import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003213000_profit_loss_historical_revenue_years.sql'), 'utf8')

describe('P&L historical revenue-year migration', () => {
  it('derives the override scope from Sales Summary rules and enforces the approved totals', () => {
    expect(migration).toContain("date_trunc('month', b.start_date) + (n.i * interval '1 month')")
    expect(migration).toContain('round(b.total_amount / NULLIF(b.monthly_rate, 0))')
    expect(migration).toContain("b.payment_status = 'settled'")
    expect(migration).toContain("b.status <> 'cancelled'")
    expect(migration).toContain('y2024_count <> 113 OR y2024_total <> 724448')
    expect(migration).toContain('y2025_count <> 171 OR y2025_total <> 1145637')
  })

  it('uses a validated durable identity with readable RLS and no user write policy', () => {
    expect(migration).toContain('PRIMARY KEY (booking_id, billing_month)')
    expect(migration).toContain('unknown_year IN (2024, 2025)')
    expect(migration).toContain('unknown_year = extract(year FROM billing_month)::integer')
    expect(migration).toContain('ALTER TABLE public.profit_loss_revenue_year_overrides ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE ALL ON public.profit_loss_revenue_year_overrides FROM anon, authenticated')
    expect(migration).toContain('GRANT SELECT ON public.profit_loss_revenue_year_overrides TO authenticated')
    expect(migration).toContain('FOR SELECT')
    expect(migration).not.toMatch(/CREATE POLICY[\s\S]*?revenue year overrides[^;]+FOR (ALL|INSERT|UPDATE|DELETE)/i)
  })

  it('archives matching assignments before a backup-gated delete and leaves all other assignments alone', () => {
    const archiveAt = migration.indexOf('INSERT INTO public.profit_loss_revenue_assignment_archive')
    const deleteAt = migration.indexOf('DELETE FROM public.profit_loss_revenue_assignments')
    expect(archiveAt).toBeGreaterThan(0)
    expect(deleteAt).toBeGreaterThan(archiveAt)
    expect(migration.slice(deleteAt)).toContain('FROM public.profit_loss_revenue_assignment_archive')
    expect(migration.slice(deleteAt)).toContain('o.booking_id = mp.booking_id')
    expect(migration.slice(deleteAt)).toContain("o.billing_month = (mp.month || '-01')::date")
    expect(migration).not.toMatch(/DELETE FROM public\.(monthly_payments|bookings|clients|profit_sharing)/i)
  })

  it('gives explicit assignments precedence, then overrides, then settlement year', () => {
    expect(migration).toContain("CASE WHEN m.reporting_month IS NULL THEN COALESCE(o.unknown_year, extract(year FROM m.settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::integer)")
    expect(migration).toContain("COALESCE(to_char(m.reporting_month, 'YYYY-MM'), 'unknown')")
    expect(migration).toContain("COALESCE(o.unknown_year, extract(year FROM m.settled_at AT TIME ZONE 'Asia/Kuala_Lumpur')::integer)")
  })

  it('retains caps, deduplication, locks, access checks, and existing mutation RPCs', () => {
    expect(migration).toContain('DISTINCT ON (mp.booking_id, mp.month)')
    expect(migration).toContain('JOIN booking_limits bl')
    expect(migration).toContain('public.profit_loss_month_locks')
    expect(migration).toContain('public.can_access_profit_loss()')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.assign_profit_loss_revenue')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.unassign_profit_loss_revenue')
  })
})
