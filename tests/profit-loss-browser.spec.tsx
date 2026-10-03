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
      locks: [],
      billboards: [
        { id: 'bb-a', name: 'Likas', location: 'Kota Kinabalu' },
        { id: 'bb-b', name: 'Sandakan', location: 'Sandakan' },
      ],
      revenue: [
        { revenue_id: 'payment:paid-a', payment_id: 'paid-a', source: 'payment', booking_id: 'booking-a', billing_month: `${year}-08`, reporting_month: monthKey, has_persisted_assignment: true, invoice_number: '@1400', client_id: 'client-a', client_name: 'Synthetic Client A', brand_name: 'Brand A', billboard_id: 'bb-a', billboard_name: 'Likas', billboard_location: 'Kota Kinabalu', amount: 1000 },
        { revenue_id: `unknown:booking-b:${year}-07`, payment_id: null, source: 'settled_booking', booking_id: 'booking-b', billing_month: `${year}-07`, reporting_month: 'unknown', has_persisted_assignment: false, invoice_number: null, client_id: 'client-b', client_name: 'Synthetic Client B', brand_name: 'Brand B', billboard_id: 'bb-b', billboard_name: 'Sandakan', billboard_location: 'Sandakan', amount: 2500 },
        { revenue_id: 'unknown:booking-old:2024-11', payment_id: 'pending-old', source: 'settled_booking', booking_id: 'booking-old', billing_month: '2024-11', reporting_month: 'unknown', has_persisted_assignment: false, invoice_number: '@1300', client_id: 'client-a', client_name: 'Historical Client', brand_name: 'Old Brand', billboard_id: 'bb-a', billboard_name: 'Likas', billboard_location: 'Kota Kinabalu', amount: 500 },
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
    await expect(page.getByLabel('P&L summary').getByText('RM 1,000.00', { exact: true })).toBeVisible()
    await expect(page.getByLabel('P&L summary').getByText('RM 600.00', { exact: true })).toBeVisible()
    await expect(page.getByText('Net Profit').locator('..')).toContainText('RM 400.00')
    await expect(page.getByRole('link', { name: '@1400' })).toHaveAttribute('href', '/accounts?invoice=%401400')
    await expect(page.getByRole('button', { name: /Unknown 1 received/ })).toBeVisible()
    await expect(page.getByLabel('Year', { exact: true }).locator('option[value="2024"]')).toHaveCount(1)

    await page.getByRole('button', { name: 'Likas', exact: true }).click()
    await expect(page.getByLabel('P&L summary').getByText('RM 1,000.00', { exact: true })).toBeVisible()
    await expect(page.getByLabel('P&L summary').getByText('RM 400.00', { exact: true })).toBeVisible()
    await expect(page.getByText('Synthetic Client B')).toHaveCount(0)
    await page.getByRole('button', { name: 'All company' }).click()

    const initialMonth = await page.getByLabel('Month', { exact: true }).inputValue()
    const initialYear = await page.getByLabel('Year', { exact: true }).inputValue()
    await page.getByLabel('Search revenue by').selectOption('brand')
    await page.getByLabel('Search revenue', { exact: true }).fill('Synthetic Client B')
    await expect(page.getByText('No revenue matches this search.')).toBeVisible()
    await page.getByLabel('Search revenue', { exact: true }).fill('Brand B')
    await expect(page.getByText('1 result', { exact: true })).toBeVisible()
    await expect(page.getByText('Received · reporting month unknown')).toBeVisible()
    await expect(page.getByText(`Billing ${initialYear}-07`)).toBeVisible()
    await expect(page.getByLabel('Month', { exact: true })).toHaveValue(initialMonth)
    await expect(page.getByLabel('Move Synthetic Client B to month').locator('option[value="unknown"]')).toHaveCount(1)
    await page.getByLabel('Move Synthetic Client B to month').selectOption(`${initialYear}-01`)
    await expect.poll(async () => page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string }> }).profitLossWrites.map(write => write.name))).toContain('assign_profit_loss_revenue')
    await page.getByLabel('Clear revenue search').click()
    await expect(page.getByLabel('Search revenue', { exact: true })).toHaveValue('')
    await page.getByLabel('Month', { exact: true }).selectOption(initialMonth)

    if (!mobile) {
      await page.getByTestId('revenue-payment:paid-a').dragTo(page.getByTestId('month-drop-unknown'))
      await expect.poll(async () => page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string }> }).profitLossWrites.map(write => write.name))).toContain('unassign_profit_loss_revenue')
    } else {
      await page.getByLabel('Move @1400 to month').selectOption('unknown')
      await expect.poll(async () => page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string }> }).profitLossWrites.map(write => write.name))).toContain('unassign_profit_loss_revenue')
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

test('owner locks and code-unlocks a reporting month', async ({ mount, page }) => {
  await page.evaluate(fixtureScript, true)
  await page.on('dialog', dialog => dialog.accept())
  await mount(<ProfitLossPage />)
  const selectedMonth = await page.getByLabel('Month', { exact: true }).inputValue()
  const year = await page.getByLabel('Year', { exact: true }).inputValue()
  const label = new Date(`${year}-${selectedMonth}-01T00:00:00`).toLocaleString('en', { month: 'short', timeZone: 'UTC' })

  await page.getByRole('button', { name: `Lock ${label} ${year}` }).click()
  await expect(page.getByRole('button', { name: `Unlock ${label} ${year}` })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Cost' })).toBeDisabled()

  await page.getByRole('button', { name: `Unlock ${label} ${year}` }).click()
  await page.getByLabel('Unlock code').fill('synthetic-test-code')
  await page.getByRole('button', { name: 'Unlock Month' }).click()
  await expect(page.getByRole('button', { name: `Lock ${label} ${year}` })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Cost' })).toBeEnabled()

  const writes = await page.evaluate(() => (window as unknown as { profitLossWrites: Array<{ name: string; args: Record<string, unknown> }> }).profitLossWrites)
  expect(writes.map(write => write.name)).toEqual(expect.arrayContaining(['lock_profit_loss_month', 'unlock_profit_loss_month']))
  expect(writes.find(write => write.name === 'unlock_profit_loss_month')?.args.p_unlock_code).toBe('synthetic-test-code')
})
