import { expect, test } from '@playwright/experimental-ct-react'
import AccountsPage from '../src/app/(app)/accounts/page'

for (const mobile of [false, true]) {
  test(`Accounts normal billing without review UI ${mobile ? 'mobile owner' : 'desktop viewer'}`, async ({ mount, page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.evaluate(({ owner }) => {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const bb = { id: 'a', name: 'Screen A', location: 'Synthetic location', profit_share_percent: 20 }
      const b = { id: 'b', brand_name: 'Synthetic Maxis', billboard_id: 'a', billboard: bb, client: { company_name: 'Synthetic Client' }, start_date: `${month}-21`, end_date: '2027-12-15', monthly_rate: 2000, total_amount: 2000, payment_status: 'settled' }
      Object.assign(window, { accountsCanEdit: owner, salesFixture: {
        billboards: [bb, { id: 'other', name: 'Screen B' }], bookings: [b, { ...b, id: 'zero', brand_name: 'Synthetic FOC', monthly_rate: 0, total_amount: 0 }],
        monthly_payments: [
          { id: 'valid', booking_id: 'b', month, amount: 2000, status: 'invoice_sent', invoice_number: '@VALID' },
          { id: 'extra', booking_id: 'b', month: '2027-12', amount: 2000, status: 'invoice_sent', invoice_number: '@EXTRA,1234' },
          { id: 'before', booking_id: 'b', month: '2025-11', amount: 6315, status: 'completed' },
          { id: 'paid', booking_id: 'b', month: '2027-11', amount: 2000, status: 'completed', invoice_number: '@PAID' },
        ], profit_sharing: [{ booking_id: 'b', month, status: 'settled' }],
      } })
    }, { owner: mobile })
    const networkWrites: string[] = []
    page.on('request', r => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) networkWrites.push(r.url()) })
    await mount(<AccountsPage />)
    const fixtureBefore = await page.evaluate(() => JSON.stringify((window as unknown as { salesFixture: unknown }).salesFixture))
    async function expectNoReview() {
      await expect(page.getByRole('region', { name: 'Extra-month records', exact: true })).toHaveCount(0)
      await expect(page.getByTestId('extra-month-record')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Billing inference uncertainties' })).toHaveCount(0)
      await expect(page.getByText(/Needs review|Billing inference needs confirmation|no billing months inferred/)).toHaveCount(0)
      await expect(page.getByText(/@EXTRA|@PAID/)).toHaveCount(0)
    }
    await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible()
    await expectNoReview()
    await expect(page.getByText('Monthly Revenue', { exact: true }).locator('..')).toContainText('RM 2,000')
    await page.getByRole('button', { name: 'Billable months for Synthetic Maxis', exact: true }).click()
    await expect(page.getByText('Billable months · Campaign:', { exact: false })).toBeVisible()
    await expect(page.getByText('1 billable', { exact: true })).toBeVisible()
    if (mobile) {
      const locked = page.getByRole('button', { name: /Completed.*@VALID/ }).first()
      await locked.click()
      await expect(locked).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: /Completed/ })).toHaveCount(0)
    }
    await page.screenshot({ path: `screenshots/accounts-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Billable months for Synthetic Maxis' })).toHaveCount(0)
    await expectNoReview()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    let csv = ''; for await (const chunk of stream!) csv += chunk.toString()
    expect(csv).toContain('Monthly Payment Status')
    expect(csv).toContain('TOTAL,0.00,0.00,0.00,0.00,2000.00,2000.00,0.00')
    for (const removed of ['Extra-month records', '@EXTRA', '@PAID', '2025-11', 'Needs review', 'Billing inference uncertainties', 'Synthetic FOC']) {
      expect(csv).not.toContain(removed)
    }
    await page.getByRole('button', { name: 'Screen B', exact: true }).click()
    await expectNoReview()
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expectNoReview()
    expect(await page.evaluate(() => JSON.stringify((window as unknown as { salesFixture: unknown }).salesFixture))).toBe(fixtureBefore)
    expect(networkWrites).toEqual([])
  })
}
