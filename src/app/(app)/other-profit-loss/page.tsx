'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRole } from '@/lib/hooks/use-role'
import { canAccessPage } from '@/lib/page-access'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildOtherExpenses, otherExpenseDates, filterOtherEntries, otherTotals, validateOtherEntry, type OtherDraft, type OtherEntry } from '@/lib/other-profit-loss'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (amount: number) => `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const selectClass = 'h-10 rounded-md border border-gray-300 bg-white px-3 text-sm w-full'
const todayMYT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function OtherProfitLossPage() {
  const supabase = useMemo(() => createClient(), [])
  const { isOwner, canEditOtherProfitLoss: canEdit, profile, loading: profileLoading } = useRole()
  const canView = isOwner || (profile?.approved === true && canAccessPage(profile.role, profile.allowed_pages, '/other-profit-loss'))
  const today = todayMYT()
  const [year, setYear] = useState(today.slice(0, 4))
  const [month, setMonth] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<OtherEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<OtherDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expenseMonths, setExpenseMonths] = useState<string[]>([])
  const [expenseDay, setExpenseDay] = useState(1)
  const [deleting, setDeleting] = useState<OtherEntry | null>(null)

  const [invoiceError, setInvoiceError] = useState('')
  const [invoicePending, setInvoicePending] = useState<Set<string>>(new Set())
  const invoiceInFlight = useRef(new Set<string>())
  const requestId = useRef(0)
  const load = useCallback(async () => {
    const activeRequest = ++requestId.current
    setLoading(true)
    setLoadError('')
    try {
      const rows: OtherEntry[] = []
      // Fetch every row for the selected year, avoiding Supabase's default row limit.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('other_profit_loss_entries').select('id, entry_date, kind, description, category, amount, no_invoice')
          .gte('entry_date', `${year}-01-01`).lte('entry_date', `${year}-12-31`)
          .order('entry_date', { ascending: false }).order('id').range(offset, offset + 499)
        if (activeRequest !== requestId.current) return
        if (error) throw error
        rows.push(...(data || []) as OtherEntry[])
        if (!data || data.length < 500) break
      }
      if (activeRequest === requestId.current) setEntries(rows)
    } catch (error) {
      if (activeRequest !== requestId.current) return
      setEntries([])
      setLoadError(error instanceof Error ? error.message : (error as { message?: string }).message || 'Unable to load Other P&L.')
    } finally { if (activeRequest === requestId.current) setLoading(false) }
  }, [supabase, year])

  const latestLoad = useRef(load)
  latestLoad.current = load
  useEffect(() => { if (!profileLoading && canView) void load() }, [profileLoading, canView, load])
  const invalidRange = Boolean(from && to && from > to)
  const filtered = filterOtherEntries(entries, year, month, from, to)
  const totals = otherTotals(filtered)

  const yearTotals = otherTotals(entries)
  const monthlyTotals = MONTHS.map((label, index) => ({ label, month: String(index + 1).padStart(2, '0'),
    ...otherTotals(filterOtherEntries(entries, year, String(index + 1).padStart(2, '0'), '', '')) }))
  const newExpense = draft?.kind === 'expense' && !editingId
  let expenseDates: string[] = []
  if (newExpense) {
    try { expenseDates = otherExpenseDates(year, expenseMonths, expenseDay) } catch { /* Validate on save. */ }
  }
  const expensePreview = draft && !validateOtherEntry({ ...draft, entry_date: expenseDates[0] || draft.entry_date })
    ? Math.round(Number(draft.amount) * 100) * expenseDates.length / 100 : null
  const years = [...new Set([Number(year), ...Array.from({ length: 11 }, (_, index) => Number(today.slice(0, 4)) - 5 + index)])].filter(value => value >= 1 && value <= 9999).sort((a, b) => b - a)

  function selectPeriod(value: string) { setMonth(value); setFrom(''); setTo('') }
  function selectYear(value: string) { setYear(value); setFrom(''); setTo('') }

  function openEntry(kind: 'income' | 'expense', entry?: OtherEntry) {
    if (!canEdit) return
    setActionError('')
    setEditingId(entry?.id || null)
    setExpenseMonths([month === 'all' ? (year === today.slice(0, 4) ? today.slice(5, 7) : '01') : month])
    setExpenseDay(year === today.slice(0, 4) && (month === 'all' || month === today.slice(5, 7)) ? Number(today.slice(8, 10)) : 1)
    setDraft(entry ? { ...entry, amount: String(entry.amount) } : {
      entry_date: year === today.slice(0, 4) && (month === 'all' || month === today.slice(5, 7)) ? today : `${year}-${month === 'all' ? '01' : month}-01`,
      kind, description: '', category: '', amount: '',
    })
  }

  async function save() {
    if (!canEdit || !draft || saving) return
    let batch: ReturnType<typeof buildOtherExpenses> | null = null
    try {
      if (newExpense) batch = buildOtherExpenses(draft, year, expenseMonths, expenseDay)
      else { const validation = validateOtherEntry(draft); if (validation) throw new Error(validation) }
    } catch (error) { setActionError((error as Error).message); return }
    setSaving(true)
    setActionError('')
    try {
      const payload = { entry_date: draft.entry_date, kind: draft.kind, description: draft.description.trim(), category: draft.category?.trim() || null, amount: Number(draft.amount) }
      // One PostgREST INSERT statement: all selected months succeed or the entire batch rolls back.
      const query = editingId ? supabase.from('other_profit_loss_entries').update(payload).eq('id', editingId).select('id').single()
        : supabase.from('other_profit_loss_entries').insert(batch || payload).select('id')
      const { data, error } = await query
      if (error || !data || (Array.isArray(data) && data.length !== (batch?.length || 1))) throw error || new Error('Entry was not saved. Check your permissions and retry.')
      setDraft(null)
      const savedYear = batch ? year : payload.entry_date.slice(0, 4)
      setYear(savedYear)
      setMonth(batch ? (batch.length > 1 ? 'all' : batch[0].entry_date.slice(5, 7)) : payload.entry_date.slice(5, 7))
      setFrom(''); setTo('')
      if (savedYear === year) await load()
    } catch (error) {
      setActionError((error as { message?: string }).message || 'Unable to save entry.')
    } finally { setSaving(false) }
  }

  async function toggleInvoice(entry: OtherEntry) {
    if (!canView || entry.kind !== 'expense' || invoiceInFlight.current.has(entry.id)) return
    const previous = Boolean(entry.no_invoice)
    const next = !previous
    const activeRequest = requestId.current
    invoiceInFlight.current.add(entry.id)
    setInvoicePending(new Set(invoiceInFlight.current))
    setInvoiceError('')
    setEntries(current => current.map(row => row.id === entry.id ? { ...row, no_invoice: next } : row))
    try {
      const { data, error } = await supabase.rpc('set_other_expense_no_invoice', { p_entry_id: entry.id, p_no_invoice: next })
      if (error || data !== next) throw error || new Error('Invoice status was not saved. Retry.')
    } catch (error) {
      if (activeRequest === requestId.current) {
        setEntries(current => current.map(row => row.id === entry.id ? { ...row, no_invoice: previous } : row))
      }
      setInvoiceError((error as { message?: string }).message || 'Unable to save invoice status. Retry.')
    } finally {
      invoiceInFlight.current.delete(entry.id)
      setInvoicePending(new Set(invoiceInFlight.current))
      if (activeRequest !== requestId.current) void latestLoad.current()
    }
  }

  async function remove() {
    if (!canEdit || !deleting || saving) return
    setSaving(true); setActionError('')
    try {
      const { data, error } = await supabase.from('other_profit_loss_entries').delete().eq('id', deleting.id).select('id').single()
      if (error || !data) throw error || new Error('Entry was not deleted. Check your permissions and retry.')
      setDeleting(null)
      await load()
    } catch (error) { setActionError((error as { message?: string }).message || 'Unable to delete entry.') }
    finally { setSaving(false) }
  }

  if (profileLoading) return <p className="p-6 text-gray-500">Loading permissions…</p>
  if (!canView) return <p className="p-6 text-red-600" role="alert">You do not have access to Other P&L.</p>

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Other P&L</h1><p className="text-sm text-gray-500 mt-1">Manual non-advertising income and expenses · MYR</p></div>
      {canEdit && <div className="flex gap-2"><Button onClick={() => openEntry('income')}><Plus className="h-4 w-4 mr-1" />Add Income</Button><Button variant="outline" onClick={() => openEntry('expense')}><Plus className="h-4 w-4 mr-1" />Add Expense</Button></div>}
    </div>
    {!canEdit && <p className="text-sm text-gray-500">You can flag missing expense invoices. Entry details require Other P&L editor access.</p>}
    <Card><CardContent className="pt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div><Label htmlFor="other-year">Year</Label><div className="flex items-center rounded-md border bg-white p-1">
        <Button size="icon" variant="ghost" aria-label="Previous year" disabled={Number(year) <= 1} onClick={() => selectYear(String(Number(year) - 1).padStart(4, '0'))}><ChevronLeft className="h-4 w-4" /></Button>
        <select id="other-year" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" value={Number(year)} onChange={event => selectYear(event.target.value.padStart(4, '0'))}>{years.map(value => <option key={value} value={value}>{value}</option>)}</select>
        <Button size="icon" variant="ghost" aria-label="Next year" disabled={Number(year) >= 9999} onClick={() => selectYear(String(Number(year) + 1).padStart(4, '0'))}><ChevronRight className="h-4 w-4" /></Button>
      </div></div>
      <div><Label htmlFor="other-month">Month</Label><select id="other-month" className={selectClass} value={month} onChange={event => selectPeriod(event.target.value)}><option value="all">Overall</option>{MONTHS.map((label, index) => <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>)}</select></div>
      <div><Label htmlFor="other-from">From date</Label><Input id="other-from" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div>
      <div><Label htmlFor="other-to">To date</Label><Input id="other-to" type="date" value={to} onChange={event => setTo(event.target.value)} /></div>
      <p className="col-span-2 lg:col-span-4 text-xs text-gray-500">Date limits apply within the selected year and month.</p>
    </CardContent></Card>
    <div role="tablist" aria-label="Other P&L months" className="flex gap-2 overflow-x-auto pb-1">
      {[{ label: 'Overall', value: 'all' }, ...MONTHS.map((label, index) => ({ label, value: String(index + 1).padStart(2, '0') }))].map(tab =>
        <Button key={tab.value} id={`other-tab-${tab.value}`} role="tab" aria-selected={month === tab.value} aria-controls="other-period" tabIndex={month === tab.value ? 0 : -1}
          onKeyDown={event => {
            const values = ['all', ...MONTHS.map((_, index) => String(index + 1).padStart(2, '0'))]
            const index = values.indexOf(tab.value)
            const target = event.key === 'ArrowRight' ? values[(index + 1) % values.length]
              : event.key === 'ArrowLeft' ? values[(index + values.length - 1) % values.length]
              : event.key === 'Home' ? values[0] : event.key === 'End' ? values[values.length - 1] : null
            if (target) { event.preventDefault(); selectPeriod(target); document.getElementById(`other-tab-${target}`)?.focus() }
          }} size="sm" variant={month === tab.value ? 'default' : 'outline'} className={`shrink-0 ${month === tab.value ? 'bg-red-600 hover:bg-red-700' : ''}`} onClick={() => selectPeriod(tab.value)}>{tab.label}</Button>)}
    </div>
    <p className="text-xs text-gray-500 sm:hidden">Swipe the month tabs to see all months. Scroll tables sideways for more columns.</p>
    <p className="text-xs text-gray-500">Click No invoice to flag a missing expense invoice; click again when received.</p>
    {invoiceError && <p role="alert" className="text-red-600 text-sm">{invoiceError}</p>}
    {invalidRange && <p role="alert" className="text-red-600">From date must be on or before To date.</p>}
    {loadError ? <div role="alert" className="text-red-600">{loadError} <Button variant="outline" onClick={() => void load()}>Retry</Button></div> : loading ? <p className="text-gray-500">Loading Other P&L…</p> : !invalidRange && <>
      <section id="other-period" role="tabpanel" aria-labelledby={`other-tab-${month}`} className="space-y-5">
      <p className="text-sm font-medium">{month === 'all' ? 'Overall' : MONTHS[Number(month) - 1]} {year}{from || to ? ' · Date limits applied' : ''}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[
        ['Total Income', totals.income, yearTotals.income, 'text-green-700'], ['Total Expenses', totals.expenses, yearTotals.expenses, 'text-red-600'], [totals.net < 0 ? 'Net Loss' : 'Net Profit', totals.net, yearTotals.net, totals.net < 0 ? 'text-red-600' : 'text-green-700'],
      ].map(([label, amount, yearly, color]) => <Card key={String(label)}><CardContent className="pt-5"><p className="text-sm text-gray-500">{label}</p><p className={`text-2xl font-bold mt-1 ${color}`}>{money(Number(amount))}</p><p className="mt-1 text-xs text-gray-500">Full {year}: {money(Number(yearly))}</p></CardContent></Card>)}</div>
      {month === 'all' && <Card><CardContent className="pt-5"><h2 className="font-semibold text-lg mb-1">Monthly summary · {year}</h2><p className="text-xs text-gray-500 mb-3">Full year, without date limits. Choose a month to view its entries.</p><div className="overflow-x-auto" tabIndex={0} aria-label="Monthly summary table"><table className="w-full min-w-[440px] text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">Month</th><th className="text-right">Income</th><th className="text-right">Expenses</th><th className="text-right">Net Profit / Loss</th></tr></thead><tbody>{monthlyTotals.map(item => <tr key={item.month} className="border-b"><td><button className="py-2 text-red-600 hover:underline" aria-label={`View ${item.label} ${year}`} onClick={() => selectPeriod(item.month)}>{item.label}</button></td><td className="text-right">{money(item.income)}</td><td className="text-right">{money(item.expenses)}</td><td className={`text-right ${item.net < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(item.net)}</td></tr>)}</tbody><tfoot><tr className="font-semibold"><td className="py-3">Overall</td><td className="text-right">{money(yearTotals.income)}</td><td className="text-right">{money(yearTotals.expenses)}</td><td className="text-right">{money(yearTotals.net)}</td></tr></tfoot></table></div></CardContent></Card>}
      {(['income', 'expense'] as const).map(kind => <Card key={kind}><CardContent className="pt-5">
        <h2 className="font-semibold text-lg mb-3">{kind === 'income' ? 'Income' : 'Expenses'}</h2>
        {filtered.filter(entry => entry.kind === kind).length === 0 ? <p className="text-sm text-gray-500 py-4">No {kind === 'income' ? 'income' : 'expenses'} for this period.</p> : <div className="overflow-x-auto" tabIndex={0} aria-label={`${kind === 'income' ? 'Income' : 'Expenses'} entries table`}><table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3">Date</th><th className="pr-3">Description</th><th className="pr-3">Category</th><th className="text-right pr-3">Amount</th>{kind === 'expense' && <th className="pr-3">Invoice</th>}{canEdit && <th className="text-right">Actions</th>}</tr></thead><tbody>{filtered.filter(entry => entry.kind === kind).map(entry => <tr key={entry.id} className="border-b last:border-0"><td className="py-3 pr-3 whitespace-nowrap">{entry.entry_date}</td><td className="pr-3 break-words max-w-xs">{entry.description}</td><td className="pr-3 break-words max-w-40">{entry.category || '—'}</td><td className="text-right pr-3 whitespace-nowrap">{money(Number(entry.amount))}</td>{kind === 'expense' && <td className="pr-3 whitespace-nowrap"><Button size="sm" variant="outline" className={`min-h-11 bg-transparent ${entry.no_invoice ? 'border-red-600 bg-red-50 text-red-700 hover:bg-red-100' : ''}`} aria-label={`No invoice for ${entry.description}`} aria-pressed={Boolean(entry.no_invoice)} disabled={invoicePending.has(entry.id)} onClick={() => void toggleInvoice(entry)}>No invoice</Button></td>}{canEdit && <td className="text-right whitespace-nowrap"><Button size="sm" variant="ghost" aria-label={`Edit ${entry.description}`} onClick={() => openEntry(kind, entry)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" aria-label={`Delete ${entry.description}`} onClick={() => { setActionError(''); setDeleting(entry) }}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>}</tr>)}</tbody></table></div>}
      </CardContent></Card>)}
      </section>
    </>}
    <Dialog open={Boolean(draft)} onOpenChange={open => { if (!open && !saving) setDraft(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} {draft?.kind === 'income' ? 'Income' : 'Expense'}</DialogTitle></DialogHeader>
      {draft && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        {newExpense ? <fieldset className="space-y-3"><legend className="text-sm font-medium">Expense months · {year}</legend><p className="text-xs text-gray-500">Choose one or more months. Each month gets its own expense entry.</p><div className="grid grid-cols-4 gap-2">{MONTHS.map((label, index) => { const value = String(index + 1).padStart(2, '0'); return <label key={value} className={`flex items-center gap-2 rounded-md border p-2 text-sm ${expenseMonths.includes(value) ? 'border-red-300 bg-red-50' : ''}`}><input type="checkbox" aria-label={`Expense ${label}`} checked={expenseMonths.includes(value)} onChange={event => setExpenseMonths(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{label}</label> })}</div><div><Label htmlFor="expense-day">Day of month</Label><Input id="expense-day" type="number" min="1" max="31" required value={expenseDay || ''} onChange={event => setExpenseDay(Number(event.target.value))} /><p className="text-xs text-gray-500 mt-1">Shorter months use their last valid day. Dates: {expenseDates.join(', ') || 'Choose months and a valid day.'}</p></div></fieldset>
          : <div><Label htmlFor="entry-date">Date</Label><Input id="entry-date" type="date" min="0001-01-01" max="9999-12-31" required value={draft.entry_date} onChange={event => setDraft({ ...draft, entry_date: event.target.value })} />{editingId && <p className="text-xs text-gray-500 mt-1">Changes apply only to this entry.</p>}</div>}
        <div><Label htmlFor="entry-description">Description</Label><Input id="entry-description" required maxLength={300} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></div>
        <div><Label htmlFor="entry-category">Category (optional)</Label><Input id="entry-category" maxLength={100} value={draft.category || ''} onChange={event => setDraft({ ...draft, category: event.target.value })} /></div>
        <div><Label htmlFor="entry-amount">{newExpense ? 'Amount per month (RM)' : 'Amount (RM)'}</Label><Input id="entry-amount" inputMode="decimal" required placeholder="0.00" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></div>
        {newExpense && <p role="status" className="rounded-md bg-red-50 p-3 text-sm">{expenseDates.length} month{expenseDates.length === 1 ? '' : 's'} × {expensePreview === null ? '—' : money(Number(draft.amount))} per month = <strong>{expensePreview === null ? '—' : money(expensePreview)}</strong> total</p>}
        {actionError && <p role="alert" className="text-red-600 text-sm">{actionError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</Button></div>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !saving) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete entry?</DialogTitle></DialogHeader><p className="break-words">Delete “{deleting?.description}” ({money(Number(deleting?.amount || 0))})? This cannot be undone.</p>{actionError && <p role="alert" className="text-red-600">{actionError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={() => void remove()}>{saving ? 'Deleting…' : 'Delete Entry'}</Button></div></DialogContent></Dialog>
  </div>
}
