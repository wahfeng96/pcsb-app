'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Building2, Users, CalendarDays, DollarSign } from 'lucide-react'
import { format, addDays, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns'
import { computeBookingStatus } from '@/lib/booking-utils'
import type { Billboard, Booking, Client } from '@/types/database'
import { BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/database'
import Link from 'next/link'

export default function DashboardPage() {
  const supabase = createClient()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<(Booking & { client: Client; billboard: Billboard })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [occView, setOccView] = useState<'today' | 'month'>('today')

  useEffect(() => {
    async function load() {
      const [bb, bk, cl] = await Promise.all([
        supabase.from('billboards').select('*').order('name'),
        supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').order('start_date'),
        supabase.from('clients').select('*').order('updated_at', { ascending: false }),
      ])
      setBillboards(bb.data || [])
      setBookings(bk.data || [])
      setClients(cl.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const next7days = addDays(today, 7)
  const monthStart = startOfMonth(today)
  const monthEnd = endOfMonth(today)

  function getOccupancy(billboardId: string): { count: number; brands: string[] } {
    const active = bookings.filter(b => {
      if (b.billboard_id !== billboardId) return false
      const status = computeBookingStatus(b.start_date, b.end_date, b.status)
      if (status === 'cancelled') return false
      const bStart = new Date(b.start_date)
      const bEnd = new Date(b.end_date + 'T23:59:59')
      if (occView === 'today') {
        return bStart <= today && bEnd >= today
      } else {
        return bStart <= monthEnd && bEnd >= monthStart
      }
    })
    return {
      count: active.length,
      brands: active.map(b => b.brand_name || b.client?.company_name || '?'),
    }
  }

  function getActiveRevenue(billboardId: string): number {
    return bookings.filter(b => {
      if (b.billboard_id !== billboardId) return false
      const bStart = new Date(b.start_date)
      const bEnd = new Date(b.end_date + 'T23:59:59')
      if (occView === 'today') {
        return bStart <= today && bEnd >= today
      } else {
        return bStart <= monthEnd && bEnd >= monthStart
      }
    }).reduce((s, b) => s + (b.monthly_rate || 0), 0)
  }

  // Compute client status
  function getClientStatus(clientId: string): { label: string; color: string; icon: string } {
    const cb = bookings.filter(b => b.client_id === clientId && computeBookingStatus(b.start_date, b.end_date, b.status) !== 'cancelled')
    const hasLive = cb.some(b => new Date(b.start_date) <= today && new Date(b.end_date + 'T23:59:59') >= today)
    if (hasLive) return { label: 'Active', color: 'bg-green-100 text-green-800', icon: '🟢' }
    const hasUpcoming = cb.some(b => new Date(b.start_date) > today)
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
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Revenue</span>
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
            const pct = Math.min((count / bb.max_slots) * 100, 100)
            const revenue = getActiveRevenue(bb.id)
            return (
              <Card key={bb.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">{bb.name}</p>
                      <p className="text-xs text-gray-500">{bb.location}</p>
                    </div>
                    <span className={`text-lg font-bold ${count >= bb.max_slots ? 'text-red-600' : count > 0 ? 'text-green-700' : 'text-gray-400'}`}>{count}/{bb.max_slots}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                    <div className={`h-2.5 rounded-full transition-all ${pct >= 90 ? 'bg-red-600' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {revenue > 0 && <p className="text-xs text-gray-500 mb-1">RM {revenue.toLocaleString()}/mo</p>}
                  {brands.length > 0 && (
                    <p className="text-[10px] text-gray-400 truncate">{brands.join(', ')}</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

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
