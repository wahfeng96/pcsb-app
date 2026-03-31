'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, parseISO, isSameDay } from 'date-fns'
import type { Booking, Client, Billboard } from '@/types/database'
import { computeBookingStatus } from '@/lib/booking-utils'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }

export default function CalendarPage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedBillboard, setSelectedBillboard] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [bk, bb] = await Promise.all([
        supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').order('start_date'),
        supabase.from('billboards').select('*').order('name'),
      ])
      setBookings(bk.data || [])
      setBillboards(bb.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDay = monthStart.getDay() || 7
  const padDays = startDay - 1

  const filteredBookings = useMemo(() => {
    if (selectedBillboard === 'all') return bookings
    return bookings.filter(b => b.billboard_id === selectedBillboard)
  }, [bookings, selectedBillboard])

  // Get IN (start) and OUT (end) events for a specific day
  function getEventsForDay(date: Date) {
    const events: { type: 'in' | 'out'; booking: BookingWithRefs }[] = []
    filteredBookings.forEach(b => {
      if (computeBookingStatus(b.start_date, b.end_date, b.status) === 'cancelled') return
      const start = parseISO(b.start_date)
      const end = parseISO(b.end_date)
      if (isSameDay(date, start)) events.push({ type: 'in', booking: b })
      if (isSameDay(date, end)) events.push({ type: 'out', booking: b })
    })
    return events
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500"></span> In</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span> Out</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-3 rounded bg-gray-400"></span> Half</span>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
        <Button size="icon" variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Billboard filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={selectedBillboard === 'all' ? 'default' : 'outline'} onClick={() => setSelectedBillboard('all')} className={selectedBillboard === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}>All</Button>
        {billboards.map(bb => (
          <Button key={bb.id} size="sm" variant={selectedBillboard === bb.id ? 'default' : 'outline'} onClick={() => setSelectedBillboard(bb.id)} className={`whitespace-nowrap text-xs ${selectedBillboard === bb.id ? 'bg-red-600 hover:bg-red-700' : ''}`}>{bb.name}</Button>
        ))}
      </div>

      {/* Calendar Grid */}
      <div>
        <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-gray-500 mb-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {Array.from({ length: padDays }).map((_, i) => <div key={`pad-${i}`} className="bg-gray-50 min-h-[65px]" />)}
          {days.map(day => {
            const events = getEventsForDay(day)
            return (
              <div
                key={day.toISOString()}
                className={`bg-white min-h-[65px] p-1 ${isToday(day) ? 'ring-2 ring-red-500 ring-inset' : ''}`}
              >
                <span className={`text-xs font-medium ${isToday(day) ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </span>
                <div className="space-y-px mt-px">
                  {events.slice(0, 3).map((ev, i) => (
                    <div
                      key={`${ev.booking.id}-${ev.type}-${i}`}
                      className={`text-[8px] md:text-[10px] px-1 rounded truncate text-white font-medium ${
                        ev.type === 'in' ? 'bg-green-500' : 'bg-red-500'
                      } ${ev.booking.spot_size === 0.5 ? 'w-1/2 opacity-80' : 'w-full'}`}
                    >
                      {ev.booking.brand_name || ev.booking.client?.company_name} ({ev.type})
                    </div>
                  ))}
                  {events.length > 3 && (
                    <div className="text-[8px] text-gray-500 px-1">+{events.length - 3}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming Events List */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Upcoming In/Out</h3>
        <div className="space-y-2">
          {filteredBookings
            .filter(b => computeBookingStatus(b.start_date, b.end_date, b.status) !== 'cancelled')
            .flatMap(b => {
              const events: { date: string; type: 'in' | 'out'; booking: BookingWithRefs }[] = []
              events.push({ date: b.start_date, type: 'in', booking: b })
              events.push({ date: b.end_date, type: 'out', booking: b })
              return events
            })
            .filter(ev => parseISO(ev.date) >= new Date(new Date().setHours(0,0,0,0)))
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 10)
            .map((ev, i) => (
              <Card key={i}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${ev.type === 'in' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.booking.brand_name || ev.booking.client?.company_name}</p>
                    <p className="text-xs text-gray-500">{ev.booking.billboard?.name}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={`text-[10px] ${ev.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {ev.type === 'in' ? '🟢 IN' : '🔴 OUT'}
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">{format(parseISO(ev.date), 'dd MMM yyyy')}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          }
          {filteredBookings.length === 0 && (
            <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No bookings yet. Add clients and bookings to see them here.</CardContent></Card>
          )}
        </div>
      </div>
    </div>
  )
}
