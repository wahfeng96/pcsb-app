import { expect, test } from '@playwright/experimental-ct-react'
import ProfitLossPage from '../src/app/(app)/profit-loss/page'

function fixtureScript(owner: boolean) {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' })
  const parts = formatter.formatToParts(now)
  const year = parts.find(part => part.type === 'year')!.value
  const month = parts.find(part => part.type === 'month')!.value
  const monthKey = `${year}-${month}`
  Object.assign(window, {
    profitLossOwner: owner,
    accountsCanEdit: false,
    profitLossWrites: [],
    profitLossFixture: {
      billboards: [
        { id: 'bb-a', name: 'Likas', location: 'Kota Kinabalu' },
        { id: 'bb-b', name: 'Sandakan', location: 'Sandakan' },
      ],
      revenue: [
        { payment_id: 'paid-a', booking_id: 'booking-a', billing_month: `${year}-08`, reporting_month: monthKey, has_persisted_assignment: true, invoice_number: '@1400', client_id: 'client-a', client_name: 'Synthetic Client A', brand_name: 'Brand A', billboard_id: 'bb-a', billboard_name: 'Likas', billboard_location: 'Kota Kinabalu', amount: 1000 },
        { payment_id: 'paid-b', booking_id: 'booking-b', billing_month: `${year}-07`, reporting_month: monthKey, has_persisted_assignment: false, invoice_number: '@1401', client_id: 'client-b', client_name: 'Synthetic Client B', brand_name: 'Brand B', billboard_id: 'bb-b', billboard_name: 'Sandakan', billboard_location: 'Sandakan', amount: 2500 },
      ],
      categories: [
        { id: 'cat-power', name: 'Power', is_active: true },
        { id: 'cat-old', name: 'Legacy Rental', is_active: false },
      ],
      costs: [
        { id: 'cost-a', cost_date: `${monthKey}-02`, category_id: 'cat-power', category_name: 'Power', description: 'Synthetic electricity', supplier_payee: 'Synthetic Supplier', amount: 600, remarks: 'Synthetic only', allocations: [
          { id: 'alloc-a', billboard_id: 'bb-a', billboard_name: 'Likas', amount: 400 },
          { id: 'alloc-general', billboard_id: null, billboard_name: 'General / Company Overhead', amount: 200 },
        ] },
      ],
    },
  })
}

for (const mobile of [false, true]) {
  test(`P&L filters, paid revenue, allocations and responsive layout ${mobile ? 'mobile' : 'desktop'}`, async ({ mount, page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.evaluate(fixtureScript, true)
    await mount(<ProfitLossPage />)

    await expect(page.getByRole('heading', { name: 'Profit & Loss' })).toBeVisible()
    await expect(page.getByText('RM 3,500.00', { exact: true })).toBeVisible()
    await expect(page.getByLabel('P&L summary').getByText('RM 600.00', { exact: true })).toBeVisible()
    await expect(page.getByText('Net Profit').locator('..')).toContainText('RM 2,900.00')
    await expect(page.getByRole('link', { name: '@1400' })).toHaveAttribute('href', '/accounts?invoice=%401400')
    await expect(page.getByText('Existing paid · Oct 2026 fallback')).toBeVisible()

    await page.getByRole('button', { name: 'Likas', exact: true }).click()
    await expect(page.getByLabel('P&L summary').getByText('RM 1,000.00', { exact: true })).toBeVisible()
    await expect(page.getByLabel('P&L summary').getByText('RM 400.00', { exact: true })).toBeVisible()
    await expect(page.getByText('Synthetic Client B')).toHaveCount(0)
    await page.getByRole('button', { name: 'All company' }).click()

    if (!mobile) {
      const currentMonth = await page.getByLabel('Month', { exact: true }).inputValue()
      const year = await page.getByLabel('Year', { exact: true }).inputValue()
      const nextMonth = currentMonth === '12' ? '11' : String(Number(currentMonth) + 1).padStart(2, '0')
      await page.getByTestId('revenue-paid-a').dragTo(page.getByTestId(`month-drop-${year}-${nextMonth}`))
      await expect.poll(async () => page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string }> }).profitLossWrites.map(write => write.name))).toContain('set_profit_loss_revenue_month')
    } else {
      await page.getByLabel('Move @1400 to month').selectOption({ index: 1 })
      await expect.poll(async () => page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string }> }).profitLossWrites.map(write => write.name))).toContain('set_profit_loss_revenue_month')
    }

    await page.getByRole('button', { name: 'Add Cost' }).click()
    await page.getByLabel('Date').fill('2026-10-15')
    await page.getByLabel('Category').selectOption('cat-power')
    await page.getByLabel('Description').fill('Synthetic maintenance')
    await page.getByLabel('Supplier / Payee').fill('Synthetic Vendor')
    await page.getByLabel('Total Amount (RM)').fill('100')
    await page.getByLabel('Allocation 1 destination').selectOption('bb-a')
    await page.getByLabel('Allocation 1 amount').fill('60')
    await expect(page.getByText('Must match exactly')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Cost' })).toBeDisabled()
    await page.getByRole('button', { name: 'Split' }).click()
    await page.getByLabel('Allocation 2 destination').selectOption('bb-b')
    await page.getByLabel('Allocation 2 amount').fill('40')
    await expect(page.getByText('Balanced')).toBeVisible()
    await page.getByRole('button', { name: 'Save Cost' }).click()
    await expect.poll(async () => page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string }> }).profitLossWrites.map(write => write.name))).toContain('save_profit_loss_cost')

    const output = `/Users/canggih/.openclaw/workspace/main/output/pcsb-pl-page-20261002/profit-loss-${mobile ? 'mobile' : 'desktop'}.png`
    await page.screenshot({ path: output, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('P&L granted viewer has no accounting mutation controls', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.evaluate(fixtureScript, false)
  await mount(<ProfitLossPage />)
  await expect(page.getByRole('heading', { name: 'Profit & Loss' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Cost' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Revenue reporting months' })).toHaveCount(0)
  await expect(page.getByLabel('Move @1400 to month')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { profitLossWrites: unknown[] }).profitLossWrites)).toEqual([])
})
