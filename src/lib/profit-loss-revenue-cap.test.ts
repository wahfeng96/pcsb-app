import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003071000_profit_loss_cap_materialized_revenue.sql'), 'utf8')

describe('P&L materialized revenue cap', () => {
  it('caps completed payment rows to the booking revenue count', () => {
    expect(migration).toContain('booking_limits AS')
    expect(migration).toContain('materialized_ranked AS')
    expect(migration).toContain('mr.revenue_rank <= bl.expected_count')
  })

  it('prioritizes owner placement and exact expected billing months', () => {
    expect(migration).toContain('(mr.reporting_month IS NOT NULL) DESC')
    expect(migration).toContain('e.billing_month = mr.billing_month')
    expect(migration).toContain('mr.assignment_updated_at DESC NULLS LAST')
  })

  it('preserves source payment, invoice and assignment rows', () => {
    expect(migration).not.toMatch(/DELETE FROM public\.(monthly_payments|profit_loss_revenue_assignments|bookings)/i)
  })
})
