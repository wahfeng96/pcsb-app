'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Search, Phone, Mail } from 'lucide-react'
import { STAGE_CONFIG } from '@/types/database'
import type { Client, ClientStage } from '@/types/database'
import Link from 'next/link'

const PIPELINE_ORDER: ClientStage[] = ['inquiry', 'quotation', 'bo', 'scheduled', 'live', 'completed', 'cancelled']

export default function ClientsPage() {
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<ClientStage | 'all'>('all')
  const [view, setView] = useState<'list' | 'pipeline'>('list')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    company_name: '', contact_person: '', phone: '', email: '', address: '', notes: '', stage: 'inquiry' as ClientStage,
  })

  async function loadClients() {
    const { data } = await supabase.from('clients').select('*').order('updated_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('clients').insert(form)
    setForm({ company_name: '', contact_person: '', phone: '', email: '', address: '', notes: '', stage: 'inquiry' })
    setShowAdd(false)
    loadClients()
  }

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.company_name.toLowerCase().includes(search.toLowerCase()) || c.contact_person.toLowerCase().includes(search.toLowerCase())
    const matchStage = stageFilter === 'all' || c.stage === stageFilter
    return matchSearch && matchStage
  })

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-red-600 hover:bg-red-700"><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-3">
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required /></div>
              <div><Label>Contact Person *</Label><Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div><Label>Stage</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value as ClientStage }))}>
                  {PIPELINE_ORDER.map(s => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
                </select>
              </div>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">Add Client</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search clients..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* View toggle & stage filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <Button size="sm" variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')} className={view === 'list' ? 'bg-red-600 hover:bg-red-700' : ''}>List</Button>
        <Button size="sm" variant={view === 'pipeline' ? 'default' : 'outline'} onClick={() => setView('pipeline')} className={view === 'pipeline' ? 'bg-red-600 hover:bg-red-700' : ''}>Pipeline</Button>
        <div className="h-4 w-px bg-gray-300" />
        <div className="flex gap-1 overflow-x-auto">
          <Button size="sm" variant={stageFilter === 'all' ? 'default' : 'outline'} onClick={() => setStageFilter('all')} className={`text-xs ${stageFilter === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}`}>All</Button>
          {PIPELINE_ORDER.filter(s => s !== 'cancelled').map(s => (
            <Button key={s} size="sm" variant={stageFilter === s ? 'default' : 'outline'} onClick={() => setStageFilter(s)} className={`text-xs whitespace-nowrap ${stageFilter === s ? 'bg-red-600 hover:bg-red-700' : ''}`}>{STAGE_CONFIG[s].label}</Button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-gray-500">No clients found</CardContent></Card>
          ) : filtered.map(client => (
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
                    </div>
                    <Badge variant="secondary" className={STAGE_CONFIG[client.stage]?.color}>{STAGE_CONFIG[client.stage]?.label}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* Pipeline / Kanban view */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_ORDER.filter(s => s !== 'cancelled').map(stage => {
            const stageClients = filtered.filter(c => c.stage === stage)
            return (
              <div key={stage} className="min-w-[200px] flex-shrink-0">
                <div className={`rounded-t-lg px-3 py-2 ${STAGE_CONFIG[stage].color}`}>
                  <span className="text-xs font-semibold">{STAGE_CONFIG[stage].label} ({stageClients.length})</span>
                </div>
                <div className="bg-gray-100 rounded-b-lg p-2 space-y-2 min-h-[100px]">
                  {stageClients.map(client => (
                    <Link key={client.id} href={`/clients/${client.id}`}>
                      <Card className="hover:shadow-md transition-shadow mb-2">
                        <CardContent className="p-2">
                          <p className="text-xs font-medium truncate">{client.company_name}</p>
                          <p className="text-[10px] text-gray-500">{client.contact_person}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
