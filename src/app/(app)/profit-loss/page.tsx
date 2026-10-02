'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRole } from '@/lib/hooks/use-role'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import {
  allocationTotal,
  allocationsMatchTotal,
  calculateProfitLoss,
  costsForPeriod,
  monthStart,
  mytMonthKey,
  revenueForPeriod,
  type CostCategory,
  type ProfitLossCost,
  type ProfitLossData,
} from '@/lib/profit-loss'

const MONTHS = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'], ['05', 'May'], ['06', 'Jun'],
  ['07', 'Jul'], ['08', 'Aug'], ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
] as const

type AllocationDraft = { billboard_id: string; amount: string }
type CostDraft = {
  id: string | null
  cost_date: string
  category_id: string
  description: string
  supplier_payee: string
  amount: string
  remarks: string
  allocations: AllocationDraft[]
}

const EMPTY_DATA: ProfitLossData = { billboards: [], revenue: [], categories: [], costs: [] }

function money(value: number) {
  return `RM ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function emptyCost(today: string, categoryId = ''): CostDraft {
  return {
    id: null,
    cost_date: today,
    category_id: categoryId,
    description: '',
    supplier_payee: '',
    amount: '',
    remarks: '',
    allocations: [{ billboard_id: '', amount: '' }],
  }
}

export default function ProfitLossPage() {
  const supabase = useMemo(() => createClient(), [])
  const { isOwner } = useRole()
  const currentMonth = mytMonthKey()
  const currentYear = Number(currentMonth.slice(0, 4))
  const todayMYT = `${currentMonth}-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit' }).format(new Date())}`
  const [data, setData] = useState<ProfitLossData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth.slice(5, 7))
  const [billboardId, setBillboardId] = useState('all')
  const [draggingPayment, setDraggingPayment] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [costOpen, setCostOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [costDraft, setCostDraft] = useState<CostDraft>(emptyCost(todayMYT))
  const [categoryName, setCategoryName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data: result, error } = await supabase.rpc('get_profit_loss_data')
    if (error || !result) {
      setLoadError(error?.message || 'Unable to load P&L data.')
    } else {
      setData(result as ProfitLossData)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const years = useMemo(() => {
    const values = new Set<number>([currentYear])
    data.revenue.forEach(item => values.add(Number(item.reporting_month.slice(0, 4))))
    data.costs.forEach(item => values.add(Number(item.cost_date.slice(0, 4))))
    return [...values].filter(Number.isFinite).sort((a, b) => b - a)
  }, [currentYear, data.costs, data.revenue])

  const periodRevenue = useMemo(() => revenueForPeriod(data.revenue, year, month, billboardId), [billboardId, data.revenue, month, year])
  const periodCosts = useMemo(() => costsForPeriod(data.costs, year, month, billboardId), [billboardId, data.costs, month, year])
  const periodTotals = useMemo(() => calculateProfitLoss(periodRevenue, periodCosts), [periodCosts, periodRevenue])
  const yearRevenue = useMemo(() => revenueForPeriod(data.revenue, year, 'all', billboardId), [billboardId, data.revenue, year])
  const yearCosts = useMemo(() => costsForPeriod(data.costs, year, 'all', billboardId), [billboardId, data.costs, year])
  const yearTotals = useMemo(() => calculateProfitLoss(yearRevenue, yearCosts), [yearCosts, yearRevenue])
  const activeCategories = data.categories.filter(category => category.is_active)
  const allocationDraftTotal = allocationTotal(costDraft.allocations.map(item => ({ amount: Number(item.amount) || 0 })))
  const draftAmount = Number(costDraft.amount)
  const validAllocations = allocationsMatchTotal(draftAmount, costDraft.allocations.map(item => ({ amount: Number(item.amount) || 0 })))
  const duplicateAllocations = new Set(costDraft.allocations.map(item => item.billboard_id)).size !== costDraft.allocations.length

  async function assignRevenue(paymentId: string, targetMonth: string) {
    if (!isOwner) return
    setSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('set_profit_loss_revenue_month', {
      p_payment_id: paymentId,
      p_reporting_month: monthStart(targetMonth),
    })
    if (error) {
      setActionError(error.message)
    } else {
      setData(current => ({
        ...current,
        revenue: current.revenue.map(item => item.payment_id === paymentId
          ? { ...item, reporting_month: targetMonth, has_persisted_assignment: true }
          : item),
      }))
    }
    setDraggingPayment(null)
    setSaving(false)
  }

  function openNewCost() {
    setCostDraft(emptyCost(todayMYT, activeCategories[0]?.id || ''))
    setActionError('')
    setCostOpen(true)
  }

  function openEditCost(cost: ProfitLossCost) {
    setCostDraft({
      id: cost.id,
      cost_date: cost.cost_date,
      category_id: cost.category_id,
      description: cost.description,
      supplier_payee: cost.supplier_payee,
      amount: String(cost.amount),
      remarks: cost.remarks || '',
      allocations: cost.allocations.map(allocation => ({ billboard_id: allocation.billboard_id || '', amount: String(allocation.amount) })),
    })
    setActionError('')
    setCostOpen(true)
  }

  function updateAllocation(index: number, patch: Partial<AllocationDraft>) {
    setCostDraft(current => ({
      ...current,
      allocations: current.allocations.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, ...patch } : allocation),
    }))
  }

  async function saveCost(event: React.FormEvent) {
    event.preventDefault()
    if (!isOwner || !validAllocations || duplicateAllocations || !costDraft.category_id) return
    setSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('save_profit_loss_cost', {
      p_cost_id: costDraft.id,
      p_cost_date: costDraft.cost_date,
      p_category_id: costDraft.category_id,
      p_description: costDraft.description,
      p_supplier_payee: costDraft.supplier_payee,
      p_amount: draftAmount,
      p_remarks: costDraft.remarks || null,
      p_allocations: costDraft.allocations.map(allocation => ({ billboard_id: allocation.billboard_id || null, amount: Number(allocation.amount) })),
    })
    if (error) {
      setActionError(error.message)
    } else {
      setCostOpen(false)
      await load()
    }
    setSaving(false)
  }

  async function deleteCost(costId: string) {
    if (!isOwner || !window.confirm('Delete this cost? This cannot be undone.')) return
    setSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('delete_profit_loss_cost', { p_cost_id: costId })
    if (error) setActionError(error.message)
    else setData(current => ({ ...current, costs: current.costs.filter(cost => cost.id !== costId) }))
    setSaving(false)
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!isOwner || !categoryName.trim()) return
    setSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('save_profit_loss_category', {
      p_category_id: null,
      p_name: categoryName.trim(),
      p_is_active: true,
    })
    if (error) setActionError(error.message)
    else {
      setCategoryName('')
      await load()
    }
    setSaving(false)
  }

  async function toggleCategory(category: CostCategory) {
    if (!isOwner) return
    setSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('save_profit_loss_category', {
      p_category_id: category.id,
      p_name: category.name,
      p_is_active: !category.is_active,
    })
    if (error) setActionError(error.message)
    else setData(current => ({
      ...current,
      categories: current.categories.map(item => item.id === category.id ? { ...item, is_active: !item.is_active } : item),
    }))
    setSaving(false)
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-red-600" /></div>
  if (loadError) return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>

  const selectedPeriod = month === 'all' ? `${year} full year` : `${MONTHS.find(item => item[0] === month)?.[1]} ${year}`
  const selectedScope = billboardId === 'all' ? 'Company' : data.billboards.find(item => item.id === billboardId)?.name || 'Billboard'
  const profitState = periodTotals.net >= 0 ? 'Profit' : 'Loss'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit &amp; Loss</h1>
          <p className="text-xs text-gray-500">Paid revenue and entered costs · MYT reporting</p>
        </div>
        {isOwner && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCategoryOpen(true)}><Tags className="mr-1 h-4 w-4" /> Categories</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={openNewCost}><Plus className="mr-1 h-4 w-4" /> Add Cost</Button>
          </div>
        )}
      </div>

      {actionError && <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><span>{actionError}</span><button aria-label="Dismiss error" onClick={() => setActionError('')}><X className="h-4 w-4" /></button></div>}

      <section aria-label="P&L filters" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="flex items-center justify-between rounded-md border bg-white p-1">
            <Button size="icon" variant="ghost" aria-label="Previous year" onClick={() => setYear(value => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <select aria-label="Year" value={year} onChange={event => setYear(Number(event.target.value))} className="bg-transparent text-sm font-semibold outline-none">
              {years.includes(year) ? null : <option value={year}>{year}</option>}
              {years.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <Button size="icon" variant="ghost" aria-label="Next year" onClick={() => setYear(value => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <select aria-label="Month" value={month} onChange={event => setMonth(event.target.value)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">
            <option value="all">All months</option>
            {MONTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Billboard filter">
          <Button size="sm" variant={billboardId === 'all' ? 'default' : 'outline'} onClick={() => setBillboardId('all')} className={billboardId === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}>All company</Button>
          {data.billboards.map(billboard => (
            <Button key={billboard.id} size="sm" variant={billboardId === billboard.id ? 'default' : 'outline'} onClick={() => setBillboardId(billboard.id)} className={`whitespace-nowrap text-xs ${billboardId === billboard.id ? 'bg-red-600 hover:bg-red-700' : ''}`}>{billboard.name}</Button>
          ))}
        </div>
      </section>

      <section aria-label="P&L summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Paid Revenue', value: periodTotals.revenue, yearly: yearTotals.revenue, tone: 'border-green-200 bg-green-50 text-green-800' },
          { label: 'Total Cost', value: periodTotals.cost, yearly: yearTotals.cost, tone: 'border-gray-200 bg-white text-gray-900' },
          { label: `Net ${profitState}`, value: periodTotals.net, yearly: yearTotals.net, tone: periodTotals.net >= 0 ? 'border-green-200 bg-white text-green-800' : 'border-red-200 bg-red-50 text-red-800' },
          { label: 'Profit Margin', value: periodTotals.margin, yearly: yearTotals.margin, tone: periodTotals.net >= 0 ? 'border-green-200 bg-white text-green-800' : 'border-red-200 bg-red-50 text-red-800', percent: true },
        ].map(item => (
          <Card key={item.label} className={item.tone}>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-medium text-gray-600">{item.label}</p>
              <p className="mt-1 text-lg font-bold sm:text-xl">{item.percent ? (item.value == null ? 'N/A' : `${item.value.toFixed(1)}%`) : money(item.value || 0)}</p>
              <p className="mt-1 text-[10px] text-gray-500">Full {year}: {item.percent ? (item.yearly == null ? 'N/A' : `${item.yearly.toFixed(1)}%`) : money(item.yearly || 0)}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">{selectedScope}</span> · {selectedPeriod}. Billboard views include only direct allocations; General overhead appears only in All company.</p>

      {isOwner && (
        <section aria-label="Revenue reporting months" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Revenue reporting months</h2>
            <span className="text-[10px] text-gray-500">Drag paid rows or use Move to month</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MONTHS.map(([monthValue, label]) => {
              const target = `${year}-${monthValue}`
              return (
                <div
                  key={target}
                  data-testid={`month-drop-${target}`}
                  onDragOver={event => { if (draggingPayment) event.preventDefault() }}
                  onDrop={event => { event.preventDefault(); if (draggingPayment) assignRevenue(draggingPayment, target) }}
                  className={`min-w-[76px] rounded-md border px-2 py-2 text-center text-xs ${draggingPayment ? 'border-red-300 bg-red-50' : 'bg-white'} ${month === monthValue ? 'ring-1 ring-red-500' : ''}`}
                >
                  <p className="font-medium">{label}</p>
                  <p className="text-[10px] text-gray-500">{revenueForPeriod(data.revenue, year, monthValue, billboardId).length} paid</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="paid-revenue-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="paid-revenue-heading" className="text-base font-semibold">Paid Revenue</h2>
          <Badge className="bg-green-100 text-green-800">{periodRevenue.length} paid</Badge>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white">
          {periodRevenue.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No completed payments in this reporting period.</p>
          ) : periodRevenue.map(item => (
            <div
              key={item.payment_id}
              data-testid={`revenue-${item.payment_id}`}
              draggable={isOwner && !saving}
              onDragStart={event => { setDraggingPayment(item.payment_id); event.dataTransfer.setData('text/plain', item.payment_id) }}
              onDragEnd={() => setDraggingPayment(null)}
              className="grid gap-2 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[24px_minmax(110px,0.7fr)_minmax(180px,1.3fr)_minmax(170px,1fr)_120px_160px] sm:items-center"
            >
              <GripVertical className={`hidden h-4 w-4 sm:block ${isOwner ? 'text-gray-400' : 'text-gray-200'}`} aria-hidden="true" />
              <div>
                {item.invoice_number ? <Link className="text-sm font-semibold text-blue-700 hover:underline" href={`/accounts?invoice=${encodeURIComponent(item.invoice_number)}`}>{item.invoice_number}</Link> : <span className="text-sm font-medium text-gray-500">No invoice number</span>}
                {!item.has_persisted_assignment && <p className="text-[10px] text-amber-700">Existing paid · Oct 2026 fallback</p>}
              </div>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{item.client_name}</p><p className="truncate text-xs text-gray-500">{item.brand_name || 'No brand'}</p></div>
              <div><p className="text-xs font-medium">{item.billboard_name}</p><p className="text-[10px] text-gray-500">{item.billboard_location}</p></div>
              <p className="text-sm font-bold text-green-700">{money(item.amount)}</p>
              {isOwner ? (
                <select aria-label={`Move ${item.invoice_number || item.client_name} to month`} value={item.reporting_month} disabled={saving} onChange={event => assignRevenue(item.payment_id, event.target.value)} className="h-8 rounded-md border bg-white px-2 text-xs">
                  {MONTHS.map(([monthValue, label]) => <option key={`${year}-${monthValue}`} value={`${year}-${monthValue}`}>{label} {year}</option>)}
                  {!item.reporting_month.startsWith(String(year)) && <option value={item.reporting_month}>{item.reporting_month}</option>}
                </select>
              ) : <span className="text-xs text-gray-500">{item.reporting_month}</span>}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="costs-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-2"><h2 id="costs-heading" className="text-base font-semibold">Costs</h2><Badge variant="secondary">{periodCosts.length} entries</Badge></div>
        <div className="overflow-hidden rounded-lg border bg-white">
          {periodCosts.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-500">No costs in this reporting period.</p> : periodCosts.map(cost => (
            <div key={cost.id} data-testid={`cost-${cost.id}`} className="grid gap-2 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[110px_130px_minmax(180px,1fr)_minmax(140px,0.8fr)_130px_auto] sm:items-center">
              <p className="text-xs font-medium">{cost.cost_date}</p>
              <Badge variant="outline" className="w-fit text-[10px]">{cost.category_name}</Badge>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{cost.description}</p><p className="truncate text-xs text-gray-500">{cost.remarks || 'No remarks'}</p></div>
              <p className="text-xs">{cost.supplier_payee}</p>
              <div><p className="text-sm font-bold">{money(cost.reporting_amount)}</p>{billboardId !== 'all' && Number(cost.reporting_amount) !== Number(cost.amount) && <p className="text-[10px] text-gray-500">of {money(cost.amount)}</p>}</div>
              {isOwner && <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${cost.description}`} onClick={() => openEditCost(cost)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${cost.description}`} onClick={() => deleteCost(cost.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>}
            </div>
          ))}
        </div>
      </section>

      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{costDraft.id ? 'Edit Cost' : 'Add Cost'}</DialogTitle></DialogHeader>
          <form onSubmit={saveCost} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="cost-date">Date</Label><Input id="cost-date" type="date" required value={costDraft.cost_date} onChange={event => setCostDraft(current => ({ ...current, cost_date: event.target.value }))} /></div>
              <div><Label htmlFor="cost-category">Category</Label><select id="cost-category" required value={costDraft.category_id} onChange={event => setCostDraft(current => ({ ...current, category_id: event.target.value }))} className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="">Select category</option>{data.categories.filter(category => category.is_active || category.id === costDraft.category_id).map(category => <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' (Inactive)'}</option>)}</select></div>
              <div><Label htmlFor="cost-description">Description</Label><Input id="cost-description" required maxLength={300} value={costDraft.description} onChange={event => setCostDraft(current => ({ ...current, description: event.target.value }))} /></div>
              <div><Label htmlFor="cost-supplier">Supplier / Payee</Label><Input id="cost-supplier" required maxLength={200} value={costDraft.supplier_payee} onChange={event => setCostDraft(current => ({ ...current, supplier_payee: event.target.value }))} /></div>
              <div><Label htmlFor="cost-amount">Total Amount (RM)</Label><Input id="cost-amount" type="number" required min="0.01" step="0.01" value={costDraft.amount} onChange={event => setCostDraft(current => ({ ...current, amount: event.target.value }))} /></div>
              <div className="sm:col-span-2"><Label htmlFor="cost-remarks">Remarks</Label><Textarea id="cost-remarks" value={costDraft.remarks} onChange={event => setCostDraft(current => ({ ...current, remarks: event.target.value }))} /></div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2"><Label>Billboard Allocation</Label><Button type="button" size="sm" variant="outline" onClick={() => setCostDraft(current => ({ ...current, allocations: [...current.allocations, { billboard_id: '', amount: '' }] }))}><Plus className="mr-1 h-3 w-3" /> Split</Button></div>
              {costDraft.allocations.map((allocation, index) => (
                <div key={index} className="grid grid-cols-[1fr_120px_36px] gap-2">
                  <select aria-label={`Allocation ${index + 1} destination`} value={allocation.billboard_id} onChange={event => updateAllocation(index, { billboard_id: event.target.value })} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="">General / Company Overhead</option>{data.billboards.map(billboard => <option key={billboard.id} value={billboard.id}>{billboard.name}</option>)}</select>
                  <Input aria-label={`Allocation ${index + 1} amount`} type="number" required min="0.01" step="0.01" value={allocation.amount} onChange={event => updateAllocation(index, { amount: event.target.value })} />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove allocation ${index + 1}`} disabled={costDraft.allocations.length === 1} onClick={() => setCostDraft(current => ({ ...current, allocations: current.allocations.filter((_, allocationIndex) => allocationIndex !== index) }))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <div className={`flex justify-between rounded-md px-3 py-2 text-xs ${validAllocations && !duplicateAllocations ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}><span>Allocated {money(allocationDraftTotal)} of {money(draftAmount || 0)}</span><span>{duplicateAllocations ? 'Each destination can appear once' : validAllocations ? 'Balanced' : 'Must match exactly'}</span></div>
            </div>
            {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button><Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={saving || !validAllocations || duplicateAllocations}>{saving ? 'Saving...' : 'Save Cost'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cost Categories</DialogTitle></DialogHeader>
          <form onSubmit={createCategory} className="flex gap-2"><Input aria-label="New category name" maxLength={100} placeholder="New category" value={categoryName} onChange={event => setCategoryName(event.target.value)} /><Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={saving || !categoryName.trim()}><Plus className="mr-1 h-4 w-4" /> Add</Button></form>
          <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {data.categories.length === 0 ? <p className="p-4 text-center text-sm text-gray-500">No categories yet.</p> : data.categories.map(category => <div key={category.id} className="flex items-center justify-between gap-2 px-3 py-2"><div><p className="text-sm font-medium">{category.name}</p><p className="text-[10px] text-gray-500">{category.is_active ? 'Active' : 'Inactive · retained for history'}</p></div><Button size="sm" variant="outline" onClick={() => toggleCategory(category)} disabled={saving}>{category.is_active ? 'Deactivate' : 'Reactivate'}</Button></div>)}
          </div>
          {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
