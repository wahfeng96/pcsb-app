import { describe, expect, it } from 'vitest'
import { allocationsMatchTotal, calculateProfitLoss, canAccessProfitLoss, costsForPeriod, monthStart, mytMonthKey, revenueForPeriod, type PaidRevenue, type ProfitLossCost } from './profit-loss'

const revenue = (overrides: Partial<PaidRevenue> = {}): PaidRevenue => ({
  payment_id: 'payment-1', booking_id: 'booking-1', billing_month: '2026-08', reporting_month: '2026-10',
  has_persisted_assignment: true, invoice_number: '@1400', client_id: 'client-1', client_name: 'Client',
  brand_name: 'Brand', billboard_id: 'billboard-a', billboard_name: 'Screen A', billboard_location: 'KK', amount: 1000,
  ...overrides,
})
const cost = (overrides: Partial<ProfitLossCost> = {}): ProfitLossCost => ({
  id: 'cost-1', cost_date: '2026-10-02', category_id: 'category-1', category_name: 'Power',
  description: 'Electricity', supplier_payee: 'SESB', amount: 600, remarks: null,
  allocations: [
    { id: 'allocation-a', billboard_id: 'billboard-a', billboard_name: 'Screen A', amount: 400 },
    { id: 'allocation-general', billboard_id: null, billboard_name: 'General / Company Overhead', amount: 200 },
  ], ...overrides,
})

describe('P&L calculations and filters', () => {
  it('includes only supplied paid rows and combines year, month and billboard filters', () => {
    const rows = [revenue(), revenue({ payment_id: 'payment-2', reporting_month: '2026-11', billboard_id: 'billboard-b', amount: 2500 }), revenue({ payment_id: 'payment-3', reporting_month: '2025-10', amount: 9000 })]
    expect(revenueForPeriod(rows, 2026, '10', 'all').map(item => item.payment_id)).toEqual(['payment-1'])
    expect(revenueForPeriod(rows, 2026, 'all', 'billboard-b').map(item => item.payment_id)).toEqual(['payment-2'])
    expect(calculateProfitLoss(revenueForPeriod(rows, 2026, '10', 'all'), []).revenue).toBe(1000)
  })
  it('counts all costs once company-wide and only direct allocation in billboard view', () => {
    const rows = [cost()]
    expect(costsForPeriod(rows, 2026, '10', 'all')[0].reporting_amount).toBe(600)
    expect(costsForPeriod(rows, 2026, '10', 'billboard-a')[0].reporting_amount).toBe(400)
    expect(costsForPeriod(rows, 2026, '10', 'billboard-b')).toEqual([])
    expect(calculateProfitLoss([revenue()], costsForPeriod(rows, 2026, '10', 'all'))).toEqual({ revenue: 1000, cost: 600, net: 400, margin: 40 })
  })
  it('validates exact split totals and avoids misleading zero-revenue margins', () => {
    expect(allocationsMatchTotal(100, [{ amount: 60 }, { amount: 40 }])).toBe(true)
    expect(allocationsMatchTotal(100, [{ amount: 60 }, { amount: 39.99 }])).toBe(false)
    expect(calculateProfitLoss([], [{ reporting_amount: 25 }])).toEqual({ revenue: 0, cost: 25, net: -25, margin: null })
  })
})

describe('P&L month and permission rules', () => {
  it('uses Asia/Kuala_Lumpur rather than the host date', () => {
    expect(mytMonthKey(new Date('2026-09-30T16:30:00.000Z'))).toBe('2026-10')
    expect(monthStart('2026-10')).toBe('2026-10-01')
    expect(() => monthStart('2026-13')).toThrow('Invalid month')
  })
  it('is owner-only by default and requires an explicit grant for approved users', () => {
    expect(canAccessProfitLoss('owner', true, null)).toBe(true)
    expect(canAccessProfitLoss('team', true, null)).toBe(false)
    expect(canAccessProfitLoss('team', true, ['/dashboard', '/profit-loss'])).toBe(true)
    expect(canAccessProfitLoss('team', false, ['/profit-loss'])).toBe(false)
    expect(canAccessProfitLoss('partner', true, ['/accounts'])).toBe(false)
  })
})
