import { describe, expect, it } from 'vitest'
import { formatSlotAmount, getOccupiedSlots, getOccupantsForDate, type OccupancyBooking } from './calendar-occupancy'

const bookings: OccupancyBooking[] = [
  { id: 'a', billboard_id: 'screen-1', start_date: '2026-09-10', end_date: '2026-09-12', status: 'live', spot_size: 1, brand_name: 'Alpha', client: null },
  { id: 'b', billboard_id: 'screen-1', start_date: '2026-09-12', end_date: '2026-09-15', status: 'upcoming', spot_size: 0.5, brand_name: 'Beta', client: null },
  { id: 'c', billboard_id: 'screen-1', start_date: '2026-09-01', end_date: '2026-09-30', status: 'cancelled', spot_size: 1, brand_name: 'Cancelled', client: null },
  { id: 'd', billboard_id: 'screen-2', start_date: '2026-09-12', end_date: '2026-09-12', status: 'live', spot_size: 1, brand_name: 'Other screen', client: null },
  { id: 'e', billboard_id: 'screen-1', start_date: '2026-09-20', end_date: '2026-09-20', status: 'upcoming', spot_size: null, brand_name: null, client: { company_name: 'Client fallback' } },
]

describe('calendar occupancy occupants', () => {
  it('uses inclusive date overlap and returns multiple active brands with slot amounts', () => {
    const occupants = getOccupantsForDate(bookings, 'screen-1', '2026-09-12')
    expect(occupants).toEqual([
      { id: 'a', name: 'Alpha', spotSize: 1 },
      { id: 'b', name: 'Beta', spotSize: 0.5 },
    ])
    expect(getOccupiedSlots(occupants)).toBe(1.5)
  })

  it('excludes cancelled, non-overlapping, and other-screen bookings', () => {
    expect(getOccupantsForDate(bookings, 'screen-1', '2026-09-16')).toEqual([])
  })

  it('falls back to the client name and the existing one-slot default', () => {
    expect(getOccupantsForDate(bookings, 'screen-1', '2026-09-20')).toEqual([
      { id: 'e', name: 'Client fallback', spotSize: 1 },
    ])
  })

  it('formats whole, half, singular, and plural slot amounts', () => {
    expect(formatSlotAmount(0.5)).toBe('0.5 slots')
    expect(formatSlotAmount(1)).toBe('1 slot')
    expect(formatSlotAmount(2)).toBe('2 slots')
  })
})
