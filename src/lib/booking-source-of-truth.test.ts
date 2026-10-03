import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003033000_booking_source_of_truth.sql'), 'utf8')

describe('booking source-of-truth migration', () => {
  it('repairs an @1379-shaped completed payment amount without overwriting workflow fields', () => {
    expect(migration).toContain('SET amount = booking.monthly_rate')
    expect(migration).not.toMatch(/SET[\s\S]{0,160}(invoice_number|status|month)\s*=/)
  })

  it('enforces booking amounts on future payment, profit-sharing and commission writes', () => {
    expect(migration).toContain("IF TG_TABLE_NAME = 'monthly_payments'")
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'profit_sharing'")
    expect(migration).toContain("ELSIF TG_TABLE_NAME = 'commissions'")
    expect(migration).toContain('NEW.amount := booking_row.monthly_rate')
    expect(migration).toContain('NEW.amount := booking_row.monthly_rate * booking_row.commission_percent / 100')
  })

  it('makes P&L read booking revenue rather than the copied payment amount', () => {
    expect(migration).toContain("'amount', b.monthly_rate")
    expect(migration).not.toContain("'amount', mp.amount")
  })
})
