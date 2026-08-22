'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Building2, Users, CalendarDays, DollarSign, ChevronRight, TrendingUp, TrendingDown, X } from 'lucide-react'
import { format, addDays, isWithinInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { computeBookingStatus, getRevenueMonths } from '@/lib/booking-utils'
import { getBillboardMaxSlots } from '@/lib/billboard-slots'
import type { Billboard, Booking, Client } from '@/types/database'
import { BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/database'
import Link from 'next/link'

type MonthlyPayment = {
  id: string
  booking_id: string
  month: string
  amount: number
  status: 'pending_invoice' | 'invoice_sent' | 'completed'
  invoice_number?: string
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function RevenueChart({ current, previous, year }: { current: number[]; previous: number[]; year: number }) {
  const max = Math.max(...current, ...previous, 1)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[680px]">
        <div className="flex items-center justify-end gap-4 mb-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-600" />{year}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gray-300" />{year - 1}</span>
        </div>
        <div className="flex h-52 items-end gap-2 border-b border-gray-200">
          {MONTH_LABELS.map((month, index) => (
            <div key={month} className="flex h-full flex-1 flex-col justify-end">
              <div className="flex flex-1 items-end justify-center gap-1">
                <div
                  className="w-[38%] rounded-t bg-gray-300 transition-all"
                  style={{ height: `${Math.max((previous[index] / max) * 100, previous[index] > 0 ? 2 : 0)}%` }}
                  title={`${month} ${year - 1}: RM ${previous[index].toLocaleString()}`}
                />
                <div
                  className="w-[38%] rounded-t bg-red-600 transition-all"
                  style={{ height: `${Math.max((current[index] / max) * 100, current[index] > 0 ? 2 : 0)}%` }}
                  title={`${month} ${year}: RM ${current[index].toLocaleString()}`}
                />
              </div>
              <p className="py-2 text-center text-[11px] text-gray-500">{month}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const supabase = createClient()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<(Booking & { client: Client; billboard: Billboard })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [monthlyPayments, setMonthlyPayments] = useState<MonthlyPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [occView, setOccView] = useState<'today' | 'month'>('today')
  const [revenueOpen, setRevenueOpen] = useState(false)
  const [revenueYear, setRevenueYear] = useState(new Date().getFullYear())
  const [revenueBillboardId, setRevenueBillboardId] = useState('all')

  useEffect(() => {
    async function load() {
      const [bb, bk, cl, mp] = await Promise.all([
        supabase.from('billboards').select('*').order('name'),
        supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').order('start_date'),
        supabase.from('clients').select('*').order('updated_at', { ascending: false }),
        supabase.from('monthly_payments').select('*'),
      ])
      setBillboards(bb.data || [])
      setBookings(bk.data || [])
      setClients(cl.data || [])
      setMonthlyPayments(mp.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Use MYT (UTC+8) for date calculations since business is in Malaysia
  const now = new Date()
  const mytMs = now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000
  const today = new Date(mytMs)
  today.setHours(0, 0, 0, 0)
  const next7days = addDays(today, 7)
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  // MYT date string for reliable comparisons (no timezone issues)
  const todayStr = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-')
  const monthStartStr = [monthStart.getFullYear(), String(monthStart.getMonth()+1).padStart(2,'0'), String(monthStart.getDate()).padStart(2,'0')].join('-')
  const monthEndStr = [monthEnd.getFullYear(), String(monthEnd.getMonth()+1).padStart(2,'0'), String(monthEnd.getDate()).padStart(2,'0')].join('-')

  function getOccupancy(billboardId: string): { count: number; brands: { name: string; spotSize: number }[] } {
    const active = bookings.filter(b => {
      if (b.billboard_id !== billboardId) return false
      const status = computeBookingStatus(b.start_date, b.end_date, b.status)
      if (status === 'cancelled') return false
      if (occView === 'today') {
        return b.start_date <= todayStr && b.end_date >= todayStr
      } else {
        return b.start_date <= monthEndStr && b.end_date >= monthStartStr
      }
    })
    return {
      count: active.reduce((sum, b) => sum + (b.spot_size || 1), 0),
      brands: active.map(b => ({ name: b.brand_name || b.client?.company_name || '?', spotSize: b.spot_size || 1 })),
    }
  }

  function getActiveRevenue(billboardId: string): number {
    return bookings.filter(b => {
      if (b.billboard_id !== billboardId) return false
      if (occView === 'today') {
        return b.start_date <= todayStr && b.end_date >= todayStr
      } else {
        return b.start_date <= monthEndStr && b.end_date >= monthStartStr
      }
    }).reduce((s, b) => s + (b.monthly_rate || 0), 0)
  }

  // Compute client status
  function getClientStatus(clientId: string): { label: string; color: string; icon: string } {
    const cb = bookings.filter(b => b.client_id === clientId && computeBookingStatus(b.start_date, b.end_date, b.status) !== 'cancelled')
    const hasLive = cb.some(b => b.start_date <= todayStr && b.end_date >= todayStr)
    if (hasLive) return { label: 'Active', color: 'bg-green-100 text-green-800', icon: '🟢' }
    const hasUpcoming = cb.some(b => b.start_date > todayStr)
    if (hasUpcoming) return { label: 'Upcoming', color: 'bg-yellow-100 text-yellow-800', icon: '🟡' }
    return { label: 'Past', color: 'bg-gray-100 text-gray-600', icon: '⚪' }
  }

  const upcomingEvents = bookings.filter(b => {
    const start = new Date(b.start_date)
    const end = new Date(b.end_date)
    const status = computeBookingStatus(b.start_date, b.end_date, b.status)
    if (status === 'cancelled') return false
    return isWithinInterval(start, { start: today, end: next7days }) ||
           isWithinInterval(end, { start: today, end: next7days })
  })

  const activeBookings = bookings.filter(b => {
    const s = computeBookingStatus(b.start_date, b.end_date, b.status)
    return s === 'live' || s === 'upcoming'
  })

  const revenueEntries = useMemo(() => {
    return bookings.flatMap(booking => {
      if (computeBookingStatus(booking.start_date, booking.end_date, booking.status) === 'cancelled') return []
      return getRevenueMonths(parseISO(booking.start_date), booking.monthly_rate, booking.total_amount).map(month => {
        const monthKey = format(month, 'yyyy-MM')
        const payment = monthlyPayments.find(p => p.booking_id === booking.id && p.month === monthKey)
        return { booking, month, monthKey, amount: booking.monthly_rate || 0, payment }
      })
    })
  }, [bookings, monthlyPayments])

  const revenueYears = useMemo(() => {
    const years = new Set(revenueEntries.map(entry => entry.month.getFullYear()))
    years.add(today.getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [revenueEntries, today])

  const filteredRevenueEntries = revenueEntries.filter(entry =>
    revenueBillboardId === 'all' || entry.booking.billboard_id === revenueBillboardId
  )
  const currentYearEntries = filteredRevenueEntries
    .filter(entry => entry.month.getFullYear() === revenueYear)
    .sort((a, b) => b.month.getTime() - a.month.getTime())
  const previousYearEntries = filteredRevenueEntries.filter(entry => entry.month.getFullYear() === revenueYear - 1)
  const currentRevenue = currentYearEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const previousRevenue = previousYearEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const revenueDifference = currentRevenue - previousRevenue
  const revenueChange = previousRevenue > 0 ? (revenueDifference / previousRevenue) * 100 : null
  const currentMonthlyRevenue = MONTH_LABELS.map((_, month) => currentYearEntries
    .filter(entry => entry.month.getMonth() === month)
    .reduce((sum, entry) => sum + entry.amount, 0))
  const previousMonthlyRevenue = MONTH_LABELS.map((_, month) => previousYearEntries
    .filter(entry => entry.month.getMonth() === month)
    .reduce((sum, entry) => sum + entry.amount, 0))

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Building2 className="h-4 w-4" />
              <span className="text-xs">Billboards</span>
            </div>
            <p className="text-2xl font-bold">{billboards.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Clients</span>
            </div>
            <p className="text-2xl font-bold">{clients.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs">Active Bookings</span>
            </div>
            <p className="text-2xl font-bold">{activeBookings.length}</p>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          aria-label="Open revenue analytics"
          className="group cursor-pointer transition-all hover:border-red-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          onClick={() => setRevenueOpen(true)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setRevenueOpen(true) }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Revenue</span>
              <ChevronRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="flex rounded-lg overflow-hidden border mt-1">
              <div className="flex-1 bg-green-50 p-2 text-center border-r">
                <p className="text-[10px] text-green-700 font-medium">Settled</p>
                <p className="text-sm font-bold text-green-700">
                  RM {bookings.filter(b => b.payment_status === 'settled' && computeBookingStatus(b.start_date, b.end_date, b.status) !== 'cancelled').reduce((sum, b) => sum + (b.total_amount || 0), 0).toLocaleString()}
                </p>
              </div>
              <div className="flex-1 bg-red-50 p-2 text-center">
                <p className="text-[10px] text-red-700 font-medium">Total</p>
                <p className="text-sm font-bold text-red-700">
                  RM {bookings.filter(b => computeBookingStatus(b.start_date, b.end_date, b.status) !== 'cancelled').reduce((sum, b) => sum + (b.total_amount || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={revenueOpen} onOpenChange={setRevenueOpen}>
        <DialogContent className="max-w-5xl w-[calc(100%-2rem)] p-4 sm:p-6">
          <button type="button" aria-label="Close revenue analytics" onClick={() => setRevenueOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <X className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle>Revenue Analytics</DialogTitle>
            <p className="text-sm text-gray-500">Compare annual performance and see the campaigns behind the revenue.</p>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-xs font-medium text-gray-600">
              Year
              <select value={revenueYear} onChange={e => setRevenueYear(Number(e.target.value))} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm text-gray-900">
                {revenueYears.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="flex-1 text-xs font-medium text-gray-600">
              Screen
              <select value={revenueBillboardId} onChange={e => setRevenueBillboardId(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm text-gray-900">
                <option value="all">All screens</option>
                {billboards.map(bb => <option key={bb.id} value={bb.id}>{bb.name}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-red-50 p-4">
              <p className="text-xs font-medium text-red-700">Revenue {revenueYear}</p>
              <p className="mt-1 text-2xl font-bold text-red-700">RM {currentRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-600">Revenue {revenueYear - 1}</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">RM {previousRevenue.toLocaleString()}</p>
            </div>
            <div className={`rounded-lg p-4 ${revenueDifference >= 0 ? 'bg-green-50' : 'bg-orange-50'}`}>
              <p className={`text-xs font-medium ${revenueDifference >= 0 ? 'text-green-700' : 'text-orange-700'}`}>Year-on-year change</p>
              <div className={`mt-1 flex items-center gap-2 ${revenueDifference >= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                {revenueDifference >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                <p className="text-2xl font-bold">{revenueChange === null ? (currentRevenue > 0 ? 'New' : '—') : `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}%`}</p>
              </div>
              <p className="mt-1 text-xs text-gray-500">{revenueDifference >= 0 ? '+' : '-'}RM {Math.abs(revenueDifference).toLocaleString()}</p>
            </div>
          </div>

          <div className="rounded-lg border p-3 sm:p-4">
            <h3 className="mb-1 text-sm font-semibold">Monthly revenue</h3>
            <RevenueChart current={currentMonthlyRevenue} previous={previousMonthlyRevenue} year={revenueYear} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Contributing campaigns</h3>
              <span className="text-xs text-gray-500">{currentYearEntries.length} monthly entries</span>
            </div>
            {currentYearEntries.length === 0 ? (
              <div className="rounded-lg border p-8 text-center text-sm text-gray-500">No revenue recorded for this selection.</div>
            ) : (
              <div className="divide-y overflow-hidden rounded-lg border">
                {currentYearEntries.map(entry => (
                  <div key={`${entry.booking.id}-${entry.monthKey}`} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500">{format(entry.month, 'MMM yyyy')}</span>
                        <Badge variant="outline" className="text-[10px]">{entry.booking.billboard?.name || 'Screen'}</Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{entry.booking.brand_name || entry.booking.client?.company_name || 'Campaign'}</p>
                      <p className="text-xs text-gray-500">{entry.booking.client?.company_name} · {entry.payment?.invoice_number || 'No invoice number'}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <p className="text-sm font-bold">RM {entry.amount.toLocaleString()}</p>
                      <Badge variant="secondary" className={`text-[10px] ${entry.payment?.status === 'completed' ? 'bg-green-100 text-green-800' : entry.payment?.status === 'invoice_sent' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {entry.payment?.status === 'completed' ? 'Completed' : entry.payment?.status === 'invoice_sent' ? 'Invoice sent' : 'Pending invoice'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Billboard Occupancy */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Billboard Occupancy</h2>
          <div className="flex gap-1">
            <Button size="sm" variant={occView === 'today' ? 'default' : 'outline'} onClick={() => setOccView('today')} className={`text-xs h-7 ${occView === 'today' ? 'bg-red-600 hover:bg-red-700' : ''}`}>Today</Button>
            <Button size="sm" variant={occView === 'month' ? 'default' : 'outline'} onClick={() => setOccView('month')} className={`text-xs h-7 ${occView === 'month' ? 'bg-red-600 hover:bg-red-700' : ''}`}>{format(today, 'MMM')}</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {billboards.map(bb => {
            const { count, brands } = getOccupancy(bb.id)
            const maxSlots = getBillboardMaxSlots(bb)
            const pct = Math.min((count / maxSlots) * 100, 100)
            const revenue = getActiveRevenue(bb.id)
            const countDisplay = count % 1 === 0 ? count : count.toFixed(1)
            return (
              <Card key={bb.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">{bb.name}</p>
                      <p className="text-xs text-gray-500">{bb.location}</p>
                    </div>
                    <span className={`text-lg font-bold ${count >= maxSlots ? 'text-red-600' : count > 0 ? 'text-green-700' : 'text-gray-400'}`}>{countDisplay}/{maxSlots}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                    <div className={`h-2.5 rounded-full transition-all ${pct >= 90 ? 'bg-red-600' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {revenue > 0 && <p className="text-xs text-gray-500 mb-1">RM {revenue.toLocaleString()}/mo</p>}
                  {brands.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {brands.map((brand, i) => (
                        <span key={i} className={`inline-block text-[11px] font-medium px-1.5 py-0.5 rounded ${brand.spotSize < 1 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>{brand.name}{brand.spotSize < 1 ? ` (${brand.spotSize})` : ''}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Currently Live Brands */}
      {occView === 'today' && (() => {
        const liveBrands = bookings.filter(b => {
          const status = computeBookingStatus(b.start_date, b.end_date, b.status)
          if (status === 'cancelled') return false
          return b.start_date <= todayStr && b.end_date >= todayStr
        })
        const totalSpots = liveBrands.reduce((sum, b) => sum + (b.spot_size || 1), 0)
        const totalSpotsDisplay = totalSpots % 1 === 0 ? totalSpots : totalSpots.toFixed(1)
        const grouped = liveBrands.reduce((acc, b) => {
          const brand = b.brand_name || b.client?.company_name || '?'
          if (!acc[brand]) acc[brand] = []
          acc[brand].push(b)
          return acc
        }, {} as Record<string, typeof liveBrands>)
        const brandList = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]))
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">🟢 Live Now ({totalSpotsDisplay} spots)</h2>
            </div>
            {brandList.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No live brands today</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {brandList.map(([brand, bks]) => {
                  const brandSpots = bks.reduce((sum, b) => sum + (b.spot_size || 1), 0)
                  const brandSpotsDisplay = brandSpots % 1 === 0 ? brandSpots : brandSpots.toFixed(1)
                  return (
                  <Card key={brand}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{brand}</p>
                        <span className="text-xs text-gray-500">{brandSpotsDisplay} spot{brandSpots !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {bks.map(b => {
                          const isHalf = (b.spot_size || 1) < 1
                          return (
                          <span key={b.id} className={`text-[11px] px-1.5 py-0.5 rounded ${isHalf ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                            {b.billboard?.name || 'Billboard'} • Slot {b.slot_number}{isHalf ? ` (${b.spot_size})` : ''}
                          </span>
                        )})}
                      </div>
                    </CardContent>
                  </Card>
                )})}
              </div>
            )}
          </div>
        )
      })()}

      {/* Upcoming Events */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming (Next 7 Days)</h2>
        {upcomingEvents.length === 0 ? (
          <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No upcoming events</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.slice(0, 10).map(booking => {
              const status = computeBookingStatus(booking.start_date, booking.end_date, booking.status)
              return (
                <Card key={booking.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{booking.brand_name || booking.client?.company_name}</p>
                      <p className="text-xs text-gray-500">{booking.billboard?.name}</p>
                      <p className="text-xs text-gray-400">
                        {format(new Date(booking.start_date), 'dd MMM')} → {format(new Date(booking.end_date), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className={BOOKING_STATUS_CONFIG[status]?.color}>
                        {BOOKING_STATUS_CONFIG[status]?.label}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_CONFIG[booking.payment_status]?.color}`}>
                        {PAYMENT_STATUS_CONFIG[booking.payment_status]?.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Clients */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Recent Clients</h2>
          <Link href="/clients" className="text-sm text-red-600 hover:underline">View all</Link>
        </div>
        <div className="space-y-2">
          {clients.slice(0, 5).map(client => {
            const cs = getClientStatus(client.id)
            return (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="hover:bg-gray-50 transition-colors">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{client.company_name}</p>
                      <p className="text-xs text-gray-500">{client.contact_person}</p>
                    </div>
                    <Badge variant="secondary" className={cs.color}>{cs.icon} {cs.label}</Badge>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
