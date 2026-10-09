import React from 'react'
import { test, expect } from '@playwright/experimental-ct-react'
import OtherProfitLossPage from '../src/app/(app)/other-profit-loss/page'

async function setup(page: { evaluate: (fn: (owner: boolean) => void, arg: boolean) => Promise<void> }, owner = true) {
  await page.evaluate(owner => {
    Object.assign(window, { accountsCanEdit: owner, otherView: true, otherError: '', otherWrites: [], otherEntries: [
      { id: 'one', entry_date: '2026-10-09', kind: 'income', description: '<script>literal text</script>', category: 'Other sales', amount: '100.10' },
      { id: 'two', entry_date: '2026-10-10', kind: 'expense', description: 'Manual supplies', category: null, amount: '30.20' },
      { id: 'three', entry_date: '2026-09-01', kind: 'income', description: 'September sale', category: null, amount: '200.00' },
    ] })
  }, owner)
}

test('income and expense CRUD, filters and literal text', async ({ mount, page }) => {
  await setup(page)
  const component = await mount(<OtherProfitLossPage />)
  await component.getByLabel('Year', { exact: true }).fill('2026')
  await component.getByLabel('Month', { exact: true }).selectOption('10')
  await expect(component.getByText('RM 69.90')).toBeVisible()
  await expect(component.getByText('<script>literal text</script>', { exact: true })).toBeVisible()
  await component.getByRole('button', { name: 'Add Income', exact: true }).click()
  await page.getByLabel('Description', { exact: true }).fill('New manual sale')
  await page.getByLabel('Amount (RM)', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await expect(page.getByRole('alert')).toContainText('positive amount')
  await page.getByLabel('Amount (RM)', { exact: true }).fill('50.25')
  await page.getByLabel('Date', { exact: true }).fill('2026-10-11')
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await expect(component.getByText('New manual sale', { exact: true })).toBeVisible()
  await component.getByRole('button', { name: 'Edit New manual sale', exact: true }).click()
  await page.getByLabel('Amount (RM)', { exact: true }).fill('60.25')
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await expect(component.getByText('RM 60.25', { exact: true })).toBeVisible()
  await component.getByRole('button', { name: 'Delete New manual sale', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Entry', exact: true }).click()
  await expect(component.getByText('New manual sale', { exact: true })).toHaveCount(0)
  await component.getByRole('button', { name: 'Add Expense', exact: true }).click()
  await page.getByLabel('Description', { exact: true }).fill('Independent expense')
  await page.getByLabel('Date', { exact: true }).fill('2026-10-12')
  await page.getByLabel('Amount (RM)', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await expect(component.getByText('Net Loss', { exact: true })).toBeVisible()
  await expect(component.getByText('RM -30.10', { exact: true })).toBeVisible()
  await component.getByLabel('Month', { exact: true }).selectOption('all')
  await expect(component.getByText('September sale', { exact: true })).toBeVisible()
  await component.getByLabel('From date').fill('2026-10-10')
  await component.getByLabel('To date').fill('2026-10-10')
  await expect(component.getByText('No income for this period.')).toBeVisible()
  await expect(component.getByText('RM -30.20', { exact: true })).toBeVisible()
})

test('granted viewer cannot edit and mobile layout fits', async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, false)
  const component = await mount(<OtherProfitLossPage />)
  await component.getByLabel('Year', { exact: true }).fill('2026')
  await component.getByLabel('Month', { exact: true }).selectOption('10')
  await expect(component.getByText('RM 69.90')).toBeVisible()
  await expect(component.getByRole('button', { name: /Add Income|Add Expense|Edit |Delete / })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '/Users/canggih/.openclaw/workspace/main/output/other-pl-20261009/mobile.png', fullPage: true })
})

test('denied page makes no ledger visible', async ({ mount, page }) => {
  await setup(page, false)
  await page.evaluate(() => Object.assign(window, { otherView: false }))
  const component = await mount(<OtherProfitLossPage />)
  await expect(page.getByRole('alert')).toContainText('do not have access')
  await expect(component.getByText('RM 69.90')).toHaveCount(0)
})

test('load and mutation failures remain visible and retryable', async ({ mount, page }) => {
  await setup(page)
  await page.evaluate(() => Object.assign(window, { otherError: 'Synthetic permission denied' }))
  const component = await mount(<OtherProfitLossPage />)
  await expect(component.getByRole('alert')).toContainText('Synthetic permission denied')
  await page.evaluate(() => Object.assign(window, { otherError: '' }))
  await component.getByRole('button', { name: 'Retry' }).click()
  await component.getByRole('button', { name: 'Add Expense', exact: true }).click()
  await page.getByLabel('Date', { exact: true }).fill('2026-10-09')
  await page.getByLabel('Description', { exact: true }).fill('Failed expense')
  await page.getByLabel('Amount (RM)', { exact: true }).fill('10')
  await page.evaluate(() => Object.assign(window, { otherError: 'Synthetic write denied' }))
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await expect(page.getByRole('alert')).toContainText('Synthetic write denied')
  await expect(page.getByRole('button', { name: 'Save Entry' })).toBeEnabled()
})

test('full-year totals include more than the API page size', async ({ mount, page }) => {
  await setup(page)
  await page.evaluate(() => Object.assign(window, { otherEntries: Array.from({ length: 501 }, (_, index) => ({ id: String(index), entry_date: '2026-10-09', kind: 'income', description: `Sale ${index}`, category: null, amount: '1.00' })) }))
  const component = await mount(<OtherProfitLossPage />)
  await component.getByLabel('Year', { exact: true }).fill('2026')
  await component.getByLabel('Month', { exact: true }).selectOption('all')
  await expect(component.getByText('RM 501.00').first()).toBeVisible()
})

test('desktop review screenshot', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await setup(page)
  const component = await mount(<OtherProfitLossPage />)
  await component.getByLabel('Year', { exact: true }).fill('2026')
  await component.getByLabel('Month', { exact: true }).selectOption('10')
  await expect(component.getByText('RM 69.90')).toBeVisible()
  await page.screenshot({ path: '/Users/canggih/.openclaw/workspace/main/output/other-pl-20261009/desktop.png', fullPage: true })
})
