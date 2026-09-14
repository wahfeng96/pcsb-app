import { calendarCampaignSuffix } from '@/lib/calendar-booking-label'

/** Native details provides full text on touch and keyboard, not just mouse hover. */
export function CalendarBookingLabel({ label, campaignName }: { label: string; campaignName?: string | null }) {
  const suffix = calendarCampaignSuffix(campaignName)
  if (!suffix) return <span className="block truncate" title={label}>{label}</span>
  const fullLabel = label + suffix
  return (
    <details className="min-w-0 w-full whitespace-normal">
      <summary className="block cursor-pointer truncate" title={fullLabel} aria-label={fullLabel}>
        {fullLabel}
      </summary>
      <span className="block whitespace-normal [overflow-wrap:anywhere]">{fullLabel}</span>
    </details>
  )
}
