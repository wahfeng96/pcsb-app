import { calendarCampaignSuffix } from './calendar-booking-label'

export interface OccupancyBooking {
  id: string
  billboard_id: string
  start_date: string
  end_date: string
  status: string
  spot_size?: number | null
  campaign_name?: string | null
  brand_name?: string | null
  client?: { company_name?: string | null } | null
}

export interface OccupancyOccupant {
  id: string
  name: string
  spotSize: number
}

export function getOccupantsForDate<T extends OccupancyBooking>(
  bookings: readonly T[],
  billboardId: string,
  dateString: string,
): OccupancyOccupant[] {
  return bookings
    .filter(booking =>
      booking.billboard_id === billboardId &&
      booking.status !== 'cancelled' &&
      booking.start_date <= dateString &&
      booking.end_date >= dateString
    )
    .map(booking => ({
      id: booking.id,
      name: (booking.brand_name?.trim() || booking.client?.company_name?.trim() || 'Unnamed booking') + calendarCampaignSuffix(booking.campaign_name),
      spotSize: booking.spot_size || 1,
    }))
}

export function getOccupiedSlots(occupants: readonly OccupancyOccupant[]): number {
  return occupants.reduce((sum, occupant) => sum + occupant.spotSize, 0)
}

export function formatSlotAmount(amount: number): string {
  const display = Number.isInteger(amount) ? amount.toString() : amount.toFixed(1)
  return `${display} slot${amount === 1 ? '' : 's'}`
}
