'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, Phone, Mail, X } from 'lucide-react'
import type { Client, Booking } from '@/types/database'
import Link from 'next/link'
import { useRole } from '@/lib/hooks/use-role'

type ClientStatus = 'active' | 'upcoming' | 'past'

const CLIENT_STATUS_CONFIG: Record<ClientStatus, { label: string; color: string; icon: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800', icon: '🟢' },
  upcoming: { label: 'Upcoming', color: 'bg-yellow-100 text-yellow-800', icon: '🟡' },
  past: { label: 'Past', color: 'bg-gray-100 text-gray-600', icon: '⚪' },
}

function computeClientStatus(clientId: string, bookings: Booking[]): ClientStatus {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cb = bookings.filter(b => b.client_id === clientId && b.status !== 'cancelled')
  const hasLive = cb.some(b => new Date(b.start_date) <= today && new Date(b.end_date + 'T23:59:59') >= today)
  if (hasLive) return 'active'
  const hasUpcoming = cb.some(b => new Date(b.start_date) > today)
  if (hasUpcoming) return 'upcoming'
  return 'past'
}

export default function ClientsPage() {
  const supabase = createClient()
  const { canEdit } = useRole()
  const [clients, setClients] = useState<Client[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'name-az' | 'name-za' | 'recent' | 'oldest'>('recent')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    company_name: '', contact_person: '', phone: '', email: '', address: '', notes: '',
  })

  async function load() {
    const [c, b] = await Promise.all([
      supabase.from('clients').select('*').order('updated_at', { ascending: false }),
      supabase.from('bookings').select('id, client_id, start_date, end_date, status, monthly_rate, total_amount').neq('status', 'cancelled'),
    ])
    setClients(c.data || [])
    setBookings(b.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('clients').insert({ ...form, stage: 'inquiry' })
    setForm({ company_name: '', contact_person: '', phone: '', email: '', address: '', notes: '' })
    setShowAdd(false)
    load()
  }

  // Compute status for each client
  const clientStatuses = useMemo(() => {
    const map = new Map<string, ClientStatus>()
    clients.forEach(c => map.set(c.id, computeClientStatus(c.id, bookings)))
    return map
  }, [clients, bookings])

  // Summary counts
  const statusCounts = useMemo(() => {
    const counts = { active: 0, upcoming: 0, past: 0 }
    clientStatuses.forEach(s => counts[s]++)
    return counts
  }, [clientStatuses])

  // Compute total active revenue per client
  const clientRevenue = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const map = new Map<string, number>()
    bookings.forEach(b => {
      if (new Date(b.start_date) <= today && new Date(b.end_date + 'T23:59:59') >= today) {
        map.set(b.client_id, (map.get(b.client_id) || 0) + (b.monthly_rate || 0))
      }
    })
    return map
  }, [bookings])

  // Count bookings per client
  const clientBookingCount = useMemo(() => {
    const map = new Map<string, number>()
    bookings.forEach(b => map.set(b.client_id, (map.get(b.client_id) || 0) + 1))
    return map
  }, [bookings])

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.company_name.toLowerCase().includes(search.toLowerCase()) || c.contact_person.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || clientStatuses.get(c.id) === statusFilter
    return matchSearch && matchStatus
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name-az': return a.company_name.localeCompare(b.company_name)
      case 'name-za': return b.company_name.localeCompare(a.company_name)
      case 'recent': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      case 'oldest': return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      default: return 0
    }
  })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        {canEdit && <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowAdd(!showAdd)}>{showAdd ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Add</>}</Button>}
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Add New Client</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required /></div>
              <div><Label>Contact Person *</Label><Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">Add Client</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-green-700">{statusCounts.active}</p>
            <p className="text-[10px] text-green-600">🟢 Active</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === 'upcoming' ? 'all' : 'upcoming')}>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-yellow-700">{statusCounts.upcoming}</p>
            <p className="text-[10px] text-yellow-600">🟡 Upcoming</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter(statusFilter === 'past' ? 'all' : 'past')}>
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-gray-500">{statusCounts.past}</p>
            <p className="text-[10px] text-gray-500">⚪ Past</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search clients..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border rounded-md px-2 py-2 text-sm bg-white min-w-[130px]" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
          <option value="recent">Recently Updated</option>
          <option value="oldest">Oldest</option>
          <option value="name-az">Name (A-Z)</option>
          <option value="name-za">Name (Z-A)</option>
        </select>
      </div>

      {/* Status filter */}
      <div className="flex gap-1">
        <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')} className={`text-xs ${statusFilter === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}`}>All ({clients.length})</Button>
        {(['active', 'upcoming', 'past'] as ClientStatus[]).map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)} className={`text-xs ${statusFilter === s ? 'bg-red-600 hover:bg-red-700' : ''}`}>{CLIENT_STATUS_CONFIG[s].icon} {CLIENT_STATUS_CONFIG[s].label} ({statusCounts[s]})</Button>
        ))}
      </div>

      {/* Client list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-gray-500">No clients found</CardContent></Card>
        ) : filtered.map(client => {
          const status = clientStatuses.get(client.id) || 'past'
          const revenue = clientRevenue.get(client.id) || 0
          const bookingCount = clientBookingCount.get(client.id) || 0
          const statusConfig = CLIENT_STATUS_CONFIG[status]
          return (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover:bg-gray-50 transition-colors mb-2">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{client.company_name}</p>
                      <p className="text-xs text-gray-500">{client.contact_person}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {client.phone && <span className="flex items-center gap-1 text-xs text-gray-400"><Phone className="h-3 w-3" />{client.phone}</span>}
                        {client.email && <span className="flex items-center gap-1 text-xs text-gray-400"><Mail className="h-3 w-3" />{client.email}</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{bookingCount} booking{bookingCount !== 1 ? 's' : ''}{revenue > 0 ? ` • RM ${revenue.toLocaleString()}/mo active` : ''}</p>
                    </div>
                    <Badge variant="secondary" className={statusConfig.color}>{statusConfig.icon} {statusConfig.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
