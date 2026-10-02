import { describe, expect, it } from 'vitest'
import { APP_PAGES, DEFAULT_ALLOWED_PAGES, canAccessPage, firstAllowedPage } from './page-access'

describe('P&L page access', () => {
  it('keeps P&L owner-only for legacy null permissions and new-user defaults', () => {
    expect(APP_PAGES.some(page => page.href === '/profit-loss')).toBe(true)
    expect(DEFAULT_ALLOWED_PAGES).not.toContain('/profit-loss')
    expect(canAccessPage('owner', null, '/profit-loss')).toBe(true)
    expect(canAccessPage('team', null, '/profit-loss')).toBe(false)
    expect(canAccessPage('partner', undefined, '/profit-loss')).toBe(false)
  })

  it('allows only an explicit P&L page grant without changing legacy defaults elsewhere', () => {
    expect(canAccessPage('team', ['/dashboard', '/profit-loss'], '/profit-loss')).toBe(true)
    expect(canAccessPage('team', null, '/dashboard')).toBe(true)
    expect(firstAllowedPage('team', ['/profit-loss'])).toBe('/profit-loss')
  })
})
