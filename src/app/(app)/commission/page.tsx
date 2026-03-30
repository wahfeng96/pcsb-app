'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { format, parseISO, isSameMonth } from 'date-fns'
import { getRevenueMonths } from '@/lib/booking-utils'
import type { Billboard, Booking, Client, CommissionStatus } from '@/types/database'
import { COMMISSION_STATUS_CONFIG } from '@/types/database'
import { useRole } from '@/lib/hooks/use-role'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }
type CommissionRecord = { id: string; booking_id: string; month: string; amount: number; status: CommissionStatus }
type ProfitShareRecord = { id: string; booking_id?: string; month: string; status: string }

const STATUS_CYCLE: CommissionStatus[] = ['pending_payment', 'waiting_to_be_paid', 'settled']

export default function CommissionPage() {
  const supabase = createClient()
  const { canEdit } = useRole()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [commissions, setCommissions] = useState<CommissionRecord[]>([])
  const [profitRecords, setProfitRecords] = useState<ProfitShareRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBb, setSelectedBb] = useState<string>('all')
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState<number | 'all'>('all')
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const autoSyncDone = useRef(false)

  async function load() {
    const [bb, bk, cm, pr] = await Promise.all([
      supabase.from('billboards').select('*').order('name'),
      supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').neq('status', 'cancelled').order('start_date'),
      supabase.from('commissions').select('*'),
      supabase.from('profit_sharing').select('id, booking_id, month, status'),
    ])
    setBillboards(bb.data || [])
    setBookings(bk.data || [])
    setCommissions(cm.data || [])
    setProfitRecords(pr.data || [])
    setLoading(false)
    return { commissions: cm.data || [], profitRecords: pr.data || [] }
  }

  useEffect(() => { load() }, [])

  // Auto-sync: if profit_sharing is waiting/settled but commission is still pending → auto-update
  useEffect(() => {
    if (loading || autoSyncDone.current || commissions.length === 0) return
    autoSyncDone.current = true

    const toUpdate = commissions.filter(c => {
      if (c.status !== 'pending_payment') return false
      const pr = profitRecords.find(r => r.booking_id === c.booking_id && r.month === c.month)
      return pr?.status === 'waiting_profit_share' || pr?.status === 'settled'
    })

    if (toUpdate.length > 0) {
      Promise.all(toUpdate.map(c =>
        supabase.from('commissions').update({ status: 'waiting_to_be_paid' }).eq('id', c.id)
      )).then(() => {
        // Optimistic update
        setCommissions(prev => prev.map(c =>
          toUpdate.some(u => u.id === c.id) ? { ...c, status: 'waiting_to_be_paid' as CommissionStatus } : c
        ))
      })
    }
  }, [loading, commissions, profitRecords])

  function getCommissionStatus(bookingId: string, monthKey: string): CommissionStatus {
    const rec = commissions.find(c => c.booking_id === bookingId && c.month === monthKey)
    return rec?.status || 'pending_payment'
  }

  function isAutoLinked(bookingId: string, monthKey: string): boolean {
    const pr = profitRecords.find(r => r.booking_id === bookingId && r.month === monthKey)
    const status = getCommissionStatus(bookingId, monthKey)
    return status === 'waiting_to_be_paid' && (pr?.status === 'waiting_profit_share' || pr?.status === 'settled')
  }

  async function cycleStatus(bookingId: string, monthKey: string, amount: number) {
    const current = getCommissionStatus(bookingId, monthKey)
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]

    const existing = commissions.find(c => c.booking_id === bookingId && c.month === monthKey)
    if (existing) {
      await supabase.from('commissions').update({ status: next }).eq('id', existing.id)
    } else {
      await supabase.from('commissions').insert({ booking_id: bookingId, month: monthKey, amount, status: next })
    }
    // Optimistic update
    setCommissions(prev => {
      if (existing) return prev.map(c => c.id === existing.id ? { ...c, status: next } : c)
      return [...prev, { id: crypto.randomUUID(), booking_id: bookingId, month: monthKey, amount, status: next }]
    })
  }

  function toggleSales(key: string) {
    setExpandedSales(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleMonth(key: string) {
    setExpandedMonths(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Build data: per billboard → per sales person → monthly commission breakdown
  const billboardData = useMemo(() => {
    const filteredBbs = selectedBb === 'all' ? billboards : billboards.filter(b => b.id === selectedBb)

    return filteredBbs.map(bb => {
      // Only bookings with commission AND sales person
      const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.commission_percent > 0 && b.sales_person)

      const salesMap = new Map<string, { bookings: BookingWithRefs[]; monthlyBreakdown: { month: Date; monthKey: string; totalCommission: number; clients: { name: string; amount: number; commissionPct: number; commissionAmt: number; bookingId: string }[] }[] }>()

      bbBookings.forEach(b => {
        const sp = b.sales_person || 'Unknown'
        if (!salesMap.has(sp)) salesMap.set(sp, { bookings: [], monthlyBreakdown: [] })
        salesMap.get(sp)!.bookings.push(b)
      })

      salesMap.forEach((data, sp) => {
        const monthMap = new Map<string, { month: Date; totalCommission: number; clients: { name: string; amount: number; commissionPct: number; commissionAmt: number; bookingId: string }[] }>()

        data.bookings.forEach(b => {
          const months = getRevenueMonths(parseISO(b.start_date), b.monthly_rate, b.total_amount)
          const commAmt = b.monthly_rate * (b.commission_percent || 0) / 100

          months.forEach(m => {
            const key = format(m, 'yyyy-MM')
            if (!monthMap.has(key)) monthMap.set(key, { month: m, totalCommission: 0, clients: [] })
            const entry = monthMap.get(key)!
            entry.totalCommission += commAmt
            entry.clients.push({ name: b.brand_name || b.client?.company_name || 'Unknown', amount: b.monthly_rate, commissionPct: b.commission_percent || 0, commissionAmt: commAmt, bookingId: b.id })
          })
        })

        data.monthlyBreakdown = Array.from(monthMap.values())
          .filter(mb => {
            const y = mb.month.getFullYear()
            const m = mb.month.getMonth()
            if (y !== filterYear) return false
            if (filterMonth !== 'all' && m !== filterMonth) return false
            return true
          })
          .sort((a, b) => a.month.getTime() - b.month.getTime())
      })

      // Totals
      let totalPending = 0, totalWaiting = 0, totalSettled = 0
      salesMap.forEach((data) => {
        data.monthlyBreakdown.forEach(mb => {
          mb.clients.forEach(client => {
            const status = getCommissionStatus(client.bookingId, format(mb.month, 'yyyy-MM'))
            if (status === 'pending_payment') totalPending += client.commissionAmt
            else if (status === 'waiting_to_be_paid') totalWaiting += client.commissionAmt
            else totalSettled += client.commissionAmt
          })
        })
      })

      return { billboard: bb, salesPersons: salesMap, totalPending, totalWaiting, totalSettled }
    }).filter(d => d.salesPersons.size > 0)
  }, [billboards, bookings, commissions, selectedBb, filterYear, filterMonth])

  const grandTotals = useMemo(() => ({
    pending: billboardData.reduce((s, d) => s + d.totalPending, 0),
    waiting: billboardData.reduce((s, d) => s + d.totalWaiting, 0),
    settled: billboardData.reduce((s, d) => s + d.totalSettled, 0),
  }), [billboardData])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Commission</h1>

      {/* Billboard filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={selectedBb === 'all' ? 'default' : 'outline'} onClick={() => setSelectedBb('all')} className={selectedBb === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}>All</Button>
        {billboards.map(bb => (
          <Button key={bb.id} size="sm" variant={selectedBb === bb.id ? 'default' : 'outline'} onClick={() => setSelectedBb(bb.id)} className={`whitespace-nowrap text-xs ${selectedBb === bb.id ? 'bg-red-600 hover:bg-red-700' : ''}`}>{bb.name}</Button>
        ))}
      </div>

      {/* Year/Month filter */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setFilterYear(y => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold min-w-[50px] text-center">{filterYear}</span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setFilterYear(y => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          <Button size="sm" variant={filterMonth === 'all' ? 'default' : 'outline'} onClick={() => setFilterMonth('all')} className={`text-xs ${filterMonth === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}`}>All</Button>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <Button key={m} size="sm" variant={filterMonth === i ? 'default' : 'outline'} onClick={() => setFilterMonth(i)} className={`text-xs ${filterMonth === i ? 'bg-red-600 hover:bg-red-700' : ''}`}>{m}</Button>
          ))}
        </div>
      </div>

      {/* Grand Summary */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Commission Overview</h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-yellow-50 rounded p-3 text-center border border-yellow-200">
              <p className="text-[10px] text-yellow-700">💰 Pending Payment</p>
              <p className="text-lg font-bold text-yellow-700">RM {Math.round(grandTotals.pending).toLocaleString()}</p>
            </div>
            <div className="bg-orange-50 rounded p-3 text-center border border-orange-200">
              <p className="text-[10px] text-orange-700">⏳ Waiting to be Paid</p>
              <p className="text-lg font-bold text-orange-700">RM {Math.round(grandTotals.waiting).toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded p-3 text-center border border-green-200">
              <p className="text-[10px] text-green-700">✅ Settled</p>
              <p className="text-lg font-bold text-green-700">RM {Math.round(grandTotals.settled).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per Billboard */}
      {billboardData.length === 0 ? (
        <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No bookings with commission found. Add commission % when creating a booking.</CardContent></Card>
      ) : billboardData.map(({ billboard: bb, salesPersons, totalPending, totalWaiting, totalSettled }) => (
        <Card key={bb.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{bb.name}</h3>
                <p className="text-xs text-gray-500">{bb.location}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-xs mb-3">
              <div className="bg-yellow-50 rounded p-1.5 text-center">
                <p className="text-[10px] text-yellow-600">Pending</p>
                <p className="font-bold text-yellow-700">RM {Math.round(totalPending).toLocaleString()}</p>
              </div>
              <div className="bg-orange-50 rounded p-1.5 text-center">
                <p className="text-[10px] text-orange-600">Waiting</p>
                <p className="font-bold text-orange-700">RM {Math.round(totalWaiting).toLocaleString()}</p>
              </div>
              <div className="bg-green-50 rounded p-1.5 text-center">
                <p className="text-[10px] text-green-600">Settled</p>
                <p className="font-bold text-green-700">RM {Math.round(totalSettled).toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-2">
              {Array.from(salesPersons.entries()).map(([sp, data]) => {
                const expandKey = `${bb.id}-${sp}`
                const isExpanded = expandedSales.has(expandKey)
                const totalComm = data.monthlyBreakdown.reduce((s, m) => s + m.totalCommission, 0)
                const settledComm = data.monthlyBreakdown.reduce((s, mb) => {
                  return s + mb.clients.reduce((cs, c) => {
                    return getCommissionStatus(c.bookingId, format(mb.month, 'yyyy-MM')) === 'settled' ? cs + c.commissionAmt : cs
                  }, 0)
                }, 0)

                return (
                  <div key={expandKey} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 cursor-pointer" onClick={() => toggleSales(expandKey)}>
                      <div>
                        <p className="text-sm font-semibold">{sp}</p>
                        <p className="text-[10px] text-gray-400">{data.bookings.length} booking{data.bookings.length > 1 ? 's' : ''} • {data.monthlyBreakdown.length} months</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs font-bold">RM {Math.round(totalComm).toLocaleString()}</p>
                          <p className="text-[10px] text-green-600">✅ RM {Math.round(settledComm).toLocaleString()}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t bg-white">
                        {data.monthlyBreakdown.map(mb => {
                          const monthKey = format(mb.month, 'yyyy-MM')
                          const isCurrentMonth = isSameMonth(mb.month, new Date())
                          const monthExpandKey = `${expandKey}-${monthKey}`
                          const isMonthExpanded = expandedMonths.has(monthExpandKey)
                          const settled = mb.clients.filter(c => getCommissionStatus(c.bookingId, monthKey) === 'settled').length
                          const total = mb.clients.length

                          return (
                            <div key={monthKey} className="border-t">
                              <div className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isCurrentMonth ? 'bg-yellow-50' : 'hover:bg-gray-50'}`} onClick={() => toggleMonth(monthExpandKey)}>
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
                                  <span className="text-xs font-medium">RM {Math.round(mb.totalCommission).toLocaleString()}</span>
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                                    settled === total ? 'bg-green-100 text-green-700' :
                                    settled > 0 ? 'bg-orange-100 text-orange-700' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {settled === total ? '✅ Settled' : `${settled}/${total}`}
                                  </span>
                                </div>
                              </div>

                              {isMonthExpanded && (
                                <div className="bg-gray-50 border-t">
                                  {mb.clients.map((client, idx) => {
                                    const cStatus = getCommissionStatus(client.bookingId, monthKey)
                                    const cDisplay = COMMISSION_STATUS_CONFIG[cStatus]
                                    const autoLinked = isAutoLinked(client.bookingId, monthKey)

                                    return (
                                      <div key={`${client.bookingId}-${idx}`} className="flex items-center justify-between px-5 py-1.5 border-t border-gray-100">
                                        <div>
                                          <p className="text-xs text-gray-700">{client.name}</p>
                                          <p className="text-[10px] text-gray-400">RM {client.amount.toLocaleString()} × {client.commissionPct}%</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-medium">RM {Math.round(client.commissionAmt).toLocaleString()}</span>
                                          {canEdit ? (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className={`text-[9px] h-5 px-1.5 ${cDisplay.color}`}
                                              onClick={(e) => { e.stopPropagation(); cycleStatus(client.bookingId, monthKey, client.commissionAmt) }}
                                            >
                                              {autoLinked && <Lock className="h-2.5 w-2.5 mr-0.5" />}
                                              {cDisplay.icon} {cDisplay.label}
                                            </Button>
                                          ) : (
                                            <Badge variant="outline" className={`text-[9px] ${cDisplay.color}`}>{cDisplay.icon} {cDisplay.label}</Badge>
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
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
