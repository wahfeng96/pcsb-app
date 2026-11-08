import { describe, expect, it } from 'vitest'
import { agencyCanRequest, isAllowedAgencyMonth, malaysiaMonth } from './agency-access'
import { APP_PAGES, canAccessPage, firstAllowedPage, canEditOtherProfitLoss } from './page-access'

describe('Agency calendar boundaries', () => {
  it('rolls over at midnight Malaysia time while UTC and US still show the prior month', () => {
    expect(malaysiaMonth(new Date('2026-10-31T15:59:59Z'))).toBe('2026-10')
    expect(malaysiaMonth(new Date('2026-10-31T16:00:00Z'))).toBe('2026-11')
    expect(malaysiaMonth(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01')
  })
  it('rejects previous, malformed, overflow and manipulated month values', () => {
    const now = new Date('2026-10-31T16:00:00Z')
    for (const month of ['2026-10', '2025-12', '2026-00', '2026-13', '2026-1', '2026-11-01', 'infinity', '2026-11&month=2026-10']) expect(isAllowedAgencyMonth(month, now)).toBe(false)
    for (const month of ['2026-11', '2026-12', '2027-01']) expect(isAllowedAgencyMonth(month, now)).toBe(true)
  })
  it('hard limits navigation even with legacy or malicious page/editor grants', () => {
    for (const grants of [null, APP_PAGES.map(page => page.href)]) {
      for (const page of APP_PAGES) expect(canAccessPage('agency', grants, page.href)).toBe(page.href === '/calendar')
      expect(firstAllowedPage('agency', grants)).toBe('/calendar')
    }
    expect(canEditOtherProfitLoss({ role: 'agency', approved: true, allowed_pages: ['/other-profit-loss'], can_edit_other_profit_loss: true })).toBe(false)
    expect(canAccessPage('unexpected', null, '/calendar')).toBe(false)
  })
  it('allows exact calendar read surfaces only, including rejecting write methods and URL suffix bypasses', () => {
    expect(agencyCanRequest('/calendar')).toBe(true)
    expect(agencyCanRequest('/api/agency-calendar')).toBe(true)
    for (const path of ['/calendar/old', '/dashboard', '/api/admin/create-user', '/api/delete-booking', '/api/billboard-costs', '/api/agency-calendar/extra']) expect(agencyCanRequest(path)).toBe(false)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(agencyCanRequest('/api/agency-calendar', method)).toBe(false)
  })
})
