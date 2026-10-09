'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRole } from '@/lib/hooks/use-role'
import { canAccessPage } from '@/lib/page-access'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { filterOtherEntries, otherTotals, validateOtherEntry, type OtherDraft, type OtherEntry } from '@/lib/other-profit-loss'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (amount: number) => `RM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const selectClass = 'h-10 rounded-md border border-gray-300 bg-white px-3 text-sm w-full'
const todayMYT = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export default function OtherProfitLossPage() {
  const supabase = useMemo(() => createClient(), [])
  const { isOwner, profile, loading: profileLoading } = useRole()
  const canView = isOwner || (profile?.approved === true && canAccessPage(profile.role, profile.allowed_pages, '/other-profit-loss'))
  const today = todayMYT()
  const [year, setYear] = useState(today.slice(0, 4))
  const [month, setMonth] = useState(today.slice(5, 7))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<OtherEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<OtherDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<OtherEntry | null>(null)

  const requestId = useRef(0)
  const load = useCallback(async () => {
    const activeRequest = ++requestId.current
    setLoading(true)
    setLoadError('')
    try {
      const rows: OtherEntry[] = []
      // Fetch every row for the selected year, avoiding Supabase's default row limit.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('other_profit_loss_entries').select('id, entry_date, kind, description, category, amount')
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

  useEffect(() => { if (!profileLoading && canView) void load() }, [profileLoading, canView, load])
  const invalidRange = Boolean(from && to && from > to)
  const filtered = filterOtherEntries(entries, year, month, from, to)
  const totals = otherTotals(filtered)

  function openEntry(kind: 'income' | 'expense', entry?: OtherEntry) {
    if (!isOwner) return
    setActionError('')
    setEditingId(entry?.id || null)
    setDraft(entry ? { ...entry, amount: String(entry.amount) } : {
      entry_date: year === today.slice(0, 4) && month === today.slice(5, 7) ? today : `${year}-${month === 'all' ? '01' : month}-01`,
      kind, description: '', category: '', amount: '',
    })
  }

  async function save() {
    if (!isOwner || !draft || saving) return
    const validation = validateOtherEntry(draft)
    if (validation) { setActionError(validation); return }
    setSaving(true)
    setActionError('')
    try {
      const payload = { entry_date: draft.entry_date, kind: draft.kind, description: draft.description.trim(), category: draft.category?.trim() || null, amount: Number(draft.amount) }
      const query = editingId ? supabase.from('other_profit_loss_entries').update(payload).eq('id', editingId) : supabase.from('other_profit_loss_entries').insert(payload)
      const { data, error } = await query.select('id').single()
      if (error || !data) throw error || new Error('Entry was not saved. Check your permissions and retry.')
      setDraft(null)
      setYear(payload.entry_date.slice(0, 4))
      setMonth(payload.entry_date.slice(5, 7))
      setFrom(''); setTo('')
      if (payload.entry_date.slice(0, 4) === year) await load()
    } catch (error) {
      setActionError((error as { message?: string }).message || 'Unable to save entry.')
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!isOwner || !deleting || saving) return
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
      {isOwner && <div className="flex gap-2"><Button onClick={() => openEntry('income')}><Plus className="h-4 w-4 mr-1" />Add Income</Button><Button variant="outline" onClick={() => openEntry('expense')}><Plus className="h-4 w-4 mr-1" />Add Expense</Button></div>}
    </div>
    {!isOwner && <p className="text-sm text-gray-500">View only. Entries are managed by the owner.</p>}
    <Card><CardContent className="pt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div><Label htmlFor="other-year">Year</Label><Input id="other-year" type="number" min="1" max="9999" value={Number(year)} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 9999) setYear(String(value).padStart(4, '0')) }} /></div>
      <div><Label htmlFor="other-month">Month</Label><select id="other-month" className={selectClass} value={month} onChange={event => setMonth(event.target.value)}><option value="all">Full year</option>{MONTHS.map((label, index) => <option key={label} value={String(index + 1).padStart(2, '0')}>{label}</option>)}</select></div>
      <div><Label htmlFor="other-from">From date</Label><Input id="other-from" type="date" value={from} onChange={event => setFrom(event.target.value)} /></div>
      <div><Label htmlFor="other-to">To date</Label><Input id="other-to" type="date" value={to} onChange={event => setTo(event.target.value)} /></div>
      <p className="col-span-2 lg:col-span-4 text-xs text-gray-500">Date limits apply within the selected year and month.</p>
    </CardContent></Card>
    {invalidRange && <p role="alert" className="text-red-600">From date must be on or before To date.</p>}
    {loadError ? <div role="alert" className="text-red-600">{loadError} <Button variant="outline" onClick={() => void load()}>Retry</Button></div> : loading ? <p className="text-gray-500">Loading Other P&L…</p> : !invalidRange && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[
        ['Total Income', totals.income, 'text-green-700'], ['Total Expenses', totals.expenses, 'text-red-600'], [totals.net < 0 ? 'Net Loss' : 'Net Profit', totals.net, totals.net < 0 ? 'text-red-600' : 'text-green-700'],
      ].map(([label, amount, color]) => <Card key={String(label)}><CardContent className="pt-5"><p className="text-sm text-gray-500">{label}</p><p className={`text-2xl font-bold mt-1 ${color}`}>{money(Number(amount))}</p></CardContent></Card>)}</div>
      {(['income', 'expense'] as const).map(kind => <Card key={kind}><CardContent className="pt-5">
        <h2 className="font-semibold text-lg mb-3">{kind === 'income' ? 'Income' : 'Expenses'}</h2>
        {filtered.filter(entry => entry.kind === kind).length === 0 ? <p className="text-sm text-gray-500 py-4">No {kind === 'income' ? 'income' : 'expenses'} for this period.</p> : <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]"><thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3">Date</th><th className="pr-3">Description</th><th className="pr-3">Category</th><th className="text-right pr-3">Amount</th>{isOwner && <th className="text-right">Actions</th>}</tr></thead><tbody>{filtered.filter(entry => entry.kind === kind).map(entry => <tr key={entry.id} className="border-b last:border-0"><td className="py-3 pr-3 whitespace-nowrap">{entry.entry_date}</td><td className="pr-3 break-words max-w-xs">{entry.description}</td><td className="pr-3 break-words max-w-40">{entry.category || '—'}</td><td className="text-right pr-3 whitespace-nowrap">{money(Number(entry.amount))}</td>{isOwner && <td className="text-right whitespace-nowrap"><Button size="sm" variant="ghost" aria-label={`Edit ${entry.description}`} onClick={() => openEntry(kind, entry)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="ghost" aria-label={`Delete ${entry.description}`} onClick={() => { setActionError(''); setDeleting(entry) }}><Trash2 className="h-4 w-4 text-red-600" /></Button></td>}</tr>)}</tbody></table></div>}
      </CardContent></Card>)}
    </>}
    <Dialog open={Boolean(draft)} onOpenChange={open => { if (!open && !saving) setDraft(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} {draft?.kind === 'income' ? 'Income' : 'Expense'}</DialogTitle></DialogHeader>
      {draft && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <div><Label htmlFor="entry-date">Date</Label><Input id="entry-date" type="date" min="0001-01-01" max="9999-12-31" required value={draft.entry_date} onChange={event => setDraft({ ...draft, entry_date: event.target.value })} /></div>
        <div><Label htmlFor="entry-description">Description</Label><Input id="entry-description" required maxLength={300} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></div>
        <div><Label htmlFor="entry-category">Category (optional)</Label><Input id="entry-category" maxLength={100} value={draft.category || ''} onChange={event => setDraft({ ...draft, category: event.target.value })} /></div>
        <div><Label htmlFor="entry-amount">Amount (RM)</Label><Input id="entry-amount" inputMode="decimal" required placeholder="0.00" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></div>
        {actionError && <p role="alert" className="text-red-600 text-sm">{actionError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Entry'}</Button></div>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !saving) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Delete entry?</DialogTitle></DialogHeader><p className="break-words">Delete “{deleting?.description}” ({money(Number(deleting?.amount || 0))})? This cannot be undone.</p>{actionError && <p role="alert" className="text-red-600">{actionError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={() => void remove()}>{saving ? 'Deleting…' : 'Delete Entry'}</Button></div></DialogContent></Dialog>
  </div>
}
