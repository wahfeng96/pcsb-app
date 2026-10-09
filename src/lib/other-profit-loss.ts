export type OtherEntry = {
  id: string
  entry_date: string
  kind: 'income' | 'expense'
  description: string
  category: string | null
  no_invoice?: boolean
  amount: number | string
}
export type OtherDraft = Omit<OtherEntry, 'id' | 'amount' | 'no_invoice'> & { amount: string }

// Preserve the day where possible; shorter months use their last valid day.
// Arithmetic avoids timezone shifts and Date's special treatment of years 1–99.
export function otherExpenseDates(year: string, months: string[], day: number): string[] {
  if (!/^\d{4}$/.test(year) || Number(year) < 1 || !Number.isInteger(day) || day < 1 || day > 31 ||
      !months.length || months.some(month => !/^(0[1-9]|1[0-2])$/.test(month))) {
    throw new Error('Choose at least one month and a day from 1 to 31 in a valid year.')
  }
  const value = Number(year)
  const leap = value % 4 === 0 && (value % 100 !== 0 || value % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return [...new Set(months)].sort().map(month => `${year}-${month}-${String(Math.min(day, days[Number(month) - 1])).padStart(2, '0')}`)
}

export function buildOtherExpenses(draft: OtherDraft, year: string, months: string[], day: number) {
  const dates = otherExpenseDates(year, months, day)
  const validation = validateOtherEntry({ ...draft, kind: 'expense', entry_date: dates[0] })
  if (validation) throw new Error(validation)
  return dates.map(entry_date => ({ entry_date, kind: 'expense' as const,
    description: draft.description.trim(), category: draft.category?.trim() || null, amount: Number(draft.amount) }))
}

export function validateOtherEntry(draft: OtherDraft): string | null {
  if (!['income', 'expense'].includes(draft.kind)) return 'Choose income or expense.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.entry_date) || draft.entry_date < '0001-01-01' ||
      !Number.isFinite(Date.parse(`${draft.entry_date}T00:00:00Z`)) ||
      new Date(`${draft.entry_date}T00:00:00Z`).toISOString().slice(0, 10) !== draft.entry_date) return 'Enter a valid date.'
  if (!draft.description.trim() || draft.description.trim().length > 300 || /[\x00-\x1f\x7f]/.test(draft.description)) return 'Enter a description of 1–300 characters without control characters.'
  if (draft.category && (draft.category.trim().length > 100 || /[\x00-\x1f\x7f]/.test(draft.category))) return 'Category must be at most 100 characters without control characters.'
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(draft.amount) || Number(draft.amount) <= 0) return 'Enter a positive amount with at most two decimal places.'
  return null
}

export function filterOtherEntries(entries: OtherEntry[], year: string, month: string, from: string, to: string) {
  return entries.filter(entry => entry.entry_date.startsWith(year) &&
    (month === 'all' || entry.entry_date.slice(5, 7) === month) &&
    (!from || entry.entry_date >= from) && (!to || entry.entry_date <= to))
}

export function otherTotals(entries: OtherEntry[]) {
  let incomeCents = 0
  let expenseCents = 0
  for (const entry of entries) {
    const cents = Math.round(Number(entry.amount) * 100)
    if (entry.kind === 'income') incomeCents += cents
    else expenseCents += cents
  }
  return { income: incomeCents / 100, expenses: expenseCents / 100, net: (incomeCents - expenseCents) / 100 }
}
