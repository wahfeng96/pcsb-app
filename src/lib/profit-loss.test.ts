import { describe, expect, it } from 'vitest'
import { allocationsMatchTotal, calculateProfitLoss, canAccessProfitLoss, costsForPeriod, monthStart, mytMonthKey, profitLossYears, revenueForPeriod, searchRevenueForYear, UNKNOWN_REVENUE_MONTH, type PaidRevenue, type ProfitLossCost } from './profit-loss'

const revenue = (overrides: Partial<PaidRevenue> = {}): PaidRevenue => ({
  revenue_id: 'payment:payment-1', payment_id: 'payment-1', source: 'payment', booking_id: 'booking-1', billing_month: '2026-08', reporting_month: '2026-10',
  has_persisted_assignment: true, invoice_number: '@1400', client_id: 'client-1', client_name: 'Client',
  brand_name: 'Brand', billboard_id: 'billboard-a', billboard_name: 'Screen A', billboard_location: 'KK', amount: 1000,
  ...overrides,
})
const cost = (overrides: Partial<ProfitLossCost> = {}): ProfitLossCost => ({
  id: 'cost-1', cost_date: '2026-10-02', category_id: 'category-1', category_name: 'Power',
  description: 'Electricity', supplier_payee: 'SESB', amount: 600, remarks: null, reporting_months: ['2026-10'],
  allocations: [
    { id: 'allocation-a', billboard_id: 'billboard-a', billboard_name: 'Screen A', amount: 400 },
    { id: 'allocation-general', billboard_id: null, billboard_name: 'General / Company Overhead', amount: 200 },
  ], ...overrides,
})

describe('P&L calculations and filters', () => {
  it('includes only supplied paid rows and combines year, month and billboard filters', () => {
    const rows = [revenue(), revenue({ revenue_id: 'payment:payment-2', payment_id: 'payment-2', reporting_month: '2026-11', billboard_id: 'billboard-b', amount: 2500 }), revenue({ revenue_id: 'payment:payment-3', payment_id: 'payment-3', reporting_month: '2025-10', amount: 9000 })]
    expect(revenueForPeriod(rows, 2026, '10', 'all').map(item => item.payment_id)).toEqual(['payment-1'])
    expect(revenueForPeriod(rows, 2026, 'all', 'billboard-b').map(item => item.payment_id)).toEqual(['payment-2'])
    expect(calculateProfitLoss(revenueForPeriod(rows, 2026, '10', 'all'), []).revenue).toBe(1000)
  })
  it('keeps Unknown out of month/year totals and filters it by billing year', () => {
    const rows = [
      revenue(),
      revenue({ revenue_id: 'unknown:booking-2:2026-07', payment_id: null, source: 'settled_booking', booking_id: 'booking-2', billing_month: '2026-07', reporting_month: UNKNOWN_REVENUE_MONTH, amount: 2000 }),
      revenue({ revenue_id: 'unknown:booking-3:2025-12', payment_id: null, source: 'settled_booking', booking_id: 'booking-3', billing_month: '2025-12', reporting_month: UNKNOWN_REVENUE_MONTH, amount: 3000 }),
    ]
    expect(revenueForPeriod(rows, 2026, 'all', 'all').map(item => item.revenue_id)).toEqual(['payment:payment-1'])
    expect(revenueForPeriod(rows, 2026, UNKNOWN_REVENUE_MONTH, 'all').map(item => item.revenue_id)).toEqual(['unknown:booking-2:2026-07'])
    expect(profitLossYears(rows, [cost({ cost_date: '2024-01-02', reporting_months: ['2024-01'] })], 2026)).toEqual([2026, 2025, 2024])
  })
  it('searches assigned and Unknown revenue across the selected year and billboard', () => {
    const rows = [
      revenue(),
      revenue({ revenue_id: 'unknown:booking-2:2026-07', payment_id: null, source: 'settled_booking', booking_id: 'booking-2', billing_month: '2026-07', reporting_month: UNKNOWN_REVENUE_MONTH, client_name: 'Don Legacy', brand_name: 'Legacy Gold', billboard_id: 'billboard-b', billboard_name: 'Sandakan', billboard_location: 'Bandar Indah', amount: 2000 }),
      revenue({ revenue_id: 'unknown:booking-3:2025-12', payment_id: null, source: 'settled_booking', booking_id: 'booking-3', billing_month: '2025-12', reporting_month: UNKNOWN_REVENUE_MONTH, client_name: 'Old Client', amount: 3000 }),
    ]
    expect(searchRevenueForYear(rows, 2026, 'all', 'don legacy', 'all').map(item => item.revenue_id)).toEqual(['unknown:booking-2:2026-07'])
    expect(searchRevenueForYear(rows, 2026, 'billboard-b', 'bandar indah', 'billboard')).toHaveLength(1)
    expect(searchRevenueForYear(rows, 2026, 'billboard-a', 'legacy gold', 'brand')).toEqual([])
    expect(searchRevenueForYear(rows, 2026, 'all', '2000', 'all')).toHaveLength(1)
    expect(searchRevenueForYear(rows, 2026, 'all', 'old client', 'client')).toEqual([])
  })
  it('counts all costs once company-wide and only direct allocation in billboard view', () => {
    const rows = [cost()]
    expect(costsForPeriod(rows, 2026, '10', 'all')[0].reporting_amount).toBe(600)
    expect(costsForPeriod(rows, 2026, '10', 'billboard-a')[0].reporting_amount).toBe(400)
    expect(costsForPeriod(rows, 2026, '10', 'billboard-b')).toEqual([])
    expect(calculateProfitLoss([revenue()], costsForPeriod(rows, 2026, '10', 'all'))).toEqual({ revenue: 1000, cost: 600, net: 400, margin: 40 })
  })
  it('splits one cost evenly across selected reporting months without inflating the annual total', () => {
    const rows = [cost({ reporting_months: ['2026-01', '2026-02', '2026-03'] })]
    expect(costsForPeriod(rows, 2026, '01', 'all')[0].reporting_amount).toBe(200)
    expect(costsForPeriod(rows, 2026, '02', 'billboard-a')[0].reporting_amount).toBeCloseTo(400 / 3)
    expect(costsForPeriod(rows, 2026, '04', 'all')).toEqual([])
    expect(costsForPeriod(rows, 2026, 'all', 'all')[0].reporting_amount).toBe(600)
    expect(costsForPeriod(rows, 2026, 'all', 'billboard-a')[0].reporting_amount).toBe(400)
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
