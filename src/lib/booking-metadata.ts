export type BookingMetadata = { brand_name?: string | null; campaign_name?: string | null; booking_number?: string | null }
export const CAMPAIGN_MAX = 200
export const BOOKING_NUMBER_MAX = 100

function optionalText(value: unknown, max: number, label: string): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const text = value.trim()
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`)
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} must not contain control characters`)
  return text || null
}

export function bookingMetadata(value: BookingMetadata) {
  return {
    campaign_name: optionalText(value.campaign_name, CAMPAIGN_MAX, 'Campaign name'),
    booking_number: optionalText(value.booking_number, BOOKING_NUMBER_MAX, 'OD / booking number'),
  }
}

// Input must be the current user's RLS-scoped booking result, never a global lookup.
export function metadataOptions(rows: BookingMetadata[], field: 'brand_name' | 'campaign_name', brand = '') {
  return [...new Set(rows.filter(row => !brand || row.brand_name === brand).map(row => row[field]).filter((v): v is string => Boolean(v?.trim())))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export function matchesMetadata(row: BookingMetadata, brand: string, campaign: string, search = '') {
  return (!brand || row.brand_name === brand) && (!campaign || row.campaign_name === campaign) &&
    (!search.trim() || Boolean(row.brand_name?.toLowerCase().includes(search.trim().toLowerCase())))
}
