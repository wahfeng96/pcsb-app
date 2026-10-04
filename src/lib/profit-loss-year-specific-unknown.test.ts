import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003110000_profit_loss_year_specific_unknown.sql'), 'utf8')

describe('P&L year-specific Unknown migration', () => {
  it('captures future completion time without rewriting accounting source rows', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS settled_at timestamptz')
    expect(migration).toContain("NEW.status = 'completed'")
    expect(migration).toContain('NEW.settled_at := COALESCE(NEW.settled_at, now())')
    expect(migration).not.toMatch(/UPDATE public\.monthly_payments\s+SET settled_at/i)
  })

  it('uses MYT settlement year and preserves the Unknown sentinel independently', () => {
    expect(migration).toContain("AT TIME ZONE 'Asia/Kuala_Lumpur'")
    expect(migration).toContain("'unknown_year', r.unknown_year")
    expect(migration).toContain("COALESCE(to_char(m.reporting_month, 'YYYY-MM'), 'unknown')")
  })

  it('does not recreate calendar-month auto-assignment or rewrite explicit assignments', () => {
    expect(migration).toContain('DROP TRIGGER IF EXISTS monthly_payments_assign_paid_revenue_month')
    expect(migration).not.toMatch(/UPDATE public\.profit_loss_revenue_assignments/i)
    expect(migration).not.toMatch(/DELETE FROM public\.profit_loss_revenue_assignments/i)
  })

  it('retains access checks, editor mutation guards, caps, and lock-aware assignment RPCs', () => {
    expect(migration).toContain('public.can_access_profit_loss()')
    expect(migration).toContain('JOIN booking_limits bl')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.assign_profit_loss_revenue')
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.is_profit_loss_owner')
  })
})
