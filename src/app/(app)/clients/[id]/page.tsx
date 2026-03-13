'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Edit2, Plus, Trash2, Phone, Mail, MapPin, X } from 'lucide-react'
import { format, parseISO, differenceInMonths, startOfMonth } from 'date-fns'
import type { Client, ClientStage, Booking, Billboard, BookingStatus, PaymentStatus } from '@/types/database'
import { STAGE_CONFIG, BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/database'
import Link from 'next/link'

const PIPELINE_ORDER: ClientStage[] = ['inquiry', 'quotation', 'bo', 'scheduled', 'live', 'completed', 'cancelled']

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [client, setClient] = useState<Client | null>(null)
  const [bookings, setBookings] = useState<(Booking & { billboard: Billboard })[]>([])
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [editing, setEditing] = useState(false)
  const [showAddBooking, setShowAddBooking] = useState(false)
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Client>>({})
  const [bookingForm, setBookingForm] = useState({
    billboard_id: '', spot_size: '' as any, start_date: '', end_date: '', monthly_rate: 0, total_amount: 0, slot_number: 1, brand_name: '', sales_person: '', notes: '',
    status: 'upcoming' as BookingStatus, payment_status: 'pending_payment' as PaymentStatus,
    _months: 0,
  })
  const [loading, setLoading] = useState(true)
  const [allBrandNames, setAllBrandNames] = useState<string[]>([])
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false)
  const bookingFormRef = useRef<HTMLDivElement>(null)

  async function load() {
    const [cl, bk, bb, allBk] = await Promise.all([
      supabase.from('clients').select('*').eq('id', params.id).single(),
      supabase.from('bookings').select('*, billboard:billboards(*)').eq('client_id', params.id).order('start_date', { ascending: false }),
      supabase.from('billboards').select('*').order('name'),
      supabase.from('bookings').select('brand_name').neq('brand_name', '').not('brand_name', 'is', null),
    ])
    setClient(cl.data)
    setForm(cl.data || {})
    setBookings(bk.data || [])
    setBillboards(bb.data || [])
    if (bb.data?.[0]) setBookingForm(f => ({ ...f, billboard_id: bb.data[0].id }))
    const uniqueBrands = [...new Set((allBk.data || []).map(b => b.brand_name).filter(Boolean))] as string[]
    setAllBrandNames(uniqueBrands.sort())
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  async function handleSave() {
    const { company_name, contact_person, phone, email, address, notes, stage } = form
    await supabase.from('clients').update({ company_name, contact_person, phone, email, address, notes, stage }).eq('id', params.id)
    setEditing(false)
    load()
  }

  async function handleDelete() {
    if (!confirm('Delete this client and all bookings?')) return
    await supabase.from('bookings').delete().eq('client_id', params.id)
    await supabase.from('clients').delete().eq('id', params.id)
    router.push('/clients')
  }

  function calcMonths(start: string, end: string): number {
    if (!start || !end) return 0
    const s = startOfMonth(parseISO(start))
    const e = startOfMonth(parseISO(end))
    return differenceInMonths(e, s) + 1 // inclusive: Mar-Aug = 6
  }

  function recalcTotal(form: typeof bookingForm, overrides: Partial<typeof bookingForm> = {}) {
    const merged = { ...form, ...overrides }
    // If dates changed, recalc _months from dates
    if (overrides.start_date !== undefined || overrides.end_date !== undefined) {
      merged._months = calcMonths(merged.start_date, merged.end_date)
    }
    return { ...merged, total_amount: merged.monthly_rate * (merged._months || 0) }
  }

  async function handleAddBooking(e: React.FormEvent) {
    e.preventDefault()
    if (!bookingForm.spot_size) { alert('Please select spot size (0.5 or 1)'); return }
    const { _months, ...data } = bookingForm
    if (editingBookingId) {
      await supabase.from('bookings').update(data).eq('id', editingBookingId)
      setEditingBookingId(null)
    } else {
      await supabase.from('bookings').insert({ ...data, client_id: params.id })
    }
    setShowAddBooking(false)
    setBookingForm({ billboard_id: billboards[0]?.id || '', spot_size: '' as any, start_date: '', end_date: '', monthly_rate: 0, total_amount: 0, slot_number: 1, brand_name: '', sales_person: '', notes: '', status: 'upcoming', payment_status: 'pending_payment', _months: 0 })
    load()
  }

  function startEditBooking(b: Booking & { billboard: Billboard }) {
    setBookingForm({
      billboard_id: b.billboard_id, spot_size: b.spot_size || 1, start_date: b.start_date, end_date: b.end_date,
      monthly_rate: b.monthly_rate, _months: b.monthly_rate ? Math.round(b.total_amount / b.monthly_rate) : calcMonths(b.start_date, b.end_date), total_amount: b.total_amount, slot_number: b.slot_number,
      brand_name: b.brand_name || '', sales_person: b.sales_person || '', notes: b.notes || '',
      status: b.status, payment_status: b.payment_status,
    })
    setEditingBookingId(b.id)
    setShowAddBooking(true)
    setTimeout(() => bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  async function deleteBooking(id: string) {
    if (!confirm('Delete this booking?')) return
    await supabase.from('bookings').delete().eq('id', id)
    load()
  }

  async function updateStage(stage: ClientStage) {
    await supabase.from('clients').update({ stage }).eq('id', params.id)
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>
  if (!client) return <div className="p-8 text-center text-gray-500">Client not found</div>

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/clients"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-xl font-bold text-gray-900 flex-1 truncate">{client.company_name}</h1>
        <Button size="icon" variant="ghost" onClick={() => setEditing(!editing)}><Edit2 className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="text-red-600" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>

      {/* Stage pipeline */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {PIPELINE_ORDER.map(s => (
          <Button
            key={s}
            size="sm"
            variant={client.stage === s ? 'default' : 'outline'}
            className={`text-xs whitespace-nowrap ${client.stage === s ? STAGE_CONFIG[s].color.replace('bg-', 'bg-').replace('text-', 'text-') : ''}`}
            onClick={() => updateStage(s)}
          >
            {STAGE_CONFIG[s].label}
          </Button>
        ))}
      </div>

      {/* Client info */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {editing ? (
            <div className="space-y-3">
              <div><Label>Company Name</Label><Input value={form.company_name || ''} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div><Label>Contact Person</Label><Input value={form.contact_person || ''} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label>Email</Label><Input value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div><Label>Address</Label><Input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex gap-2">
                <Button onClick={handleSave} className="bg-red-600 hover:bg-red-700">Save</Button>
                <Button variant="outline" onClick={() => { setEditing(false); setForm(client) }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold">{client.contact_person}</p>
              {client.phone && <p className="flex items-center gap-2 text-sm text-gray-600"><Phone className="h-4 w-4" />{client.phone}</p>}
              {client.email && <p className="flex items-center gap-2 text-sm text-gray-600"><Mail className="h-4 w-4" />{client.email}</p>}
              {client.address && <p className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="h-4 w-4" />{client.address}</p>}
              {client.notes && <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{client.notes}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bookings */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bookings</h2>
        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => { setShowAddBooking(!showAddBooking); if (showAddBooking) { setEditingBookingId(null); setBookingForm({ billboard_id: billboards[0]?.id || '', spot_size: '' as any, start_date: '', end_date: '', monthly_rate: 0, total_amount: 0, slot_number: 1, brand_name: '', sales_person: '', notes: '', status: 'upcoming', payment_status: 'pending_payment', _months: 0 }) } }}>{showAddBooking ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Add Booking</>}</Button>
      </div>

      {showAddBooking && (
        <Card ref={bookingFormRef}>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">{editingBookingId ? 'Edit Booking' : 'Add Booking'}</h3>
            <form onSubmit={handleAddBooking} className="space-y-3">
              <div><Label>Billboard</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={bookingForm.billboard_id} onChange={e => setBookingForm(f => ({ ...f, billboard_id: e.target.value }))}>
                  {billboards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Spot Size <span className="text-red-500">*</span></Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <Button type="button" variant="outline" className={`${bookingForm.spot_size === 0.5 ? 'bg-red-100 border-red-400 text-red-700 ring-2 ring-red-400' : ''}`} onClick={() => setBookingForm(f => ({ ...f, spot_size: 0.5 }))}>Half Spot (0.5)</Button>
                  <Button type="button" variant="outline" className={`${bookingForm.spot_size === 1 ? 'bg-red-100 border-red-400 text-red-700 ring-2 ring-red-400' : ''}`} onClick={() => setBookingForm(f => ({ ...f, spot_size: 1 }))}>Full Spot (1)</Button>
                </div>
                {!bookingForm.spot_size && <p className="text-[10px] text-red-500 mt-1">Please select spot size</p>}
              </div>
              <div className="relative">
                <Label>Brand Name (shown on calendar)</Label>
                <Input
                  placeholder="e.g. AirAsia, Grab, etc."
                  value={bookingForm.brand_name}
                  onChange={e => { setBookingForm(f => ({ ...f, brand_name: e.target.value })); setShowBrandSuggestions(true) }}
                  onFocus={() => setShowBrandSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 200)}
                  autoComplete="off"
                />
                {showBrandSuggestions && bookingForm.brand_name && (
                  (() => {
                    const filtered = allBrandNames.filter(b => b.toLowerCase().includes(bookingForm.brand_name.toLowerCase()) && b !== bookingForm.brand_name)
                    return filtered.length > 0 ? (
                      <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {filtered.map(b => (
                          <button key={b} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 truncate" onClick={() => { setBookingForm(f => ({ ...f, brand_name: b })); setShowBrandSuggestions(false) }}>{b}</button>
                        ))}
                      </div>
                    ) : null
                  })()
                )}
              </div>
              <div><Label>Sales Person</Label><Input placeholder="Who closed this deal?" value={bookingForm.sales_person} onChange={e => setBookingForm(f => ({ ...f, sales_person: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date (In)</Label><Input type="date" value={bookingForm.start_date} onChange={e => setBookingForm(f => recalcTotal(f, { start_date: e.target.value }))} required /></div>
                <div><Label>End Date (Out)</Label><Input type="date" value={bookingForm.end_date} onChange={e => setBookingForm(f => recalcTotal(f, { end_date: e.target.value }))} required /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Monthly Rate (RM)</Label><Input type="number" value={bookingForm.monthly_rate || ''} onChange={e => setBookingForm(f => recalcTotal(f, { monthly_rate: +e.target.value }))} /></div>
                <div><Label>Months</Label><Input type="number" min={1} value={bookingForm._months || ''} onChange={e => setBookingForm(f => recalcTotal(f, { _months: +e.target.value } as any))} /></div>
                <div><Label>Total (RM)</Label><Input type="number" value={bookingForm.total_amount || ''} readOnly className="bg-gray-50" /></div>
              </div>
              <div><Label>Slot Number</Label><Input type="number" min={1} max={15} value={bookingForm.slot_number} onChange={e => setBookingForm(f => ({ ...f, slot_number: +e.target.value }))} /></div>
              <div><Label>Status</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={bookingForm.status} onChange={e => setBookingForm(f => ({ ...f, status: e.target.value as BookingStatus }))}>
                  <option value="upcoming">Upcoming</option><option value="live">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div><Label>Payment Status</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={bookingForm.payment_status} onChange={e => setBookingForm(f => ({ ...f, payment_status: e.target.value as PaymentStatus }))}>
                  <option value="pending_payment">Pending Payment</option>
                  <option value="received_pending_profit_share">Received (Pending Profit Share)</option>
                  <option value="settled">Settled</option>
                </select>
              </div>
              <div><Label>Notes</Label><Textarea value={bookingForm.notes} onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">Add Booking</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {bookings.length === 0 ? (
          <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No bookings yet</CardContent></Card>
        ) : bookings.map(b => (
          <Card key={b.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{b.billboard?.name}</span>
                <div className="flex gap-1 items-center">
                  <Badge variant="secondary" className={BOOKING_STATUS_CONFIG[b.status]?.color + ' text-[10px]'}>{BOOKING_STATUS_CONFIG[b.status]?.label}</Badge>
                  <Badge variant="outline" className={PAYMENT_STATUS_CONFIG[b.payment_status]?.color + ' text-[10px]'}>{PAYMENT_STATUS_CONFIG[b.payment_status]?.label}</Badge>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditBooking(b)}><Edit2 className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => deleteBooking(b.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              {b.brand_name && <p className="text-xs font-medium text-gray-700">Brand: {b.brand_name}</p>}
              <span className="text-[10px] text-gray-400">{b.spot_size === 0.5 ? 'Half Spot' : 'Full Spot'}</span>
              {b.sales_person && <p className="text-xs text-gray-500">Sales: {b.sales_person}</p>}
              <p className="text-xs text-gray-500">
                Slot #{b.slot_number} • {format(parseISO(b.start_date), 'dd MMM yyyy')} → {format(parseISO(b.end_date), 'dd MMM yyyy')}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                RM {b.monthly_rate?.toLocaleString()}/mo • Total: RM {b.total_amount?.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
