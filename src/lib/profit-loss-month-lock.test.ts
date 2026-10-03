import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261003043000_profit_loss_month_locks.sql'), 'utf8')

describe('P&L reporting-month locks', () => {
  it('protects revenue, costs, and allocations in the database', () => {
    expect(migration).toContain('profit_loss_revenue_month_lock')
    expect(migration).toContain('profit_loss_cost_month_lock')
    expect(migration).toContain('profit_loss_allocation_month_lock')
    expect(migration).toContain('P&L month is locked. Unlock it before making changes.')
  })

  it('checks both source and destination months', () => {
    expect(migration).toContain('old_month IS NOT NULL')
    expect(migration).toContain('new_month IS NOT NULL')
  })

  it('rejects payment completion clearly when the current P&L month is locked', () => {
    expect(migration).toContain("NEW.status = 'completed'")
    expect(migration).toContain('public.is_profit_loss_month_locked(current_reporting_month)')
    expect(migration).toContain('Current P&L month is locked. Unlock it before completing the payment.')
  })

  it('prevents completed revenue disappearing from a locked assigned month', () => {
    expect(migration).toContain('monthly_payments_locked_revenue_status')
    expect(migration).toContain("OLD.status = 'completed'")
    expect(migration).toContain('Unlock that month before changing its status.')
  })

  it('prevents payment and booking details changing a closed report indirectly', () => {
    expect(migration).toContain('UPDATE OF status, invoice_number, month OR DELETE')
    expect(migration).toContain('bookings_locked_revenue_details')
    expect(migration).toContain('UPDATE OF monthly_rate, status, client_id, billboard_id, brand_name OR DELETE')
    expect(migration).toContain('Unlock every affected month before changing P&L-visible booking details.')
  })

  it('prevents booking edits or deletion from changing locked revenue', () => {
    expect(migration).toContain('bookings_locked_profit_loss_revenue')
    expect(migration).toContain('UPDATE OF monthly_rate, status, client_id, billboard_id, brand_name OR DELETE')
    expect(migration).toContain('Unlock that month before changing P&L-visible booking details or deleting the booking.')
  })

  it('stores only a one-way digest of the unlock code', () => {
    expect(migration).toContain("extensions.digest(COALESCE(p_unlock_code, ''), 'sha256')")
    expect(migration).not.toMatch(/p_unlock_code\s*=\s*'[^']+'/)
  })
})
