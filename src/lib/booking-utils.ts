import { startOfMonth, addMonths } from 'date-fns'

/**
 * Get the revenue months for a booking.
 * Uses total_amount / monthly_rate to determine actual month count (respects manual override).
 * Returns N months starting from the booking start date.
 */
export function getRevenueMonths(startDate: Date, monthlyRate: number, totalAmount: number): Date[] {
  if (!monthlyRate || monthlyRate <= 0) return []
  const numMonths = Math.round(totalAmount / monthlyRate) || 1
  const months: Date[] = []
  let current = startOfMonth(startDate)
  for (let i = 0; i < numMonths; i++) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}
