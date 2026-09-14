/** Display only: retain the existing brand/client label and omit legacy blanks. */
export function calendarCampaignSuffix(campaignName?: string | null): string {
  const campaign = campaignName?.trim()
  return campaign ? ` — ${campaign}` : ''
}
