'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isWithinInterval, parseISO } from 'date-fns'
import type { Booking, Client, Billboard } from '@/types/database'
import { BOOKING_STATUS_CONFIG } from '@/types/database'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }

const BILLBOARD_COLORS: Record<string, string> = {}
const COLOR_PALETTE = ['bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-yellow-200', 'bg-purple-200']

export default function CalendarPage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [view, setView] = useState<'month' | 'billboard'>('month')
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
      ;(bb.data || []).forEach((b: Billboard, i: number) => {
        BILLBOARD_COLORS[b.id] = COLOR_PALETTE[i % COLOR_PALETTE.length]
      })
      setLoading(false)
    }
    load()
  }, [])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad start to Monday
  const startDay = monthStart.getDay() || 7
  const padDays = startDay - 1

  const filteredBookings = useMemo(() => {
    if (selectedBillboard === 'all') return bookings
    return bookings.filter(b => b.billboard_id === selectedBillboard)
  }, [bookings, selectedBillboard])

  function getBookingsForDay(date: Date) {
    return filteredBookings.filter(b => {
      const start = parseISO(b.start_date)
      const end = parseISO(b.end_date)
      return isWithinInterval(date, { start, end })
    })
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <div className="flex gap-1">
          <Button size="sm" variant={view === 'month' ? 'default' : 'outline'} onClick={() => setView('month')} className={view === 'month' ? 'bg-red-600 hover:bg-red-700' : ''}>Month</Button>
          <Button size="sm" variant={view === 'billboard' ? 'default' : 'outline'} onClick={() => setView('billboard')} className={view === 'billboard' ? 'bg-red-600 hover:bg-red-700' : ''}>Billboard</Button>
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
          <Button key={bb.id} size="sm" variant={selectedBillboard === bb.id ? 'default' : 'outline'} onClick={() => setSelectedBillboard(bb.id)} className={`whitespace-nowrap ${selectedBillboard === bb.id ? 'bg-red-600 hover:bg-red-700' : ''}`}>{bb.name}</Button>
        ))}
      </div>

      {view === 'month' ? (
        /* Monthly Calendar Grid */
        <div>
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-gray-500 mb-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {Array.from({ length: padDays }).map((_, i) => <div key={`pad-${i}`} className="bg-gray-50 min-h-[60px] md:min-h-[80px]" />)}
            {days.map(day => {
              const dayBookings = getBookingsForDay(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`bg-white min-h-[60px] md:min-h-[80px] p-1 ${isToday(day) ? 'ring-2 ring-red-500 ring-inset' : ''}`}
                >
                  <span className={`text-xs font-medium ${isToday(day) ? 'text-red-600' : 'text-gray-700'}`}>
                    {format(day, 'd')}
                  </span>
                  <div className="space-y-px mt-px">
                    {dayBookings.slice(0, 3).map(b => (
                      <div key={b.id} className={`text-[9px] md:text-[10px] px-1 rounded truncate ${BILLBOARD_COLORS[b.billboard_id] || 'bg-gray-200'}`}>
                        {b.client?.company_name}
                      </div>
                    ))}
                    {dayBookings.length > 3 && (
                      <div className="text-[9px] text-gray-500 px-1">+{dayBookings.length - 3} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Billboard / Gantt View */
        <div className="space-y-4">
          {(selectedBillboard === 'all' ? billboards : billboards.filter(b => b.id === selectedBillboard)).map(bb => {
            const bbBookings = bookings.filter(b => b.billboard_id === bb.id && (b.status === 'live' || b.status === 'upcoming'))
            return (
              <Card key={bb.id}>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-3">{bb.name} <span className="text-gray-500 font-normal">— {bb.location}</span></h3>
                  {bbBookings.length === 0 ? (
                    <p className="text-sm text-gray-400">No active bookings</p>
                  ) : (
                    <div className="space-y-2">
                      {bbBookings.map((b, idx) => (
                        <div key={b.id} className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-6">#{idx + 1}</span>
                          <div className="flex-1 bg-gray-50 rounded-lg p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{b.client?.company_name}</span>
                              <Badge variant="secondary" className={BOOKING_STATUS_CONFIG[b.status]?.color + ' text-[10px]'}>
                                {BOOKING_STATUS_CONFIG[b.status]?.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {format(parseISO(b.start_date), 'dd MMM yyyy')} → {format(parseISO(b.end_date), 'dd MMM yyyy')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
