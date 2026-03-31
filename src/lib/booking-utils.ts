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
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T23:59:59')
  if (today < start) return 'upcoming'
  if (today > end) return 'completed'
  return 'live'
}
