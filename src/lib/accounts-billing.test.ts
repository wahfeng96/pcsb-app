import { describe, expect, it } from 'vitest'
import { accountMonths, billingUncertainty, billableTotals, extraPayments, effectivePaymentStatus, csvCell, type AccountPayment } from './accounts-billing'
import { format } from 'date-fns'
const booking = (total = 2000, start = '2026-04-21', rate = 2000) => ({ id: 'b', start_date: start, end_date: '2026-05-15', monthly_rate: rate, total_amount: total, payment_status: 'settled' })
const keys = (b: ReturnType<typeof booking>) => accountMonths(b).map(m => format(m, 'yyyy-MM'))
describe('Accounts billable allocation', () => {
  it('full rate for user N1/N2 examples regardless of end date', () => {
    expect(keys(booking())).toEqual(['2026-04'])
    expect(keys(booking(4000))).toEqual(['2026-04', '2026-05'])
    expect(billableTotals([booking(4000)], [], [])).toEqual({ total: 4000, completed: 0, outstanding: 4000 })
  })
  it('Maxis April-May and June-July and two months spanning three calendar months', () => {
    expect(keys(booking(10174.5, '2026-04-29', 10174.5))).toEqual(['2026-04'])
    expect(keys(booking(10174, '2026-06-22', 10174))).toEqual(['2026-06'])
    expect(keys(booking(12920, '2026-03-07', 6460))).toEqual(['2026-03', '2026-04'])
    expect(keys(booking(4000, '2026-12-31'))).toEqual(['2026-12', '2027-01'])
  })
  it('preserves all saved extras, invoices/status/amount, before-start and duplicates without double counting', () => {
    const payments: AccountPayment[] = [
      { id: 'valid', booking_id: 'b', month: '2026-04', amount: 1998, status: 'invoice_sent', invoice_number: '@1351' },
      { id: 'extra', booking_id: 'b', month: '2026-05', amount: 2000, status: 'invoice_sent', invoice_number: '@1371' },
      { id: 'before', booking_id: 'b', month: '2025-12', amount: 6315, status: 'completed' },
      { id: 'duplicate', booking_id: 'b', month: '2026-05', amount: 2000, status: 'completed', invoice_number: '@1371' },
    ]
    const original = JSON.stringify(payments)
    expect(extraPayments([booking()], payments).map(r => r.payment.id)).toEqual(['extra', 'before', 'duplicate'])
    expect(billableTotals([booking()], payments, [])).toEqual({ total: 2000, completed: 0, outstanding: 2000 })
    const profits = [{ booking_id: 'b', month: '2026-04', status: 'waiting_profit_share' }]
    expect(effectivePaymentStatus('b', '2026-04', payments, profits)).toBe('completed')
    expect(billableTotals([booking()], payments, profits)).toEqual({ total: 2000, completed: 2000, outstanding: 0 })
    expect(JSON.stringify(payments)).toBe(original)
  })
  it('zero-rate has no invented N and existing rounding/fallback is explicitly uncertain', () => {
    expect(keys(booking(0, '2026-04-21', 0))).toEqual([])
    expect(billingUncertainty(booking(0, '2026-04-21', 0))).toContain('unknown')
    expect(keys(booking(0))).toEqual(['2026-04'])
    expect(billingUncertainty(booking(3000))).toContain('rounding/fallback')
    expect(billingUncertainty(booking())).toBeNull()
    expect(billableTotals([{ ...booking(), status: 'cancelled' }], [], []).total).toBe(0)
  })
  it('CSV quotes commas and protects formula references', () => {
    expect(csvCell('@1345,1346')).toBe('"\'@1345,1346"')
    expect(csvCell('A "brand"')).toBe('"A ""brand"""')
  })
})
