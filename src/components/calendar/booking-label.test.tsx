// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CalendarBookingLabel } from './booking-label'
import { getOccupantsForDate, getOccupiedSlots } from '@/lib/calendar-occupancy'

afterEach(cleanup)

describe('calendar campaign labels', () => {
  it.each([undefined, null, '', ' \n\t '])('omits legacy blank %s without changing the existing label', campaignName => {
    const { container } = render(<CalendarBookingLabel label="Client fallback (out)" campaignName={campaignName} />)
    expect(container.textContent).toBe('Client fallback (out)')
    expect(container.querySelector('details')).toBeNull()
  })
  it.each([' Launch 2026 ', 'Long'.repeat(100), '<img src=x onerror=alert(1)> & "Launch"'])('keeps full campaign as safe text and a keyboard/touch disclosure: %s', campaignName => {
    const { container } = render(<CalendarBookingLabel label="Brand (in)" campaignName={campaignName} />)
    const fullLabel = `Brand (in) — ${campaignName.trim()}`
    const summary = container.querySelector('summary')!
    expect(summary).toHaveTextContent(fullLabel)
    expect(summary).toHaveAttribute('title', fullLabel)
    expect(summary).toHaveAttribute('aria-label', fullLabel)
    expect(summary).toHaveClass('truncate')
    expect(container.querySelector('details > span')?.textContent).toBe(fullLabel)
    expect(container.querySelector('img, script')).toBeNull()
    expect(screen.queryByText('undefined')).toBeNull()
  })
  it('carries campaign to occupancy while preserving brand/client fallback, slots and inclusive dates', () => {
    const base = { billboard_id: 'screen', start_date: '2026-09-01', end_date: '2026-09-02', status: 'live' }
    const bookings = [
      { ...base, id: 'a', brand_name: 'Brand', campaign_name: ' Launch ', spot_size: 0.5 },
      { ...base, id: 'b', client: { company_name: 'Client' }, campaign_name: '   ', spot_size: 1 },
      { ...base, id: 'c', status: 'cancelled', campaign_name: 'Excluded' },
    ]
    const occupants = getOccupantsForDate(bookings, 'screen', '2026-09-02')
    expect(occupants).toEqual([
      { id: 'a', name: 'Brand — Launch', spotSize: 0.5 },
      { id: 'b', name: 'Client', spotSize: 1 },
    ])
    expect(getOccupiedSlots(occupants)).toBe(1.5)
  })
})
