'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CAMPAIGN_MAX, BOOKING_NUMBER_MAX, type BookingMetadata } from '@/lib/booking-metadata'

export function BookingMetadataFields({ value, onChange }: { value: BookingMetadata; onChange: (patch: { campaign_name?: string; booking_number?: string }) => void }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div><Label htmlFor="booking-campaign">Campaign name (optional)</Label><Input id="booking-campaign" value={value.campaign_name || ''} maxLength={CAMPAIGN_MAX} onChange={e => onChange({ campaign_name: e.target.value })} /></div>
    <div><Label htmlFor="booking-number">OD / booking number (optional)</Label><Input id="booking-number" value={value.booking_number || ''} maxLength={BOOKING_NUMBER_MAX} onChange={e => onChange({ booking_number: e.target.value })} /></div>
  </div>
}

export function BookingMetadataFilters({ brands, campaigns, brand, campaign, onBrandChange, onCampaignChange }: { brands: string[]; campaigns: string[]; brand: string; campaign: string; onBrandChange: (value: string) => void; onCampaignChange: (value: string) => void }) {
  return <div className="space-y-2">
    <div><Label htmlFor="booking-brand-filter">Brand</Label><select id="booking-brand-filter" className="w-full min-w-0 border rounded-md px-3 py-2 text-sm" value={brand} onChange={e => onBrandChange(e.target.value)}><option value="">All brands</option>{brands.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
    <div><Label htmlFor="booking-campaign-filter">Campaign</Label><select id="booking-campaign-filter" className="w-full min-w-0 border rounded-md px-3 py-2 text-sm" value={campaign} onChange={e => onCampaignChange(e.target.value)}><option value="">All campaigns</option>{campaigns.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
  </div>
}

export function BookingMetadataDetails({ booking }: { booking: BookingMetadata }) {
  return <div className="text-xs text-gray-700 break-words [overflow-wrap:anywhere]">
    {booking.campaign_name && <p>Campaign: {booking.campaign_name}</p>}
    {booking.booking_number && <p>OD / booking number: {booking.booking_number}</p>}
  </div>
}
