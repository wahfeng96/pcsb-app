import { expect, test } from '@playwright/experimental-ct-react'
import CalendarPage from '../src/app/(app)/calendar/page'

for (const mobile of [false, true]) {
  test(`calendar campaigns all display paths ${mobile ? 'mobile' : 'desktop'}`, async ({ mount, page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.evaluate(() => {
      const now = new Date()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const billboard = { id: 'screen', name: 'Synthetic Screen', max_slots: 10 }
      const base = { billboard_id: 'screen', billboard, client: { company_name: 'Fallback Client' }, start_date: date, end_date: date, status: 'live', spot_size: 1 }
      Object.assign(window, { salesFixture: { billboards: [billboard, { id: 'other', name: 'Other Screen', max_slots: 10 }], content_changes: [], bookings: [
        { ...base, id: 'a', brand_name: 'Alpha', campaign_name: ' Launch ' },
        { ...base, id: 'b', brand_name: 'Beta', campaign_name: 'X'.repeat(200), spot_size: 0.5 },
        { ...base, id: 'c', brand_name: '', campaign_name: '   ' },
        { ...base, id: 'd', brand_name: 'Unsafe', campaign_name: '<img src=x onerror=alert(1)>' },
        { ...base, id: 'e', brand_name: 'Legacy', campaign_name: null },
        { ...base, id: 'f', brand_name: 'Cancelled', campaign_name: 'Hidden', status: 'cancelled' },
      ] } })
    })
    await mount(<CalendarPage />)
    const chip = page.locator('summary').filter({ hasText: /^Alpha \(in\) — Launch$/ })
    await expect(chip).toHaveAttribute('title', 'Alpha (in) — Launch')
    await expect(chip.locator('..').locator('..')).toHaveClass(/bg-green-500/)
    await chip.click()
    await expect(chip.locator('..')).toHaveAttribute('open', '')
    const out = page.locator('summary').filter({ hasText: /^Alpha \(out\) — Launch$/ })
    await expect(out.locator('..').locator('..')).toHaveClass(/bg-red-500/)
    await page.getByLabel(/^More events on/).click()
    await expect(page.getByText('Fallback Client (in)', { exact: true })).toBeVisible()
    const unsafe = page.locator('summary').filter({ hasText: /^Unsafe \(in\) — </ })
    await expect(unsafe).toBeVisible()
    await unsafe.click()
    await expect(unsafe.locator('..').locator('span')).toHaveText('Unsafe (in) — <img src=x onerror=alert(1)>')
    await expect(page.locator('img')).toHaveCount(0)
    await expect(page.getByText('Legacy (out)', { exact: true })).toBeVisible()
    await expect(page.getByText(/Cancelled/)).toHaveCount(0)
    await expect(page.locator('summary').filter({ hasText: /^Alpha — Launch$/ })).toHaveCount(2)
    const trigger = page.getByRole('button', { name: /4.5 of 10 slots occupied.*Show occupants/ })
    if (mobile) await trigger.tap()
    else await trigger.hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('Alpha — Launch')
    await expect(tooltip).toContainText(`Beta — ${'X'.repeat(200)}`)
    await expect(tooltip).toContainText('Fallback Client')
    await expect(tooltip).toContainText('0.5 slots')
    expect(await tooltip.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `screenshots/calendar-campaign-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true })
    await trigger.focus()
    await page.keyboard.press('Escape')
    await expect(tooltip).toBeHidden()
    await page.getByRole('button', { name: 'Other Screen', exact: true }).first().click()
    await expect(page.getByText('No bookings yet. Add clients and bookings to see them here.')).toBeVisible()
    // Occupancy has its own unchanged screen filter.
    await expect(trigger).toBeVisible()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(chip).toBeVisible()
  })
}
