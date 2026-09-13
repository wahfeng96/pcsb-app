import { format, parseISO } from 'date-fns'
import { getRevenueMonths } from './booking-utils'

export type BillingBooking = { id: string; start_date: string; monthly_rate: number; total_amount: number; status?: string }
export type AccountPayment = { id: string; booking_id: string; month: string; amount: number; status: 'pending_invoice' | 'invoice_sent' | 'completed'; invoice_number?: string }
export type AccountProfit = { booking_id?: string; month: string; status: string }

// Reuse Sales Summary inference verbatim; campaign end dates are occupancy only.
export function accountMonths(b: BillingBooking): Date[] {
  return getRevenueMonths(parseISO(b.start_date), b.monthly_rate, b.total_amount)
}
export function billingUncertainty(b: BillingBooking): string | null {
  if (!(b.monthly_rate > 0)) return 'Billing month count unknown — zero/non-positive rate; no billing months inferred.'
  const ratio = b.total_amount / b.monthly_rate
  if (!(ratio > 0) || Math.abs(ratio - Math.round(ratio)) > 0.000001) return 'Billing month count needs confirmation — using existing Sales Summary rounding/fallback.'
  return null
}
export function isBillableMonth(b: BillingBooking, month: string): boolean {
  return accountMonths(b).some(m => format(m, 'yyyy-MM') === month)
}
export function effectivePaymentStatus(id: string, month: string, payments: AccountPayment[], profits: AccountProfit[]): AccountPayment['status'] {
  const pr = profits.find(p => p.booking_id === id && p.month === month)
  if (pr?.status === 'waiting_profit_share' || pr?.status === 'settled') return 'completed'
  return payments.find(p => p.booking_id === id && p.month === month)?.status || 'pending_invoice'
}
export function billableTotals(bookings: BillingBooking[], payments: AccountPayment[], profits: AccountProfit[]) {
  let total = 0, completed = 0
  bookings.filter(b => b.status !== 'cancelled').forEach(b => accountMonths(b).forEach(m => {
    const amount = b.monthly_rate || 0
    total += amount
    if (effectivePaymentStatus(b.id, format(m, 'yyyy-MM'), payments, profits) === 'completed') completed += amount
  }))
  return { total, completed, outstanding: total - completed }
}
// Iterate saved records, not generated months: preserves duplicates, before-start and invoice-less entries.
export function extraPayments<B extends BillingBooking>(bookings: B[], payments: AccountPayment[]) {
  return payments.flatMap(payment => {
    const booking = bookings.find(b => b.id === payment.booking_id)
    return booking && !isBillableMonth(booking, payment.month) ? [{ booking, payment }] : []
  })
}
export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return `"${(/^[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`
}
