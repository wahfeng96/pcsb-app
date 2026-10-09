import { describe, expect, it } from 'vitest'
import { buildOtherExpenses, otherExpenseDates, filterOtherEntries, otherTotals, validateOtherEntry, type OtherDraft, type OtherEntry } from './other-profit-loss'
import { DEFAULT_ALLOWED_PAGES, canAccessPage } from './page-access'

const valid: OtherDraft = { kind: 'income', entry_date: '2026-10-09', description: 'Manual sale', category: null, amount: '10.20' }
const rows: OtherEntry[] = [
  { ...valid, id: 'a' },
  { ...valid, id: 'b', kind: 'expense', entry_date: '2026-10-10', amount: '20.30' },
  { ...valid, id: 'c', entry_date: '2026-09-09', amount: '100.00' },
  { ...valid, id: 'd', entry_date: '2025-10-09', amount: '200.00' },
]
describe('independent Other P&L', () => {
  it('requires a separate explicit viewer grant and excludes new-user defaults', () => {
    expect(DEFAULT_ALLOWED_PAGES).not.toContain('/other-profit-loss')
    expect(canAccessPage('owner', null, '/other-profit-loss')).toBe(true)
    expect(canAccessPage('team', null, '/other-profit-loss')).toBe(false)
    expect(canAccessPage('partner', ['/profit-loss'], '/other-profit-loss')).toBe(false)
    expect(canAccessPage('partner', ['/other-profit-loss'], '/other-profit-loss')).toBe(true)
  })
  it('combines year, month and inclusive date boundaries', () => {
    expect(filterOtherEntries(rows, '2026', '10', '', '').map(row => row.id)).toEqual(['a', 'b'])
    expect(filterOtherEntries(rows, '2026', 'all', '', '')).toHaveLength(3)
    expect(filterOtherEntries(rows, '2026', '10', '2026-10-10', '2026-10-10').map(row => row.id)).toEqual(['b'])
    expect(filterOtherEntries(rows, '2024', 'all', '', '')).toEqual([])
  })
  it('calculates exact cents and losses', () => {
    expect(otherTotals(rows.slice(0, 2))).toEqual({ income: 10.2, expenses: 20.3, net: -10.1 })
    expect(otherTotals([])).toEqual({ income: 0, expenses: 0, net: 0 })
    expect(otherTotals([{ ...rows[0], amount: '0.10' }, { ...rows[0], amount: '0.20' }]).income).toBe(0.3)
  })
  it('accepts valid positive amounts and safe literal markup text', () => {
    expect(validateOtherEntry(valid)).toBeNull()
    expect(validateOtherEntry({ ...valid, description: '<script>alert(1)</script>' })).toBeNull()
  })
  it.each(['0', '-1', 'NaN', 'Infinity', '1e2', '1.001', '9999999999999.00', ''])('rejects invalid amount %s', amount => {
    expect(validateOtherEntry({ ...valid, amount })).not.toBeNull()
  })
  it.each(['2026-02-30', '2026-13-01', '0000-01-01', 'not-a-date'])('rejects invalid date %s', entry_date => {
    expect(validateOtherEntry({ ...valid, entry_date })).not.toBeNull()
  })
  it('rejects blank, overlong and control text', () => {
    for (const description of ['  ', 'x'.repeat(301), 'a\nb', 'x\u0000']) expect(validateOtherEntry({ ...valid, description })).not.toBeNull()
    expect(validateOtherEntry({ ...valid, category: 'x'.repeat(101) })).not.toBeNull()
    expect(validateOtherEntry({ ...valid, category: 'a\tb' })).not.toBeNull()
  })
})


describe('monthly expense allocation', () => {
  it('creates distinct sorted months at the per-month amount, trimming text', () => {
    const batch = buildOtherExpenses({ ...valid, description: ' Rental ', category: ' Rent ', amount: '1000' }, '2026', ['03', '01', '02', '01'], 31)
    expect(batch.map(row => row.entry_date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(batch.every(row => row.kind === 'expense' && row.amount === 1000 && row.description === 'Rental' && row.category === 'Rent')).toBe(true)
    expect(otherTotals(batch.map((row, index) => ({ ...row, id: String(index) })))).toEqual({ income: 0, expenses: 3000, net: -3000 })
  })
  it.each([['2024', '29'], ['2026', '28'], ['1900', '28'], ['2000', '29'], ['0001', '28'], ['9999', '28']])('uses valid February dates in %s', (year, lastDay) => {
    expect(otherExpenseDates(year, ['02'], 31)).toEqual([`${year}-02-${lastDay}`])
  })
  it('keeps all dates inside the selected year and handles 30-day months', () => {
    expect(otherExpenseDates('2026', ['12', '01', '04'], 31)).toEqual(['2026-01-31', '2026-04-30', '2026-12-31'])
    expect(otherExpenseDates('2026', ['02'], 15)).toEqual(['2026-02-15'])
  })
  it('rejects absent/invalid months, years, days and amounts before building a batch', () => {
    for (const months of [[], ['00'], ['13'], ['1']]) expect(() => otherExpenseDates('2026', months, 1)).toThrow()
    for (const year of ['0000', '10000', '2026x']) expect(() => otherExpenseDates(year, ['01'], 1)).toThrow()
    for (const day of [0, 32, 1.5, NaN]) expect(() => otherExpenseDates('2026', ['01'], day)).toThrow()
    expect(() => buildOtherExpenses({ ...valid, amount: '0' }, '2026', ['01'], 1)).toThrow('positive amount')
  })
})
