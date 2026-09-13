import { expect, test } from '@playwright/experimental-ct-react'
import SalesSummaryPage from '../src/app/(app)/sales-summary/page'

for (const mobile of [false, true]) {
  test(`Sales Summary scoped calculations ${mobile ? 'mobile' : 'desktop'}`, async ({ mount, page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.evaluate(() => {
      const year = new Date().getFullYear()
      const booking = (id: string, person: string | null, billboard: string, amount: number) => ({
        id, sales_person: person, billboard_id: billboard, brand_name: `Campaign ${id}`, client: {},
        start_date: `${year}-01-01`, monthly_rate: amount, total_amount: amount * 2,
      })
      ;(window as unknown as { salesFixture: unknown }).salesFixture = {
        billboards: [{ id: 'a', name: 'Screen A' }, { id: 'b', name: 'Screen B' }],
        bookings: [booking('one', 'Alex', 'a', 100), booking('two', 'Bea', 'a', 200), booking('three', null, 'a', 50), booking('four', 'Alex', 'b', 300)],
        monthly_payments: [{ booking_id: 'one', month: `${year}-01`, invoice_number: 'INV-A' }, { booking_id: 'two', month: `${year}-01`, invoice_number: 'INV-B' }],
        profit_sharing: [{ booking_id: 'one', month: `${year}-01`, status: 'settled' }],
      }
    })
    await mount(<SalesSummaryPage />)
    const dropdown = page.getByLabel('Salesperson', { exact: true })
    await expect(dropdown).toHaveValue('all')
    await expect(page.locator('tfoot')).toContainText('1,300.00')
    await expect(dropdown.locator('option')).toHaveText(['All salespeople', 'Unassigned', 'Alex', 'Bea'])
    await dropdown.selectOption('person:Alex')
    await expect(page.locator('tbody')).not.toContainText('Campaign two')
    await expect(page.locator('tbody')).not.toContainText('INV-B')
    await expect(page.locator('tbody')).toContainText('INV-A')
    await expect(page.locator('tfoot')).toContainText('800.00')
    await page.getByRole('button', { name: 'Screen A', exact: true }).click()
    await expect(page.locator('tfoot')).toContainText('200.00')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody td.text-green-600')).toContainText('INV-A')
    await page.screenshot({ path: `screenshots/sales-summary-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Next year' }).click()
    await expect(page.locator('tfoot')).toContainText('0.00')
    await expect(page.locator('tbody')).not.toContainText('INV-A')
    await expect(dropdown).toHaveValue('person:Alex')
    await page.getByRole('button', { name: 'Previous year' }).click()
    await dropdown.selectOption('unassigned')
    await expect(page.locator('tbody')).toContainText('Campaign three')
    await expect(page.locator('tfoot')).toContainText('100.00')
    await page.getByRole('button', { name: 'Screen B', exact: true }).click()
    await expect(page.locator('tbody')).toContainText('No bookings found')
    await expect(page.locator('tfoot')).toContainText('0.00')
    await dropdown.selectOption('all')
    await expect(page.locator('tfoot')).toContainText('600.00')
    await expect(dropdown).toBeVisible()
    expect(await dropdown.evaluate(el => el.getBoundingClientRect().right <= window.innerWidth)).toBe(true)
  })
}
