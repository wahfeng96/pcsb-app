import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003070000_profit_loss_deduplicate_legacy_billing.sql'), 'utf8')

describe('P&L legacy billing-month deduplication', () => {
  it('subtracts materialized completed payments after preserving exact billing matches', () => {
    expect(migration).toContain('materialized_counts AS')
    expect(migration).toContain('exact_counts AS')
    expect(migration).toContain('missing_candidates AS')
    expect(migration).toContain('mc.materialized_count, 0) - COALESCE(ec.exact_count, 0)')
  })

  it('prevents stale Unknown rows from materializing extra completed payments', () => {
    expect(migration).toContain('materialized_payment_count >= expected_month_count')
    expect(migration).toContain("RAISE EXCEPTION 'All revenue months for this booking are already assigned'")
    expect(migration).toContain("COALESCE(to_char(m.reporting_month, 'YYYY-MM'), 'unknown')")
  })

  it('does not delete existing business rows', () => {
    expect(migration).not.toMatch(/DELETE FROM public\.(bookings|monthly_payments|profit_loss_revenue_assignments)/i)
  })
})
