import type { Booking } from '@/types/database'

type FilterableBooking = Pick<Booking, 'sales_person' | 'billboard_id'>

// Use only records already returned by the authenticated, RLS-scoped query.
// Names are the legacy identity: preserve exact spelling, case and whitespace.
export function salespersonKey(name: string | null): string {
  return name?.trim() ? `person:${name}` : 'unassigned'
}

export function salespersonOptions(bookings: readonly FilterableBooking[]) {
  const names = [...new Set(bookings.map(b => b.sales_person).filter((name): name is string => !!name?.trim()))]
  return names.sort((a, b) => a.localeCompare(b)).map(name => ({ value: salespersonKey(name), label: name }))
}

export function filterSalesBookings<T extends FilterableBooking>(bookings: readonly T[], billboard: string, salesperson: string): T[] {
  return bookings.filter(b => (billboard === 'all' || b.billboard_id === billboard) &&
    (salesperson === 'all' || salespersonKey(b.sales_person) === salesperson))
}
