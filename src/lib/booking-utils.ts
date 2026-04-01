import { startOfMonth, addMonths } from 'date-fns'
import type { BookingStatus } from '@/types/database'

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

/**
 * Auto-compute booking status based on dates.
 * - cancelled stays cancelled (manual override)
 * - today < start → upcoming
 * - start <= today <= end → live
 * - today > end → completed
 */
export function computeBookingStatus(startDate: string, endDate: string, currentStatus?: BookingStatus): BookingStatus {
  if (currentStatus === 'cancelled') return 'cancelled'
  // Use MYT (UTC+8) for date comparison since business is in Malaysia
  const now = new Date()
  const myt = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000)
  const todayStr = myt.toISOString().split('T')[0]
  if (todayStr < startDate) return 'upcoming'
  if (todayStr > endDate) return 'completed'
  return 'live'
}
