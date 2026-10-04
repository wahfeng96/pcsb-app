import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261004082000_profit_loss_account_status_only.sql'), 'utf8')

describe('P&L Accounting-status eligibility', () => {
  it('requires the individual monthly Accounting status to be settled', () => {
    expect(migration).toContain('paid.month = to_char')
    expect(migration).toContain("paid.status = 'completed'")
    expect(migration).toContain('share.month = to_char')
    expect(migration).toContain("share.status IN ('waiting_profit_share', 'settled')")
  })

  it('does not use booking settlement or invoice number as eligibility', () => {
    const expectedCte = migration.slice(migration.indexOf('WITH expected AS ('), migration.indexOf('), booking_settlement AS ('))
    expect(expectedCte).not.toContain("b.payment_status = 'settled'")
    expect(expectedCte).not.toContain('invoice_number')
  })

  it('keeps completed payment rows and existing assignments intact', () => {
    expect(migration).toContain("WHERE mp.status = 'completed' AND b.status <> 'cancelled'")
    expect(migration).toContain('LEFT JOIN public.profit_loss_revenue_assignments a')
    expect(migration).not.toMatch(/DELETE FROM public\.(monthly_payments|profit_loss_revenue_assignments|bookings|profit_sharing)/i)
    expect(migration).not.toMatch(/UPDATE public\.(monthly_payments|profit_loss_revenue_assignments|bookings|profit_sharing)/i)
  })
})
