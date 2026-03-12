'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Edit2, DollarSign, Users, Percent } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Billboard, Booking, Client, Profile } from '@/types/database'
import { BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/database'

export default function BillboardsPage() {
  const supabase = createClient()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<(Booking & { client: Client })[]>([])
  const [partners, setPartners] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBb, setEditingBb] = useState<Billboard | null>(null)
  const [editForm, setEditForm] = useState({ partner_id: '', profit_share_percent: 0, costing: 0 })

  async function load() {
    const [bb, bk, pr] = await Promise.all([
      supabase.from('billboards').select('*').order('name'),
      supabase.from('bookings').select('*, client:clients(*)').order('start_date'),
      supabase.from('profiles').select('*').eq('role', 'partner'),
    ])
    setBillboards(bb.data || [])
    setBookings(bk.data || [])
    setPartners(pr.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(bb: Billboard) {
    setEditingBb(bb)
    setEditForm({
      partner_id: bb.partner_id || '',
      profit_share_percent: bb.profit_share_percent || 0,
      costing: bb.costing || 0,
    })
  }

  async function handleSaveEdit() {
    if (!editingBb) return
    await supabase.from('billboards').update({
      partner_id: editForm.partner_id || null,
      profit_share_percent: editForm.profit_share_percent,
      costing: editForm.costing,
    }).eq('id', editingBb.id)
    setEditingBb(null)
    load()
  }

  function getBbBookings(bbId: string) {
    return bookings.filter(b => b.billboard_id === bbId && (b.status === 'live' || b.status === 'upcoming'))
  }

  function calcProfit(bb: Billboard) {
    const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.status !== 'cancelled')
    const revenue = bbBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
    const profit = revenue - (bb.costing || 0)
    const ownerShare = profit * ((100 - (bb.profit_share_percent || 0)) / 100)
    const partnerShare = profit * ((bb.profit_share_percent || 0) / 100)
    return { revenue, profit, ownerShare, partnerShare }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Billboards</h1>

      <div className="space-y-4">
        {billboards.map(bb => {
          const active = getBbBookings(bb.id)
          const { revenue, profit, ownerShare, partnerShare } = calcProfit(bb)
          const partner = partners.find(p => p.id === bb.partner_id)

          return (
            <Card key={bb.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{bb.name}</h3>
                    <p className="text-sm text-gray-500">{bb.location}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{active.length}/{bb.max_slots} slots</Badge>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(bb)}><Edit2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                {/* Financial summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Revenue</span>
                    <p className="font-semibold">RM {revenue.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Costing</span>
                    <p className="font-semibold">RM {(bb.costing || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Profit</span>
                    <p className="font-semibold text-green-600">RM {profit.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Partner ({bb.profit_share_percent || 0}%)</span>
                    <p className="font-semibold">{partner?.name || 'None'}</p>
                    <p className="text-gray-600">RM {partnerShare.toLocaleString()}</p>
                  </div>
                </div>

                {/* Active bookings */}
                {active.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500 mb-1">Active Bookings</p>
                    {active.map(b => (
                      <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                        <div>
                          <span className="text-xs font-medium">{b.client?.company_name}</span>
                          <span className="text-[10px] text-gray-400 ml-2">
                            {format(parseISO(b.start_date), 'dd MMM')} → {format(parseISO(b.end_date), 'dd MMM yy')}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="secondary" className={BOOKING_STATUS_CONFIG[b.status]?.color + ' text-[9px] px-1'}>{BOOKING_STATUS_CONFIG[b.status]?.label}</Badge>
                          <Badge variant="outline" className={PAYMENT_STATUS_CONFIG[b.payment_status]?.color + ' text-[9px] px-1'}>{PAYMENT_STATUS_CONFIG[b.payment_status]?.label}</Badge>
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

      {/* Edit Billboard Dialog */}
      <Dialog open={!!editingBb} onOpenChange={open => { if (!open) setEditingBb(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editingBb?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-1"><Users className="h-3 w-3" /> Partner</Label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.partner_id} onChange={e => setEditForm(f => ({ ...f, partner_id: e.target.value }))}>
                <option value="">No partner</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
              </select>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Percent className="h-3 w-3" /> Profit Share %</Label>
              <Input type="number" min={0} max={100} value={editForm.profit_share_percent} onChange={e => setEditForm(f => ({ ...f, profit_share_percent: +e.target.value }))} />
            </div>
            <div>
              <Label className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Costing (RM)</Label>
              <Input type="number" min={0} value={editForm.costing} onChange={e => setEditForm(f => ({ ...f, costing: +e.target.value }))} />
            </div>
            <Button onClick={handleSaveEdit} className="w-full bg-red-600 hover:bg-red-700">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
