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
import { ChevronLeft, ChevronRight, GripVertical, Lock, LockOpen, Pencil, Plus, Search, Tags, Trash2, X } from 'lucide-react'
import {
  allocationTotal,
  allocationsMatchTotal,
  calculateProfitLoss,
  costsForPeriod,
  monthStart,
  mytMonthKey,
  profitLossYears,
  revenueForPeriod,
  searchRevenueForYear,
  UNKNOWN_REVENUE_MONTH,
  type CostCategory,
  type ProfitLossCost,
  type ProfitLossData,
  type RevenueSearchField,
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
  reporting_months: string[]
  allocations: AllocationDraft[]
}

const EMPTY_DATA: ProfitLossData = { billboards: [], revenue: [], categories: [], costs: [], locks: [] }

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
    reporting_months: [today.slice(0, 7)],
    allocations: [{ billboard_id: '', amount: '' }],
  }
}

export default function ProfitLossPage() {
  const supabase = useMemo(() => createClient(), [])
  const { canEditProfitLoss } = useRole()
  const currentMonth = mytMonthKey()
  const currentYear = Number(currentMonth.slice(0, 4))
  const todayMYT = `${currentMonth}-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit' }).format(new Date())}`
  const [data, setData] = useState<ProfitLossData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth.slice(5, 7))
  const [billboardId, setBillboardId] = useState('all')
  const [revenueSearch, setRevenueSearch] = useState('')
  const [revenueSearchField, setRevenueSearchField] = useState<RevenueSearchField>('all')
  const [draggingRevenue, setDraggingRevenue] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [costOpen, setCostOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [costDraft, setCostDraft] = useState<CostDraft>(emptyCost(todayMYT))
  const [categoryName, setCategoryName] = useState('')
  const [unlockMonth, setUnlockMonth] = useState<string | null>(null)
  const [unlockCode, setUnlockCode] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const { data: result, error } = await supabase.rpc('get_profit_loss_data')
    if (error || !result) {
      setLoadError(error?.message || 'Unable to load P&L data.')
    } else {
      const loaded = result as ProfitLossData
      setData({ ...loaded, locks: loaded.locks || [] })
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const years = useMemo(() => {
    return profitLossYears(data.revenue, data.costs, currentYear)
  }, [currentYear, data.costs, data.revenue])
  const moveYears = useMemo(() => {
    const values = new Set([...years, year, currentYear - 1, currentYear, currentYear + 1])
    data.revenue.forEach(item => values.add(Number(item.billing_month.slice(0, 4))))
    return [...values].filter(Number.isFinite).sort((a, b) => b - a)
  }, [currentYear, data.revenue, year, years])

  const periodRevenue = useMemo(() => revenueForPeriod(data.revenue, year, month, billboardId), [billboardId, data.revenue, month, year])
  const searchedRevenue = useMemo(
    () => searchRevenueForYear(data.revenue, year, billboardId, revenueSearch, revenueSearchField),
    [billboardId, data.revenue, revenueSearch, revenueSearchField, year],
  )
  const displayedRevenue = revenueSearch.trim() ? searchedRevenue : periodRevenue
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
  const selectedMonthKey = month === 'all' ? null : `${year}-${month}`
  const selectedMonthLocked = selectedMonthKey ? data.locks.includes(selectedMonthKey) : false
  const draftCostYear = costDraft.cost_date.slice(0, 4)
  const draftReportingMonths = costDraft.reporting_months.length ? costDraft.reporting_months : [costDraft.cost_date.slice(0, 7)]
  const draftHasLockedMonth = draftReportingMonths.some(reportingMonth => data.locks.includes(reportingMonth))

  async function lockMonth(monthKey: string) {
    if (!canEditProfitLoss || !window.confirm(`Lock ${monthKey}? Revenue placement and costs will become read-only.`)) return
    setSaving(true); setActionError('')
    const { error } = await supabase.rpc('lock_profit_loss_month', { p_reporting_month: monthStart(monthKey) })
    if (error) setActionError(error.message)
    else setData(current => ({ ...current, locks: [...new Set([...current.locks, monthKey])].sort() }))
    setSaving(false)
  }

  async function unlockLockedMonth(event: React.FormEvent) {
    event.preventDefault()
    if (!canEditProfitLoss || !unlockMonth) return
    setSaving(true); setActionError('')
    const { error } = await supabase.rpc('unlock_profit_loss_month', { p_reporting_month: monthStart(unlockMonth), p_unlock_code: unlockCode })
    if (error) setActionError(error.message)
    else {
      setData(current => ({ ...current, locks: current.locks.filter(value => value !== unlockMonth) }))
      setUnlockMonth(null)
      setUnlockCode('')
    }
    setSaving(false)
  }

  async function assignRevenue(revenueId: string, targetMonth: string) {
    if (!canEditProfitLoss) return
    const revenue = data.revenue.find(item => item.revenue_id === revenueId)
    if (!revenue) return
    setSaving(true)
    setActionError('')

    if (targetMonth === UNKNOWN_REVENUE_MONTH) {
      if (!revenue.payment_id) {
        setActionError('This revenue is already Unknown.')
        setDraggingRevenue(null)
        setSaving(false)
        return
      }
      const { error } = await supabase.rpc('unassign_profit_loss_revenue', { p_payment_id: revenue.payment_id })
      if (error) setActionError(error.message)
      else await load()
      setDraggingRevenue(null)
      setSaving(false)
      return
    }

    const { data: paymentId, error } = await supabase.rpc('assign_profit_loss_revenue', {
      p_booking_id: revenue.booking_id,
      p_billing_month: revenue.billing_month,
      p_reporting_month: monthStart(targetMonth),
    })
    if (error) {
      setActionError(error.message)
    } else {
      setData(current => ({
        ...current,
        revenue: current.revenue.map(item => item.revenue_id === revenueId
          ? { ...item, payment_id: String(paymentId || item.payment_id || ''), reporting_month: targetMonth, source: 'payment' as const, has_persisted_assignment: true }
          : item),
      }))
    }
    setDraggingRevenue(null)
    setSaving(false)
  }

  function openNewCost() {
    if (selectedMonthLocked) return
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
      reporting_months: cost.reporting_months?.length ? cost.reporting_months : [cost.cost_date.slice(0, 7)],
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

  function setCostDate(costDate: string) {
    const nextYear = costDate.slice(0, 4)
    setCostDraft(current => ({
      ...current,
      cost_date: costDate,
      reporting_months: current.reporting_months.map(reportingMonth => `${nextYear}-${reportingMonth.slice(5, 7)}`),
    }))
  }

  function toggleCostMonth(monthValue: string) {
    const reportingMonth = `${draftCostYear}-${monthValue}`
    if (data.locks.includes(reportingMonth)) return
    setCostDraft(current => {
      const selected = current.reporting_months.includes(reportingMonth)
      if (selected && current.reporting_months.length === 1) return current
      return {
        ...current,
        reporting_months: selected
          ? current.reporting_months.filter(value => value !== reportingMonth)
          : [...current.reporting_months, reportingMonth].sort(),
      }
    })
  }

  async function saveCost(event: React.FormEvent) {
    event.preventDefault()
    if (!canEditProfitLoss || !validAllocations || duplicateAllocations || !costDraft.category_id || draftReportingMonths.length === 0 || draftHasLockedMonth) return
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
      p_reporting_months: draftReportingMonths.map(monthStart),
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
    if (!canEditProfitLoss || !window.confirm('Delete this cost? This cannot be undone.')) return
    setSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('delete_profit_loss_cost', { p_cost_id: costId })
    if (error) setActionError(error.message)
    else setData(current => ({ ...current, costs: current.costs.filter(cost => cost.id !== costId) }))
    setSaving(false)
  }

  async function createCategory(event: React.FormEvent) {
    event.preventDefault()
    if (!canEditProfitLoss || !categoryName.trim()) return
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
    if (!canEditProfitLoss) return
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

  const selectedPeriod = month === 'all' ? `${year} full year` : month === UNKNOWN_REVENUE_MONTH ? `Unknown ${year}` : `${MONTHS.find(item => item[0] === month)?.[1]} ${year}`
  const selectedScope = billboardId === 'all' ? 'Company' : data.billboards.find(item => item.id === billboardId)?.name || 'Billboard'
  const profitState = periodTotals.net >= 0 ? 'Profit' : 'Loss'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit &amp; Loss</h1>
          <p className="text-xs text-gray-500">Paid revenue and entered costs · MYT reporting</p>
        </div>
        {canEditProfitLoss && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCategoryOpen(true)}><Tags className="mr-1 h-4 w-4" /> Categories</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={openNewCost} disabled={selectedMonthLocked}><Plus className="mr-1 h-4 w-4" /> Add Cost</Button>
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
            <option value={UNKNOWN_REVENUE_MONTH}>Unknown</option>
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

      {canEditProfitLoss && (
        <section aria-label="Revenue reporting months" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Revenue reporting months</h2>
            <span className="text-[10px] text-gray-500">Drag paid rows or use Move to month</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input
                aria-label="Search revenue"
                value={revenueSearch}
                onChange={event => setRevenueSearch(event.target.value)}
                placeholder="Search client, brand, invoice, month or billboard"
                className="h-10 pl-9 pr-9"
              />
              {revenueSearch && <button type="button" aria-label="Clear revenue search" title="Clear search" onClick={() => setRevenueSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>}
            </div>
            <select aria-label="Search revenue by" value={revenueSearchField} onChange={event => setRevenueSearchField(event.target.value as RevenueSearchField)} className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm">
              <option value="all">All fields</option>
              <option value="client">Client</option>
              <option value="brand">Brand</option>
              <option value="invoice">Invoice</option>
              <option value="billing_month">Billing month</option>
              <option value="billboard">Billboard</option>
            </select>
            {revenueSearch.trim() && <Badge variant="outline" className="h-10 justify-center whitespace-nowrap px-3">{searchedRevenue.length} result{searchedRevenue.length === 1 ? '' : 's'}</Badge>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MONTHS.map(([monthValue, label]) => {
              const target = `${year}-${monthValue}`
              const locked = data.locks.includes(target)
              return (
                <div
                  key={target}
                  data-testid={`month-drop-${target}`}
                  onDragOver={event => { if (draggingRevenue && !locked) event.preventDefault() }}
                  onDrop={event => { event.preventDefault(); if (draggingRevenue && !locked) assignRevenue(draggingRevenue, target) }}
                  className={`min-w-[76px] rounded-md border px-2 py-2 text-center text-xs ${draggingRevenue ? 'border-red-300 bg-red-50' : 'bg-white'} ${month === monthValue ? 'ring-1 ring-red-500' : ''}`}
                >
                  <div className="flex items-center justify-center gap-1"><p className="font-medium">{label}</p><button type="button" disabled={saving} className="rounded p-0.5 text-gray-600 hover:bg-gray-100" aria-label={`${locked ? 'Unlock' : 'Lock'} ${label} ${year}`} title={`${locked ? 'Unlock' : 'Lock'} ${label} ${year}`} onClick={() => locked ? (setUnlockMonth(target), setUnlockCode(''), setActionError('')) : void lockMonth(target)}>{locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}</button></div>
                  <p className="text-[10px] text-gray-500">{revenueForPeriod(data.revenue, year, monthValue, billboardId).length} paid</p>
                </div>
              )
            })}
            <button
              type="button"
              data-testid="month-drop-unknown"
              onDragOver={event => { if (draggingRevenue) event.preventDefault() }}
              onDrop={event => { event.preventDefault(); if (draggingRevenue) assignRevenue(draggingRevenue, UNKNOWN_REVENUE_MONTH) }}
              onClick={() => setMonth(UNKNOWN_REVENUE_MONTH)}
              className={`min-w-[88px] rounded-md border border-amber-300 px-2 py-2 text-center text-xs ${draggingRevenue ? 'bg-amber-100 ring-1 ring-amber-500' : 'bg-amber-50'} ${month === UNKNOWN_REVENUE_MONTH ? 'ring-1 ring-amber-600' : ''}`}
            >
              <span className="font-medium text-amber-900">Unknown {year}</span>
              <span className="block text-[10px] text-amber-700">{revenueForPeriod(data.revenue, year, UNKNOWN_REVENUE_MONTH, billboardId).length} received</span>
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="paid-revenue-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="paid-revenue-heading" className="text-base font-semibold">{revenueSearch.trim() ? 'Revenue Search Results' : 'Paid Revenue'}</h2>
          <Badge className="bg-green-100 text-green-800">{displayedRevenue.length} {revenueSearch.trim() ? 'found' : 'paid'}</Badge>
        </div>
        <div className="overflow-hidden rounded-lg border bg-white">
          {displayedRevenue.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">{revenueSearch.trim() ? 'No revenue matches this search.' : month === UNKNOWN_REVENUE_MONTH ? 'No received revenue is waiting for a reporting month.' : 'No completed payments in this reporting period.'}</p>
          ) : displayedRevenue.map(item => (
            <div
              key={item.revenue_id}
              data-testid={`revenue-${item.revenue_id}`}
              draggable={canEditProfitLoss && !saving && !data.locks.includes(item.reporting_month)}
              onDragStart={event => { setDraggingRevenue(item.revenue_id); event.dataTransfer.setData('text/plain', item.revenue_id) }}
              onDragEnd={() => setDraggingRevenue(null)}
              className="grid gap-2 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[24px_minmax(110px,0.7fr)_minmax(180px,1.3fr)_minmax(170px,1fr)_120px_160px] sm:items-center"
            >
              <GripVertical className={`hidden h-4 w-4 sm:block ${canEditProfitLoss ? 'text-gray-400' : 'text-gray-200'}`} aria-hidden="true" />
              <div>
                {item.invoice_number ? <Link className="text-sm font-semibold text-blue-700 hover:underline" href={`/accounts?invoice=${encodeURIComponent(item.invoice_number)}`}>{item.invoice_number}</Link> : <span className="text-sm font-medium text-gray-500">No invoice number</span>}
                <p className="text-[10px] text-gray-500">Billing {item.billing_month}</p>
                {!item.has_persisted_assignment && <p className="text-[10px] text-amber-700">Received · Unknown {item.unknown_year}</p>}
              </div>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{item.client_name}</p><p className="truncate text-xs text-gray-500">{item.brand_name || 'No brand'}</p></div>
              <div><p className="text-xs font-medium">{item.billboard_name}</p><p className="text-[10px] text-gray-500">{item.billboard_location}</p></div>
              <p className="text-sm font-bold text-green-700">{money(item.amount)}</p>
              {canEditProfitLoss ? (
                <select aria-label={`Move ${item.invoice_number || item.client_name} to month`} value={item.reporting_month} disabled={saving || data.locks.includes(item.reporting_month)} onChange={event => assignRevenue(item.revenue_id, event.target.value)} className="h-8 rounded-md border bg-white px-2 text-xs">
                  <option value={UNKNOWN_REVENUE_MONTH}>Unknown</option>
                  {moveYears.map(targetYear => (
                    <optgroup key={targetYear} label={String(targetYear)}>
                      {MONTHS.map(([monthValue, label]) => <option disabled={data.locks.includes(`${targetYear}-${monthValue}`)} key={`${targetYear}-${monthValue}`} value={`${targetYear}-${monthValue}`}>{label} {targetYear}{data.locks.includes(`${targetYear}-${monthValue}`) ? ' (Locked)' : ''}</option>)}
                    </optgroup>
                  ))}
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
              {canEditProfitLoss && <div className="flex justify-end gap-1"><Button size="icon" variant="ghost" disabled={(cost.reporting_months || [cost.cost_date.slice(0, 7)]).some(value => data.locks.includes(value))} aria-label={`Edit ${cost.description}`} onClick={() => openEditCost(cost)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" disabled={(cost.reporting_months || [cost.cost_date.slice(0, 7)]).some(value => data.locks.includes(value))} aria-label={`Delete ${cost.description}`} onClick={() => deleteCost(cost.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div>}
            </div>
          ))}
        </div>
      </section>

      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{costDraft.id ? 'Edit Cost' : 'Add Cost'}</DialogTitle></DialogHeader>
          <form onSubmit={saveCost} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="cost-date">Date</Label><Input id="cost-date" type="date" required value={costDraft.cost_date} onChange={event => setCostDate(event.target.value)} /></div>
              <div><Label htmlFor="cost-category">Category</Label><select id="cost-category" required value={costDraft.category_id} onChange={event => setCostDraft(current => ({ ...current, category_id: event.target.value }))} className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="">Select category</option>{data.categories.filter(category => category.is_active || category.id === costDraft.category_id).map(category => <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' (Inactive)'}</option>)}</select></div>
              <div><Label htmlFor="cost-description">Description</Label><Input id="cost-description" required maxLength={300} value={costDraft.description} onChange={event => setCostDraft(current => ({ ...current, description: event.target.value }))} /></div>
              <div><Label htmlFor="cost-supplier">Supplier / Payee</Label><Input id="cost-supplier" required maxLength={200} value={costDraft.supplier_payee} onChange={event => setCostDraft(current => ({ ...current, supplier_payee: event.target.value }))} /></div>
              <div><Label htmlFor="cost-amount">Total Amount (RM)</Label><Input id="cost-amount" type="number" required min="0.01" step="0.01" value={costDraft.amount} onChange={event => setCostDraft(current => ({ ...current, amount: event.target.value }))} /></div>
              <div className="sm:col-span-2"><Label htmlFor="cost-remarks">Remarks</Label><Textarea id="cost-remarks" value={costDraft.remarks} onChange={event => setCostDraft(current => ({ ...current, remarks: event.target.value }))} /></div>
            </div>
            <fieldset className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-sm font-medium">Allocate to months ({draftCostYear})</legend>
                <span className="text-xs text-gray-500">{draftReportingMonths.length === 1 ? 'Full amount in one month' : `Split equally across ${draftReportingMonths.length} months`}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {MONTHS.map(([monthValue, label]) => {
                  const reportingMonth = `${draftCostYear}-${monthValue}`
                  const checked = draftReportingMonths.includes(reportingMonth)
                  const locked = data.locks.includes(reportingMonth)
                  return <label key={monthValue} className={`flex h-10 items-center justify-center gap-2 rounded-md border px-2 text-sm ${checked ? 'border-red-600 bg-red-50 font-medium text-red-700' : 'border-gray-300 bg-white'} ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-red-300'}`}><input type="checkbox" className="h-4 w-4 accent-red-600" checked={checked} disabled={locked} onChange={() => toggleCostMonth(monthValue)} /><span>{label}</span></label>
                })}
              </div>
              {draftHasLockedMonth && <p role="alert" className="text-xs text-red-700">A selected month is locked. Unlock it before editing this cost.</p>}
            </fieldset>
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
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button><Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={saving || !validAllocations || duplicateAllocations || draftReportingMonths.length === 0 || draftHasLockedMonth}>{saving ? 'Saving...' : 'Save Cost'}</Button></div>
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

      <Dialog open={unlockMonth !== null} onOpenChange={open => { if (!open) { setUnlockMonth(null); setUnlockCode(''); setActionError('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Unlock {unlockMonth}</DialogTitle></DialogHeader>
          <form onSubmit={unlockLockedMonth} className="space-y-4">
            <div><Label htmlFor="unlock-code">Unlock code</Label><Input id="unlock-code" type="password" inputMode="numeric" autoComplete="off" required value={unlockCode} onChange={event => setUnlockCode(event.target.value)} /></div>
            {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setUnlockMonth(null); setUnlockCode(''); setActionError('') }}>Cancel</Button><Button type="submit" disabled={saving || !unlockCode}>{saving ? 'Unlocking...' : 'Unlock Month'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}
