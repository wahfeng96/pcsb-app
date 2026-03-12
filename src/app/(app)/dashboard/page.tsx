'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Users, CalendarDays, DollarSign } from 'lucide-react'
import { format, addDays, isWithinInterval } from 'date-fns'
import type { Billboard, Booking, Client } from '@/types/database'
import { BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/database'
import Link from 'next/link'

export default function DashboardPage() {
  const supabase = createClient()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<(Booking & { client: Client; billboard: Billboard })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

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
  const next7days = addDays(today, 7)

  const activeBookings = bookings.filter(b => b.status === 'live' || b.status === 'upcoming')
  const upcomingEvents = bookings.filter(b => {
    const start = new Date(b.start_date)
    const end = new Date(b.end_date)
    return isWithinInterval(start, { start: today, end: next7days }) ||
           isWithinInterval(end, { start: today, end: next7days })
  })

  function getOccupancy(billboardId: string) {
    return bookings.filter(b => b.billboard_id === billboardId && (b.status === 'live' || b.status === 'upcoming')).length
  }

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
              <span className="text-xs">Pending Payment</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {bookings.filter(b => b.payment_status === 'pending_payment').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Billboard Occupancy */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Billboard Occupancy</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {billboards.map(bb => {
            const occ = getOccupancy(bb.id)
            const pct = (occ / bb.max_slots) * 100
            return (
              <Card key={bb.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">{bb.name}</p>
                      <p className="text-xs text-gray-500">{bb.location}</p>
                    </div>
                    <span className="text-sm font-bold">{occ}/{bb.max_slots}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
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
            {upcomingEvents.slice(0, 10).map(booking => (
              <Card key={booking.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{booking.client?.company_name}</p>
                    <p className="text-xs text-gray-500">{booking.billboard?.name}</p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(booking.start_date), 'dd MMM')} → {format(new Date(booking.end_date), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className={BOOKING_STATUS_CONFIG[booking.status]?.color}>
                      {BOOKING_STATUS_CONFIG[booking.status]?.label}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${PAYMENT_STATUS_CONFIG[booking.payment_status]?.color}`}>
                      {PAYMENT_STATUS_CONFIG[booking.payment_status]?.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
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
          {clients.slice(0, 5).map(client => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover:bg-gray-50 transition-colors">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{client.company_name}</p>
                    <p className="text-xs text-gray-500">{client.contact_person}</p>
                  </div>
                  <Badge variant="secondary" className={
                    client.stage === 'live' ? 'bg-green-100 text-green-800' :
                    client.stage === 'inquiry' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }>
                    {client.stage}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
