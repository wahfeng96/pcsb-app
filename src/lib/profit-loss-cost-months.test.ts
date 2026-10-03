import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003072000_profit_loss_cost_reporting_months.sql'), 'utf8')

describe('P&L cost reporting months', () => {
  it('backfills existing costs into their original month', () => {
    expect(migration).toContain("SET reporting_months = ARRAY[date_trunc('month', cost_date)::date]")
    expect(migration).toContain('ALTER COLUMN reporting_months SET NOT NULL')
  })

  it('validates one to twelve unique month-start dates in the cost year', () => {
    expect(migration).toContain('cardinality(p_months) < 1')
    expect(migration).toContain('cardinality(p_months) > 12')
    expect(migration).toContain("month_value <> date_trunc('month', month_value)::date")
    expect(migration).toContain('extract(year FROM month_value) <> extract(year FROM p_cost_date)')
  })

  it('protects every allocated month with the existing P&L month locks', () => {
    expect(migration).toContain('OLD.reporting_months')
    expect(migration).toContain('NEW.reporting_months')
    expect(migration).toContain('public.is_profit_loss_month_locked(month_value)')
  })

  it('keeps the previous save RPC compatible during deployment', () => {
    expect(migration).toContain("ARRAY[date_trunc('month', p_cost_date)::date]")
    expect(migration).toContain('p_reporting_months date[]')
  })
})
