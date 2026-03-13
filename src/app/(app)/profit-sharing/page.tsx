'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { format, startOfMonth, addMonths, subMonths, parseISO, isSameMonth } from 'date-fns'
import { getRevenueMonths } from '@/lib/booking-utils'
import type { Billboard, Booking, Client } from '@/types/database'
import { useRole } from '@/lib/hooks/use-role'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }
type ProfitShareRecord = { id: string; billboard_id: string; sales_person: string; month: string; amount: number; status: 'pending_payment' | 'waiting_profit_share' | 'settled' }

const STATUS_CYCLE: ProfitShareRecord['status'][] = ['pending_payment', 'waiting_profit_share', 'settled']
const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  pending_payment: { label: 'Pending Payment', color: 'bg-yellow-100 text-yellow-700 border-yellow-300', icon: '💰' },
  waiting_profit_share: { label: 'Waiting Profit Share', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '⏳' },
  settled: { label: 'Settled', color: 'bg-green-100 text-green-700 border-green-300', icon: '✅' },
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

export default function ProfitSharingPage() {
  const supabase = createClient()
  const { canEdit } = useRole()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [profitRecords, setProfitRecords] = useState<ProfitShareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBb, setSelectedBb] = useState<string>('all')
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  async function load() {
    const [bb, bk, pr] = await Promise.all([
      supabase.from('billboards').select('*').order('name'),
      supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').neq('status', 'cancelled').order('start_date'),
      supabase.from('profit_sharing').select('*'),
    ])
    setBillboards(bb.data || [])
    setBookings(bk.data || [])
    setProfitRecords(pr.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getStatus(billboardId: string, salesPerson: string, monthKey: string): ProfitShareRecord['status'] {
    const rec = profitRecords.find(r => r.billboard_id === billboardId && r.sales_person === salesPerson && r.month === monthKey)
    return rec?.status || 'pending_payment'
  }

  async function cycleStatus(billboardId: string, salesPerson: string, monthKey: string, amount: number) {
    const current = getStatus(billboardId, salesPerson, monthKey)
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]

    const existing = profitRecords.find(r => r.billboard_id === billboardId && r.sales_person === salesPerson && r.month === monthKey)
    if (existing) {
      await supabase.from('profit_sharing').update({ status: next }).eq('id', existing.id)
    } else {
      await supabase.from('profit_sharing').insert({ billboard_id: billboardId, sales_person: salesPerson, month: monthKey, amount, status: next })
    }
    load()
  }

  // Per-booking status (uses booking_id + month as key in payment_status on the booking itself)
  function getBookingMonthStatus(bookingId: string, monthKey: string): ProfitShareRecord['status'] {
    const rec = profitRecords.find(r => r.sales_person === bookingId && r.month === monthKey && r.billboard_id === '__booking__')
    return rec?.status || 'pending_payment'
  }

  async function cycleBookingStatus(bookingId: string, monthKey: string, amount: number) {
    const current = getBookingMonthStatus(bookingId, monthKey)
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]

    const existing = profitRecords.find(r => r.sales_person === bookingId && r.month === monthKey && r.billboard_id === '__booking__')
    if (existing) {
      await supabase.from('profit_sharing').update({ status: next }).eq('id', existing.id)
    } else {
      await supabase.from('profit_sharing').insert({ billboard_id: '__booking__', sales_person: bookingId, month: monthKey, amount, status: next })
    }
    load()
  }

  function toggleExpanded(key: string) {
    setExpandedSales(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleMonth(key: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Build data: per billboard → per sales person → monthly breakdown
  const billboardData = useMemo(() => {
    const filteredBbs = selectedBb === 'all' ? billboards : billboards.filter(b => b.id === selectedBb)

    return filteredBbs.map(bb => {
      const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.sales_person)

      // Group by sales person
      const salesMap = new Map<string, { bookings: BookingWithRefs[]; monthlyBreakdown: { month: Date; monthKey: string; amount: number; clients: { name: string; amount: number; bookingId: string }[] }[] }>()

      bbBookings.forEach(b => {
        const sp = b.sales_person || 'Unknown'
        if (!salesMap.has(sp)) salesMap.set(sp, { bookings: [], monthlyBreakdown: [] })
        salesMap.get(sp)!.bookings.push(b)
      })

      // Build monthly breakdown per sales person
      salesMap.forEach((data, sp) => {
        const monthMap = new Map<string, { month: Date; amount: number; clients: { name: string; amount: number; bookingId: string }[] }>()

        data.bookings.forEach(b => {
          const months = getRevenueMonths(parseISO(b.start_date), b.monthly_rate, b.total_amount)
          const monthlyAmt = b.monthly_rate || 0

          months.forEach(m => {
            const key = format(m, 'yyyy-MM')
            if (!monthMap.has(key)) monthMap.set(key, { month: m, amount: 0, clients: [] })
            const entry = monthMap.get(key)!
            entry.amount += monthlyAmt
            entry.clients.push({ name: b.brand_name || b.client?.company_name || 'Unknown', amount: monthlyAmt, bookingId: b.id })
          })
        })

        data.monthlyBreakdown = Array.from(monthMap.values()).sort((a, b) => a.month.getTime() - b.month.getTime())
      })

      // Totals per status
      let totalPending = 0, totalWaiting = 0, totalSettled = 0
      salesMap.forEach((data, sp) => {
        data.monthlyBreakdown.forEach(mb => {
          const status = getStatus(bb.id, sp, format(mb.month, 'yyyy-MM'))
          if (status === 'pending_payment') totalPending += mb.amount
          else if (status === 'waiting_profit_share') totalWaiting += mb.amount
          else totalSettled += mb.amount
        })
      })

      return { billboard: bb, salesPersons: salesMap, totalPending, totalWaiting, totalSettled }
    })
  }, [billboards, bookings, profitRecords, selectedBb])

  // Grand totals
  const grandTotals = useMemo(() => ({
    pending: billboardData.reduce((s, d) => s + d.totalPending, 0),
    waiting: billboardData.reduce((s, d) => s + d.totalWaiting, 0),
    settled: billboardData.reduce((s, d) => s + d.totalSettled, 0),
  }), [billboardData])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Profit Sharing</h1>

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
          <h3 className="font-semibold text-sm mb-3">Overall Status</h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-yellow-50 rounded p-3 text-center border border-yellow-200">
              <p className="text-[10px] text-yellow-700">💰 Pending Payment</p>
              <p className="text-lg font-bold text-yellow-700">RM {Math.round(grandTotals.pending).toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 rounded p-3 text-center border border-blue-200">
              <p className="text-[10px] text-blue-700">⏳ Waiting Profit Share</p>
              <p className="text-lg font-bold text-blue-700">RM {Math.round(grandTotals.waiting).toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded p-3 text-center border border-green-200">
              <p className="text-[10px] text-green-700">✅ Settled</p>
              <p className="text-lg font-bold text-green-700">RM {Math.round(grandTotals.settled).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per Billboard */}
      {billboardData.map(({ billboard: bb, salesPersons, totalPending, totalWaiting, totalSettled }) => (
        <Card key={bb.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{bb.name}</h3>
                <p className="text-xs text-gray-500">{bb.location} • {bb.profit_share_percent || 0}% profit share</p>
              </div>
            </div>

            {/* Billboard status summary */}
            <div className="grid grid-cols-3 gap-1.5 text-xs mb-3">
              <div className="bg-yellow-50 rounded p-1.5 text-center">
                <p className="text-[10px] text-yellow-600">Pending</p>
                <p className="font-bold text-yellow-700">RM {Math.round(totalPending).toLocaleString()}</p>
              </div>
              <div className="bg-blue-50 rounded p-1.5 text-center">
                <p className="text-[10px] text-blue-600">Waiting</p>
                <p className="font-bold text-blue-700">RM {Math.round(totalWaiting).toLocaleString()}</p>
              </div>
              <div className="bg-green-50 rounded p-1.5 text-center">
                <p className="text-[10px] text-green-600">Settled</p>
                <p className="font-bold text-green-700">RM {Math.round(totalSettled).toLocaleString()}</p>
              </div>
            </div>

            {/* Per Sales Person */}
            {salesPersons.size === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">No bookings with sales person assigned</p>
            ) : (
              <div className="space-y-2">
                {Array.from(salesPersons.entries()).map(([sp, data]) => {
                  const expandKey = `${bb.id}-${sp}`
                  const isExpanded = expandedSales.has(expandKey)
                  const totalAmt = data.monthlyBreakdown.reduce((s, m) => s + m.amount, 0)
                  const settledAmt = data.monthlyBreakdown.reduce((s, m) => {
                    const st = getStatus(bb.id, sp, format(m.month, 'yyyy-MM'))
                    return st === 'settled' ? s + m.amount : s
                  }, 0)

                  return (
                    <div key={expandKey} className="border rounded-lg overflow-hidden">
                      {/* Sales person header */}
                      <div
                        className="flex items-center justify-between px-3 py-2.5 bg-gray-50 cursor-pointer"
                        onClick={() => toggleExpanded(expandKey)}
                      >
                        <div>
                          <p className="text-sm font-semibold">{sp}</p>
                          <p className="text-[10px] text-gray-400">{data.bookings.length} booking{data.bookings.length > 1 ? 's' : ''} • {data.monthlyBreakdown.length} months</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-xs font-bold">RM {Math.round(totalAmt).toLocaleString()}</p>
                            <p className="text-[10px] text-green-600">✅ RM {Math.round(settledAmt).toLocaleString()}</p>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                        </div>
                      </div>

                      {/* Expanded monthly breakdown */}
                      {isExpanded && (
                        <div className="border-t bg-white">
                          {data.monthlyBreakdown.map(mb => {
                            const monthKey = format(mb.month, 'yyyy-MM')
                            const status = getStatus(bb.id, sp, monthKey)
                            const display = STATUS_DISPLAY[status]
                            const isCurrentMonth = isSameMonth(mb.month, new Date())
                            const monthExpandKey = `${expandKey}-${monthKey}`
                            const isMonthExpanded = expandedMonths.has(monthExpandKey)

                            return (
                              <div key={monthKey} className="border-t">
                                {/* Month header row - clickable to expand */}
                                <div
                                  className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isCurrentMonth ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                                  onClick={() => toggleMonth(monthExpandKey)}
                                >
                                  <div className="flex items-center gap-1.5">
                                    {isMonthExpanded ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />}
                                    <div>
                                      <span className={`text-xs ${isCurrentMonth ? 'font-semibold' : 'text-gray-600'}`}>
                                        {format(mb.month, 'MMM yyyy')}
                                        {isCurrentMonth && <span className="text-[8px] text-yellow-600 ml-1">← now</span>}
                                      </span>
                                      <p className="text-[10px] text-gray-400 truncate max-w-[150px]">{mb.clients.map(c => c.name).join(', ')}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium">RM {Math.round(mb.amount).toLocaleString()}</span>
                                    {(() => {
                                      const total = mb.clients.length
                                      const settled = mb.clients.filter(c => getBookingMonthStatus(c.bookingId, monthKey) === 'settled').length
                                      const waiting = mb.clients.filter(c => getBookingMonthStatus(c.bookingId, monthKey) === 'waiting_profit_share').length
                                      const pct = total > 0 ? Math.round((settled / total) * 100) : 0
                                      return (
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                                          settled === total ? 'bg-green-100 text-green-700' :
                                          settled > 0 || waiting > 0 ? 'bg-blue-100 text-blue-700' :
                                          'bg-yellow-100 text-yellow-700'
                                        }`}>
                                          {settled === total ? '✅ Settled' : `${settled}/${total} settled`}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                </div>

                                {/* Expanded: per-client detail */}
                                {isMonthExpanded && (
                                  <div className="bg-gray-50 border-t">
                                    {mb.clients.map((client, idx) => {
                                      const clientStatus = getBookingMonthStatus(client.bookingId, monthKey)
                                      const clientDisplay = STATUS_DISPLAY[clientStatus]
                                      return (
                                        <div key={`${client.bookingId}-${idx}`} className="flex items-center justify-between px-5 py-1.5 border-t border-gray-100">
                                          <div>
                                            <p className="text-xs text-gray-700">{client.name}</p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-gray-500">RM {Math.round(client.amount).toLocaleString()}</span>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className={`text-[9px] h-5 px-1.5 ${clientDisplay.color}`}
                                              onClick={() => cycleBookingStatus(client.bookingId, monthKey, client.amount)}
                                            >
                                              {clientDisplay.icon} {clientDisplay.label}
                                            </Button>
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
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
