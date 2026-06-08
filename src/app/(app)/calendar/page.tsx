'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, parseISO, isSameDay } from 'date-fns'
import type { Booking, Client, Billboard, ContentChange } from '@/types/database'
import { computeBookingStatus } from '@/lib/booking-utils'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }
type ContentChangeWithRefs = ContentChange & { billboard: Billboard }

export default function CalendarPage() {
  const supabase = createClient()
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [contentChanges, setContentChanges] = useState<ContentChangeWithRefs[]>([])
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedBillboard, setSelectedBillboard] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showContentDialog, setShowContentDialog] = useState(false)
  const [contentForm, setContentForm] = useState({ brand_name: '', billboard_id: '', notes: '' })

  async function loadCalendarData() {
    const [bk, bb, cc] = await Promise.all([
      supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').order('start_date'),
      supabase.from('billboards').select('*').order('name'),
      supabase.from('content_changes').select('*, billboard:billboards(*)').order('change_date'),
    ])
    setBookings(bk.data || [])
    setBillboards(bb.data || [])
    setContentChanges(cc.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadCalendarData()
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

  const filteredContentChanges = useMemo(() => {
    if (selectedBillboard === 'all') return contentChanges
    return contentChanges.filter(c => c.billboard_id === selectedBillboard)
  }, [contentChanges, selectedBillboard])

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

  function getContentChangesForDay(date: Date) {
    return filteredContentChanges.filter(c => isSameDay(date, parseISO(c.change_date)))
  }

  function openContentDialog(date: Date) {
    setSelectedDate(date)
    setContentForm({
      brand_name: '',
      billboard_id: selectedBillboard !== 'all' ? selectedBillboard : billboards[0]?.id || '',
      notes: '',
    })
    setShowContentDialog(true)
  }

  async function saveContentChange() {
    if (!selectedDate || !contentForm.brand_name.trim() || !contentForm.billboard_id) {
      alert('Please fill brand name and screen name')
      return
    }
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('content_changes').insert({
      brand_name: contentForm.brand_name.trim(),
      billboard_id: contentForm.billboard_id,
      change_date: format(selectedDate, 'yyyy-MM-dd'),
      notes: contentForm.notes.trim() || null,
      created_by: userData.user?.id || null,
    })
    setSaving(false)
    if (error) {
      alert(error.message)
      return
    }
    setShowContentDialog(false)
    await loadCalendarData()
  }

  async function deleteContentChange(id: string) {
    if (!confirm('Delete this content change marker?')) return
    await supabase.from('content_changes').delete().eq('id', id)
    await loadCalendarData()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500"></span> In</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span> Out</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500"></span> Content Change</span>
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
            const changes = getContentChangesForDay(day)
            const allEntries = events.length + changes.length
            return (
              <div
                key={day.toISOString()}
                className={`group bg-white min-h-[65px] p-1 ${isToday(day) ? 'ring-2 ring-red-500 ring-inset' : ''}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => openContentDialog(day)}
                    className={`text-xs font-medium hover:text-blue-600 ${isToday(day) ? 'text-red-600 font-bold' : 'text-gray-700'}`}
                    title="Click to add content change"
                  >
                    {format(day, 'd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openContentDialog(day)}
                    className="hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                    title="Add content change"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-px mt-px">
                  {events.slice(0, 3).map((ev, i) => (
                    <div
                      key={`${ev.booking.id}-${ev.type}-${i}`}
                      title={`${ev.booking.brand_name || ev.booking.client?.company_name} (${ev.type}) — ${ev.booking.billboard?.name || ''}`}
                      className={`text-[8px] md:text-[10px] px-1 rounded truncate text-white font-medium cursor-default ${
                        ev.type === 'in' ? 'bg-green-500' : 'bg-red-500'
                      } ${ev.booking.spot_size === 0.5 ? 'w-1/2 opacity-80' : 'w-full'}`}
                    >
                      {ev.booking.brand_name || ev.booking.client?.company_name} ({ev.type})
                    </div>
                  ))}
                  {changes.slice(0, Math.max(0, 3 - events.slice(0, 3).length)).map(change => (
                    <div
                      key={change.id}
                      title={`${change.brand_name} — ${change.billboard?.name || ''}${change.notes ? ` — ${change.notes}` : ''}`}
                      className="group/change flex items-center gap-1 text-[8px] md:text-[10px] px-1 rounded truncate text-white font-medium bg-blue-500 cursor-default w-full"
                    >
                      <span className="truncate flex-1">{change.brand_name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteContentChange(change.id) }}
                        className="hidden group-hover/change:block text-white/80 hover:text-white"
                        title="Delete"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                  {allEntries > 3 && (
                    <div className="relative group">
                      <div className="text-[8px] text-gray-500 px-1 cursor-pointer hover:text-red-600 hover:font-bold">+{allEntries - 3}</div>
                      <div className="hidden group-hover:block absolute z-50 bottom-full left-0 mb-1 bg-gray-900 text-white text-[10px] rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap">
                        {events.slice(3).map((ev, i) => (
                          <div key={i} className="flex items-center gap-1.5 py-0.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.type === 'in' ? 'bg-green-400' : 'bg-red-400'}`} />
                            {ev.booking.brand_name || ev.booking.client?.company_name} ({ev.type})
                          </div>
                        ))}
                        {changes.slice(Math.max(0, 3 - events.slice(0, 3).length)).map(change => (
                          <div key={change.id} className="flex items-center gap-1.5 py-0.5" title={change.billboard?.name || ''}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-400" />
                            {change.brand_name} — {change.billboard?.name}
                          </div>
                        ))}
                      </div>
                    </div>
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

      {/* Upcoming Content Change List */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Upcoming Content Changes</h3>
        <div className="space-y-2">
          {filteredContentChanges
            .filter(change => parseISO(change.change_date) >= new Date(new Date().setHours(0,0,0,0)))
            .sort((a, b) => a.change_date.localeCompare(b.change_date))
            .slice(0, 10)
            .map(change => (
              <Card key={change.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-2 h-8 rounded-full bg-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{change.brand_name}</p>
                    <p className="text-xs text-gray-500 truncate">{change.billboard?.name}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <Badge className="text-[10px] bg-blue-100 text-blue-700">🔵 CHANGE</Badge>
                      <p className="text-xs text-gray-500 mt-1">{format(parseISO(change.change_date), 'dd MMM yyyy')}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => deleteContentChange(change.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          {filteredContentChanges.length === 0 && (
            <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No content changes yet. Click a date to add blue content change marker.</CardContent></Card>
          )}
        </div>
      </div>

      <Dialog open={showContentDialog} onOpenChange={setShowContentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Content Change {selectedDate ? `— ${format(selectedDate, 'dd MMM yyyy')}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Brand Name</Label>
              <Input
                value={contentForm.brand_name}
                onChange={e => setContentForm(f => ({ ...f, brand_name: e.target.value }))}
                placeholder="e.g. McD new video"
                autoFocus
              />
            </div>
            <div>
              <Label>Screen Name</Label>
              <select
                value={contentForm.billboard_id}
                onChange={e => setContentForm(f => ({ ...f, billboard_id: e.target.value }))}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select screen</option>
                {billboards.map(bb => <option key={bb.id} value={bb.id}>{bb.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input
                value={contentForm.notes}
                onChange={e => setContentForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Video filename / remark"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowContentDialog(false)}>Cancel</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveContentChange} disabled={saving}>{saving ? 'Saving...' : 'Save Blue Marker'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
