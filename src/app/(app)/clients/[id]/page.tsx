'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Edit2, Plus, Trash2, Phone, Mail, MapPin, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
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
    billboard_id: '', start_date: '', end_date: '', monthly_rate: 0, total_amount: 0, slot_number: 1, brand_name: '', notes: '',
    status: 'upcoming' as BookingStatus, payment_status: 'pending_payment' as PaymentStatus,
  })
  const [loading, setLoading] = useState(true)

  async function load() {
    const [cl, bk, bb] = await Promise.all([
      supabase.from('clients').select('*').eq('id', params.id).single(),
      supabase.from('bookings').select('*, billboard:billboards(*)').eq('client_id', params.id).order('start_date', { ascending: false }),
      supabase.from('billboards').select('*').order('name'),
    ])
    setClient(cl.data)
    setForm(cl.data || {})
    setBookings(bk.data || [])
    setBillboards(bb.data || [])
    if (bb.data?.[0]) setBookingForm(f => ({ ...f, billboard_id: bb.data[0].id }))
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

  async function handleAddBooking(e: React.FormEvent) {
    e.preventDefault()
    if (editingBookingId) {
      await supabase.from('bookings').update({ ...bookingForm }).eq('id', editingBookingId)
      setEditingBookingId(null)
    } else {
      await supabase.from('bookings').insert({ ...bookingForm, client_id: params.id })
    }
    setShowAddBooking(false)
    setBookingForm({ billboard_id: billboards[0]?.id || '', start_date: '', end_date: '', monthly_rate: 0, total_amount: 0, slot_number: 1, brand_name: '', notes: '', status: 'upcoming', payment_status: 'pending_payment' })
    load()
  }

  function startEditBooking(b: Booking & { billboard: Billboard }) {
    setBookingForm({
      billboard_id: b.billboard_id, start_date: b.start_date, end_date: b.end_date,
      monthly_rate: b.monthly_rate, total_amount: b.total_amount, slot_number: b.slot_number,
      brand_name: b.brand_name || '', notes: b.notes || '',
      status: b.status, payment_status: b.payment_status,
    })
    setEditingBookingId(b.id)
    setShowAddBooking(true)
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
        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => { setShowAddBooking(!showAddBooking); if (showAddBooking) { setEditingBookingId(null); setBookingForm({ billboard_id: billboards[0]?.id || '', start_date: '', end_date: '', monthly_rate: 0, total_amount: 0, slot_number: 1, brand_name: '', notes: '', status: 'upcoming', payment_status: 'pending_payment' }) } }}>{showAddBooking ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Add Booking</>}</Button>
      </div>

      {showAddBooking && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">{editingBookingId ? 'Edit Booking' : 'Add Booking'}</h3>
            <form onSubmit={handleAddBooking} className="space-y-3">
              <div><Label>Billboard</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={bookingForm.billboard_id} onChange={e => setBookingForm(f => ({ ...f, billboard_id: e.target.value }))}>
                  {billboards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div><Label>Brand Name (shown on calendar)</Label><Input placeholder="e.g. AirAsia, Grab, etc." value={bookingForm.brand_name} onChange={e => setBookingForm(f => ({ ...f, brand_name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date (In)</Label><Input type="date" value={bookingForm.start_date} onChange={e => setBookingForm(f => ({ ...f, start_date: e.target.value }))} required /></div>
                <div><Label>End Date (Out)</Label><Input type="date" value={bookingForm.end_date} onChange={e => setBookingForm(f => ({ ...f, end_date: e.target.value }))} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Monthly Rate (RM)</Label><Input type="number" value={bookingForm.monthly_rate} onChange={e => setBookingForm(f => ({ ...f, monthly_rate: +e.target.value }))} /></div>
                <div><Label>Total Amount (RM)</Label><Input type="number" value={bookingForm.total_amount} onChange={e => setBookingForm(f => ({ ...f, total_amount: +e.target.value }))} /></div>
              </div>
              <div><Label>Slot Number</Label><Input type="number" min={1} max={10} value={bookingForm.slot_number} onChange={e => setBookingForm(f => ({ ...f, slot_number: +e.target.value }))} /></div>
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
