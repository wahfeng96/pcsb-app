import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003063000_profit_loss_move_to_unknown.sql'), 'utf8')

describe('P&L move-to-Unknown migration', () => {
  it('adds an owner-only RPC without changing existing assignments during migration', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.unassign_profit_loss_revenue')
    expect(migration).toContain('IF NOT public.is_profit_loss_owner()')
    expect(migration).not.toMatch(/DELETE FROM public\.profit_loss_revenue_assignments\s*;/)
    expect(migration).not.toMatch(/UPDATE public\.profit_loss_revenue_assignments/i)
  })

  it('only unassigns completed revenue and preserves the payment row', () => {
    expect(migration).toContain("selected_payment.status <> 'completed'")
    expect(migration).toContain('DELETE FROM public.profit_loss_revenue_assignments')
    expect(migration).not.toMatch(/DELETE FROM public\.monthly_payments/i)
    expect(migration).not.toMatch(/UPDATE public\.monthly_payments/i)
  })

  it('serializes moves and leaves month-lock enforcement to the assignment trigger', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('FOR UPDATE')
    expect(migration).toContain("RAISE EXCEPTION 'Revenue is already Unknown'")
  })
})
