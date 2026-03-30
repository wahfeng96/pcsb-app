'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, FileText, Lock, Plus, Pencil, Trash2, X, Check, DollarSign } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { format, startOfMonth, addMonths, subMonths, parseISO, isSameMonth } from 'date-fns'
import { getRevenueMonths } from '@/lib/booking-utils'
import type { Billboard, Booking, Client } from '@/types/database'
import { useRole } from '@/lib/hooks/use-role'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }
type CostItem = { id: string; billboard_id: string; name: string; amount: number; start_month: string | null; end_month: string | null }
type MonthlyPayment = { id: string; booking_id: string; month: string; amount: number; status: 'pending_invoice' | 'invoice_sent' | 'completed' }
type ProfitShareRecord = { id: string; booking_id?: string; month: string; status: 'pending_payment' | 'waiting_profit_share' | 'settled' }

const PAYMENT_CYCLE_STATUS: MonthlyPayment['status'][] = ['pending_invoice', 'invoice_sent', 'completed']
const PAYMENT_STATUS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  pending_invoice: { label: 'Pending Invoice', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: '📋' },
  invoice_sent: { label: 'Invoice Sent', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '📨' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-300', icon: '✅' },
}

function getMonthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = []
  let current = startOfMonth(start)
  const last = startOfMonth(end)
  while (current <= last) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}

export default function AccountsPage() {
  const supabase = createClient()
  const { canEdit } = useRole()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [costs, setCosts] = useState<CostItem[]>([])
  const [monthlyPayments, setMonthlyPayments] = useState<MonthlyPayment[]>([])
  const [profitRecords, setProfitRecords] = useState<ProfitShareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()))
  const [selectedBb, setSelectedBb] = useState<string>('all')
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set())
  const [expandedCosts, setExpandedCosts] = useState<Set<string>>(new Set())
  const [costFormBb, setCostFormBb] = useState<string | null>(null)
  const [editingCostId, setEditingCostId] = useState<string | null>(null)
  const [costForm, setCostForm] = useState({ name: '', amount: '', start_month: '', end_month: '' })

  async function load() {
    const [bb, bk, cs, mp, pr] = await Promise.all([
      supabase.from('billboards').select('*').order('name'),
      supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').order('start_date'),
      supabase.from('billboard_costs').select('*').order('created_at'),
      supabase.from('monthly_payments').select('*'),
      supabase.from('profit_sharing').select('id, booking_id, month, status'),
    ])
    setBillboards(bb.data || [])
    setBookings(bk.data || [])
    setCosts(cs.data || [])
    setMonthlyPayments(mp.data || [])
    setProfitRecords(pr.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getMonthlyRevenueForBooking(b: BookingWithRefs, month: Date): number {
    if (b.status === 'cancelled') return 0
    const months = getRevenueMonths(parseISO(b.start_date), b.monthly_rate, b.total_amount)
    if (!months.some(m => isSameMonth(m, month))) return 0
    return b.monthly_rate || 0
  }

  function getMonthlyCostForItem(c: CostItem, month: Date): number {
    if (!c.start_month || !c.end_month) {
      return isSameMonth(startOfMonth(new Date()), month) ? c.amount : 0
    }
    const start = parseISO(c.start_month)
    const end = parseISO(c.end_month)
    const months = getMonthsBetween(start, end)
    if (!months.some(m => isSameMonth(m, month))) return 0
    return months.length > 0 ? c.amount / months.length : 0
  }

  // Check if profit sharing has been started (waiting or settled) for this booking/month
  function isProfitShareTriggered(bookingId: string, monthKey: string): boolean {
    const pr = profitRecords.find(r => r.booking_id === bookingId && r.month === monthKey)
    return pr?.status === 'waiting_profit_share' || pr?.status === 'settled'
  }

  // Get payment status — auto "completed" if profit sharing is waiting/settled
  function getPaymentStatus(bookingId: string, monthKey: string): MonthlyPayment['status'] {
    if (isProfitShareTriggered(bookingId, monthKey)) return 'completed'
    const existing = monthlyPayments.find(p => p.booking_id === bookingId && p.month === monthKey)
    return existing?.status || 'pending_invoice'
  }

  async function cyclePaymentStatus(bookingId: string, monthKey: string, amount: number) {
    // If profit sharing already triggered, status is locked to completed
    if (isProfitShareTriggered(bookingId, monthKey)) return

    const current = getPaymentStatus(bookingId, monthKey)
    const currentIdx = PAYMENT_CYCLE_STATUS.indexOf(current)
    const next = PAYMENT_CYCLE_STATUS[(currentIdx + 1) % PAYMENT_CYCLE_STATUS.length]

    const existing = monthlyPayments.find(p => p.booking_id === bookingId && p.month === monthKey)
    if (existing) {
      await supabase.from('monthly_payments').update({ status: next }).eq('id', existing.id)
    } else {
      await supabase.from('monthly_payments').insert({ booking_id: bookingId, month: monthKey, amount, status: next })
    }

    // When accounts → completed, auto-update profit sharing → waiting_profit_share
    if (next === 'completed') {
      const pr = profitRecords.find(p => p.booking_id === bookingId && p.month === monthKey)
      if (pr && pr.status === 'pending_payment') {
        await supabase.from('profit_sharing').update({ status: 'waiting_profit_share' }).eq('id', pr.id)
      } else if (!pr) {
        // Create profit_sharing record if it doesn't exist
        await supabase.from('profit_sharing').insert({ booking_id: bookingId, month: monthKey, amount, status: 'waiting_profit_share' })
      }
    }
    // When accounts cycles back from completed, revert profit sharing → pending_payment
    if (current === 'completed' && next === 'pending_invoice') {
      const pr = profitRecords.find(p => p.booking_id === bookingId && p.month === monthKey)
      if (pr && pr.status === 'waiting_profit_share') {
        await supabase.from('profit_sharing').update({ status: 'pending_payment' }).eq('id', pr.id)
      }
    }

    load()
  }

  function toggleExpanded(bookingId: string) {
    setExpandedBookings(prev => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }

  function toggleCosts(bbId: string) {
    setExpandedCosts(prev => {
      const next = new Set(prev)
      if (next.has(bbId)) next.delete(bbId)
      else next.add(bbId)
      return next
    })
  }

  function openCostForm(bbId: string, cost?: CostItem) {
    setCostFormBb(bbId)
    if (cost) {
      setEditingCostId(cost.id)
      setCostForm({ name: cost.name, amount: String(cost.amount), start_month: cost.start_month || '', end_month: cost.end_month || '' })
    } else {
      setEditingCostId(null)
      setCostForm({ name: '', amount: '', start_month: '', end_month: '' })
    }
  }

  function closeCostForm() {
    setCostFormBb(null)
    setEditingCostId(null)
    setCostForm({ name: '', amount: '', start_month: '', end_month: '' })
  }

  async function saveCost(bbId: string) {
    if (!costForm.name.trim() || !costForm.amount) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return alert('Not logged in')
    const payload: Record<string, unknown> = {
      userId: user.id,
      name: costForm.name.trim(),
      amount: parseFloat(costForm.amount) || 0,
      start_month: costForm.start_month || null,
      end_month: costForm.end_month || null,
    }
    if (editingCostId) {
      payload.id = editingCostId
      const res = await fetch('/api/billboard-costs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const r = await res.json(); return alert('Error: ' + (r.error || 'Failed')) }
    } else {
      payload.billboard_id = bbId
      const res = await fetch('/api/billboard-costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const r = await res.json(); return alert('Error: ' + (r.error || 'Failed')) }
    }
    closeCostForm()
    load()
  }

  async function deleteCost(costId: string) {
    if (!confirm('Delete this cost item?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return alert('Not logged in')
    const res = await fetch('/api/billboard-costs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, id: costId }) })
    if (!res.ok) { const r = await res.json(); return alert('Error: ' + (r.error || 'Failed')) }
    load()
  }

  // Per-billboard summary
  const billboardSummaries = useMemo(() => {
    return billboards.map(bb => {
      const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.status !== 'cancelled')
      const bbCosts = costs.filter(c => c.billboard_id === bb.id)

      const monthRevenue = bbBookings.reduce((sum, b) => sum + getMonthlyRevenueForBooking(b, viewMonth), 0)
      const monthCost = bbCosts.reduce((sum, c) => sum + getMonthlyCostForItem(c, viewMonth), 0)
      const monthProfit = monthRevenue - monthCost
      const partnerShare = monthProfit * ((bb.profit_share_percent || 0) / 100)

      const totalRevenue = bbBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
      const settledRevenue = bbBookings.filter(b => b.payment_status === 'settled').reduce((sum, b) => sum + (b.total_amount || 0), 0)
      const pendingRevenue = totalRevenue - settledRevenue

      // Active bookings this month
      const activeThisMonth = bbBookings.filter(b => {
        const start = parseISO(b.start_date)
        const end = parseISO(b.end_date)
        const months = getMonthsBetween(start, end)
        return months.some(m => isSameMonth(m, viewMonth))
      })

      return { billboard: bb, monthRevenue, monthCost, monthProfit, partnerShare, totalRevenue, settledRevenue, pendingRevenue, activeThisMonth }
    })
  }, [billboards, bookings, costs, viewMonth])

  const grandTotals = useMemo(() => {
    const items = selectedBb === 'all' ? billboardSummaries : billboardSummaries.filter(s => s.billboard.id === selectedBb)
    return {
      monthRevenue: items.reduce((s, i) => s + i.monthRevenue, 0),
      monthCost: items.reduce((s, i) => s + i.monthCost, 0),
      monthProfit: items.reduce((s, i) => s + i.monthProfit, 0),
      partnerShare: items.reduce((s, i) => s + i.partnerShare, 0),
      totalRevenue: items.reduce((s, i) => s + i.totalRevenue, 0),
      settledRevenue: items.reduce((s, i) => s + i.settledRevenue, 0),
      pendingRevenue: items.reduce((s, i) => s + i.pendingRevenue, 0),
    }
  }, [billboardSummaries, selectedBb])

  // Monthly payment stats for this month
  const monthPaymentStats = useMemo(() => {
    const items = selectedBb === 'all' ? billboardSummaries : billboardSummaries.filter(s => s.billboard.id === selectedBb)
    const allActive = items.flatMap(s => s.activeThisMonth)
    const monthKey = format(viewMonth, 'yyyy-MM')
    let pending = 0, sent = 0, completed = 0
    allActive.forEach(b => {
      const status = getPaymentStatus(b.id, monthKey)
      const amt = b.monthly_rate || 0
      if (status === 'pending_invoice') pending += amt
      else if (status === 'invoice_sent') sent += amt
      else completed += amt
    })
    return { pending, sent, completed }
  }, [billboardSummaries, selectedBb, monthlyPayments, viewMonth])

  function handleDownloadReport() {
    const month = format(viewMonth, 'MMMM yyyy')
    const monthKey = format(viewMonth, 'yyyy-MM')
    const items = selectedBb === 'all' ? billboardSummaries : billboardSummaries.filter(s => s.billboard.id === selectedBb)
    
    let csv = `PCSB Monthly Report - ${month}\n\n`
    csv += `Billboard,Monthly Revenue (RM),Monthly Cost (RM),Profit (RM),Partner Share (RM),Total Revenue (RM),Settled (RM),Pending (RM)\n`
    items.forEach(s => {
      csv += `${s.billboard.name},${Math.round(s.monthRevenue)},${Math.round(s.monthCost)},${Math.round(s.monthProfit)},${Math.round(s.partnerShare)},${Math.round(s.totalRevenue)},${Math.round(s.settledRevenue)},${Math.round(s.pendingRevenue)}\n`
    })
    csv += `\nTOTAL,${Math.round(grandTotals.monthRevenue)},${Math.round(grandTotals.monthCost)},${Math.round(grandTotals.monthProfit)},${Math.round(grandTotals.partnerShare)},${Math.round(grandTotals.totalRevenue)},${Math.round(grandTotals.settledRevenue)},${Math.round(grandTotals.pendingRevenue)}\n`
    
    csv += `\n\nMonthly Payment Status - ${month}\n`
    csv += `Billboard,Client,Brand,Monthly Rate (RM),Payment Status\n`
    items.forEach(s => {
      s.activeThisMonth.forEach(b => {
        const status = getPaymentStatus(b.id, monthKey)
        csv += `${s.billboard.name},${b.client?.company_name || ''},${b.brand_name || ''},${b.monthly_rate},${PAYMENT_STATUS_DISPLAY[status].label}\n`
      })
    })

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PCSB-Report-${format(viewMonth, 'yyyy-MM')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  const displaySummaries = selectedBb === 'all' ? billboardSummaries : billboardSummaries.filter(s => s.billboard.id === selectedBb)
  const monthKey = format(viewMonth, 'yyyy-MM')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        <Button size="sm" variant="outline" onClick={handleDownloadReport}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg border p-2">
        <Button size="icon" variant="ghost" onClick={() => setViewMonth(subMonths(viewMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="font-semibold">{format(viewMonth, 'MMMM yyyy')}</h2>
        <Button size="icon" variant="ghost" onClick={() => setViewMonth(addMonths(viewMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Billboard filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={selectedBb === 'all' ? 'default' : 'outline'} onClick={() => setSelectedBb('all')} className={selectedBb === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}>All</Button>
        {billboards.map(bb => (
          <Button key={bb.id} size="sm" variant={selectedBb === bb.id ? 'default' : 'outline'} onClick={() => setSelectedBb(bb.id)} className={`whitespace-nowrap text-xs ${selectedBb === bb.id ? 'bg-red-600 hover:bg-red-700' : ''}`}>{bb.name}</Button>
        ))}
      </div>

      {/* Grand Summary */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /> {format(viewMonth, 'MMMM yyyy')} Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div className="bg-blue-50 rounded p-3 text-center">
              <p className="text-gray-500">Monthly Revenue</p>
              <p className="text-lg font-bold text-blue-700">RM {Math.round(grandTotals.monthRevenue).toLocaleString()}</p>
            </div>
            <div className="bg-orange-50 rounded p-3 text-center">
              <p className="text-gray-500">Monthly Cost</p>
              <p className="text-lg font-bold text-orange-700">RM {Math.round(grandTotals.monthCost).toLocaleString()}</p>
            </div>
            <div className={`rounded p-3 text-center ${grandTotals.monthProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-gray-500">Profit</p>
              <p className={`text-lg font-bold ${grandTotals.monthProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>RM {Math.round(grandTotals.monthProfit).toLocaleString()}</p>
            </div>
            <div className="bg-purple-50 rounded p-3 text-center">
              <p className="text-gray-500">Partner Share</p>
              <p className="text-lg font-bold text-purple-700">RM {Math.round(grandTotals.partnerShare).toLocaleString()}</p>
            </div>
          </div>

          {/* Payment Status Summary */}
          <h4 className="text-xs font-semibold text-gray-500 mb-2">Payment Collection</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-yellow-50 rounded p-2 text-center border border-yellow-200">
              <p className="text-[10px] text-yellow-700">📋 Pending Invoice</p>
              <p className="font-bold text-yellow-700">RM {Math.round(monthPaymentStats.pending).toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 rounded p-2 text-center border border-blue-200">
              <p className="text-[10px] text-blue-700">📨 Invoice Sent</p>
              <p className="font-bold text-blue-700">RM {Math.round(monthPaymentStats.sent).toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded p-2 text-center border border-green-200">
              <p className="text-[10px] text-green-700">✅ Completed</p>
              <p className="font-bold text-green-700">RM {Math.round(monthPaymentStats.completed).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Billboard with Client Monthly Payments */}
      <h3 className="font-semibold text-sm">Per Billboard</h3>
      <div className="space-y-3">
        {displaySummaries.map(s => (
          <Card key={s.billboard.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-sm">{s.billboard.name}</h4>
                  <p className="text-xs text-gray-500">{s.billboard.location}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{s.activeThisMonth.length} active</Badge>
                  <p className="text-sm font-bold text-blue-700">RM {Math.round(s.monthRevenue).toLocaleString()}</p>
                </div>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-4 gap-1.5 text-xs mb-3">
                <div className="bg-blue-50 rounded p-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Revenue</p>
                  <p className="font-bold">RM {Math.round(s.monthRevenue).toLocaleString()}</p>
                </div>
                <div className="bg-orange-50 rounded p-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Cost</p>
                  <p className="font-bold">RM {Math.round(s.monthCost).toLocaleString()}</p>
                </div>
                <div className={`rounded p-1.5 text-center ${s.monthProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-[10px] text-gray-500">Profit</p>
                  <p className={`font-bold ${s.monthProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>RM {Math.round(s.monthProfit).toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 rounded p-1.5 text-center">
                  <p className="text-[10px] text-gray-500">Partner</p>
                  <p className="font-bold">RM {Math.round(s.partnerShare).toLocaleString()}</p>
                </div>
              </div>

              {/* Client Monthly Payments */}
              {s.activeThisMonth.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-gray-400 font-medium">Client Payments — {format(viewMonth, 'MMM yyyy')}</p>
                  {s.activeThisMonth.map(b => {
                    const status = getPaymentStatus(b.id, monthKey)
                    const display = PAYMENT_STATUS_DISPLAY[status]
                    const isExpanded = expandedBookings.has(b.id)
                    const bookingMonths = getMonthsBetween(parseISO(b.start_date), parseISO(b.end_date))

                    return (
                      <div key={b.id} className="border rounded-lg overflow-hidden">
                        {/* Main row - clickable to change this month's status */}
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{b.brand_name || b.client?.company_name}</p>
                            <p className="text-[10px] text-gray-400">{b.client?.company_name}{b.sales_person ? ` • ${b.sales_person}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold">RM {(b.monthly_rate || 0).toLocaleString()}</p>
                            {canEdit ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className={`text-[10px] h-7 ${display.color} ${isProfitShareTriggered(b.id, monthKey) ? 'opacity-70 cursor-not-allowed' : ''}`}
                                onClick={() => cyclePaymentStatus(b.id, monthKey, b.monthly_rate || 0)}
                                title={isProfitShareTriggered(b.id, monthKey) ? 'Auto-completed by Profit Sharing' : ''}
                              >
                                {isProfitShareTriggered(b.id, monthKey) && <Lock className="h-2.5 w-2.5 mr-1" />}
                                {display.icon} {display.label}
                              </Button>
                            ) : (
                              <Badge variant="outline" className={`text-[10px] ${display.color}`}>{display.icon} {display.label}</Badge>
                            )}
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleExpanded(b.id)}>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>

                        {/* Expanded: all months for this booking */}
                        {isExpanded && (
                          <div className="border-t bg-white">
                            <div className="px-3 py-1.5 bg-gray-100 text-[10px] text-gray-500 font-medium">
                              All months: {format(parseISO(b.start_date), 'dd MMM yy')} → {format(parseISO(b.end_date), 'dd MMM yy')}
                            </div>
                            {bookingMonths.map(m => {
                              const mKey = format(m, 'yyyy-MM')
                              const mStatus = getPaymentStatus(b.id, mKey)
                              const mDisplay = PAYMENT_STATUS_DISPLAY[mStatus]
                              const isCurrentMonth = isSameMonth(m, viewMonth)
                              return (
                                <div
                                  key={mKey}
                                  className={`flex items-center justify-between px-3 py-1.5 border-t text-xs ${isCurrentMonth ? 'bg-yellow-50' : ''}`}
                                >
                                  <span className={`${isCurrentMonth ? 'font-semibold' : 'text-gray-600'}`}>
                                    {format(m, 'MMM yyyy')}
                                    {isCurrentMonth && <span className="text-[8px] text-yellow-600 ml-1">← current</span>}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-500">RM {(b.monthly_rate || 0).toLocaleString()}</span>
                                    {canEdit ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={`text-[9px] h-6 px-2 ${mDisplay.color} ${isProfitShareTriggered(b.id, mKey) ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        onClick={() => cyclePaymentStatus(b.id, mKey, b.monthly_rate || 0)}
                                        title={isProfitShareTriggered(b.id, mKey) ? 'Auto-completed by Profit Sharing' : ''}
                                      >
                                        {isProfitShareTriggered(b.id, mKey) && <Lock className="h-2.5 w-2.5 mr-1" />}
                                        {mDisplay.icon} {mDisplay.label}
                                      </Button>
                                    ) : (
                                      <Badge variant="outline" className={`text-[9px] ${mDisplay.color}`}>{mDisplay.icon} {mDisplay.label}</Badge>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Costs Section */}
              {canEdit && (
                <div className="mt-3 border-t pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <button
                      className="flex items-center gap-1 text-[10px] text-gray-500 font-medium hover:text-gray-700"
                      onClick={() => toggleCosts(s.billboard.id)}
                    >
                      <DollarSign className="h-3 w-3" />
                      Costs ({costs.filter(c => c.billboard_id === s.billboard.id).length})
                      {expandedCosts.has(s.billboard.id) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {expandedCosts.has(s.billboard.id) && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600" onClick={() => openCostForm(s.billboard.id)}>
                        <Plus className="h-3 w-3 mr-0.5" /> Add Cost
                      </Button>
                    )}
                  </div>

                  {expandedCosts.has(s.billboard.id) && (
                    <div className="space-y-1.5">
                      {/* Existing cost items */}
                      {costs.filter(c => c.billboard_id === s.billboard.id).map(c => (
                        <div key={c.id} className="flex items-center justify-between px-3 py-1.5 bg-orange-50 rounded text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{c.name}</p>
                            <p className="text-[10px] text-gray-400">
                              RM {c.amount.toLocaleString()}
                              {c.start_month && c.end_month ? ` • ${c.start_month} → ${c.end_month}` : ' • one-time'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openCostForm(s.billboard.id, c)}>
                              <Pencil className="h-3 w-3 text-gray-400" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteCost(c.id)}>
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {costs.filter(c => c.billboard_id === s.billboard.id).length === 0 && costFormBb !== s.billboard.id && (
                        <p className="text-[10px] text-gray-400 text-center py-2">No costs added yet</p>
                      )}

                      {/* Add/Edit Cost Form */}
                      {costFormBb === s.billboard.id && (
                        <div className="border rounded-lg p-3 bg-white space-y-2">
                          <p className="text-xs font-semibold">{editingCostId ? 'Edit Cost' : 'Add Cost'}</p>
                          <Input
                            placeholder="Cost name (e.g. Rental, Electricity)"
                            value={costForm.name}
                            onChange={e => setCostForm(prev => ({ ...prev, name: e.target.value }))}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            placeholder="Total amount (RM)"
                            value={costForm.amount}
                            onChange={e => setCostForm(prev => ({ ...prev, amount: e.target.value }))}
                            className="h-8 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-gray-500">Start Month</label>
                              <Input
                                type="month"
                                value={costForm.start_month}
                                onChange={e => setCostForm(prev => ({ ...prev, start_month: e.target.value }))}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500">End Month</label>
                              <Input
                                type="month"
                                value={costForm.end_month}
                                onChange={e => setCostForm(prev => ({ ...prev, end_month: e.target.value }))}
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400">Leave months empty for one-time cost (applied to current month only)</p>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 flex-1" onClick={() => saveCost(s.billboard.id)}>
                              <Check className="h-3 w-3 mr-1" /> {editingCostId ? 'Update' : 'Save'}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={closeCostForm}>
                              <X className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
