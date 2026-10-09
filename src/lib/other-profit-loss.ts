export type OtherEntry = {
  id: string
  entry_date: string
  kind: 'income' | 'expense'
  description: string
  category: string | null
  amount: number | string
}
export type OtherDraft = Omit<OtherEntry, 'id' | 'amount'> & { amount: string }

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
