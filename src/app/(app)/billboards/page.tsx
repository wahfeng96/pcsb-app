'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit2, DollarSign, Users, Percent, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Billboard, Booking, Client, Profile } from '@/types/database'
import { BOOKING_STATUS_CONFIG, PAYMENT_STATUS_CONFIG } from '@/types/database'

type CostItem = { id: string; billboard_id: string; name: string; amount: number }

export default function BillboardsPage() {
  const supabase = createClient()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<(Booking & { client: Client })[]>([])
  const [partners, setPartners] = useState<Profile[]>([])
  const [costs, setCosts] = useState<CostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBb, setEditingBb] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ partner_id: '', profit_share_percent: 0 })
  const [expandedBb, setExpandedBb] = useState<string | null>(null)
  const [newCost, setNewCost] = useState({ name: '', amount: 0 })

  async function load() {
    const [bb, bk, pr, cs] = await Promise.all([
      supabase.from('billboards').select('*').order('name'),
      supabase.from('bookings').select('*, client:clients(*)').order('start_date'),
      supabase.from('profiles').select('*').eq('role', 'partner'),
      supabase.from('billboard_costs').select('*').order('created_at'),
    ])
    setBillboards(bb.data || [])
    setBookings(bk.data || [])
    setPartners(pr.data || [])
    setCosts(cs.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(bb: Billboard) {
    setEditingBb(bb.id)
    setEditForm({
      partner_id: bb.partner_id || '',
      profit_share_percent: bb.profit_share_percent || 0,
    })
  }

  async function handleSaveEdit(bbId: string) {
    await supabase.from('billboards').update({
      partner_id: editForm.partner_id || null,
      profit_share_percent: editForm.profit_share_percent,
    }).eq('id', bbId)
    setEditingBb(null)
    load()
  }

  async function handleAddCost(bbId: string) {
    if (!newCost.name.trim()) return
    await supabase.from('billboard_costs').insert({ billboard_id: bbId, name: newCost.name, amount: newCost.amount })
    setNewCost({ name: '', amount: 0 })
    load()
  }

  async function handleDeleteCost(costId: string) {
    await supabase.from('billboard_costs').delete().eq('id', costId)
    load()
  }

  function getBbCosts(bbId: string) {
    return costs.filter(c => c.billboard_id === bbId)
  }

  function getTotalCost(bbId: string) {
    return getBbCosts(bbId).reduce((sum, c) => sum + (c.amount || 0), 0)
  }

  function getBbBookings(bbId: string) {
    return bookings.filter(b => b.billboard_id === bbId && (b.status === 'live' || b.status === 'upcoming'))
  }

  function calcProfit(bb: Billboard) {
    const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.status !== 'cancelled')
    const revenue = bbBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
    const totalCost = getTotalCost(bb.id)
    const profit = revenue - totalCost
    const ownerShare = profit * ((100 - (bb.profit_share_percent || 0)) / 100)
    const partnerShare = profit * ((bb.profit_share_percent || 0) / 100)
    return { revenue, totalCost, profit, ownerShare, partnerShare }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Billboards</h1>

      <div className="space-y-4">
        {billboards.map(bb => {
          const active = getBbBookings(bb.id)
          const bbCosts = getBbCosts(bb.id)
          const { revenue, totalCost, profit, ownerShare, partnerShare } = calcProfit(bb)
          const partner = partners.find(p => p.id === bb.partner_id)
          const isExpanded = expandedBb === bb.id
          const isEditing = editingBb === bb.id

          return (
            <Card key={bb.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{bb.name}</h3>
                    <p className="text-sm text-gray-500">{bb.location}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary">{active.length}/{bb.max_slots} slots</Badge>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(bb)}><Edit2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <Card className="mb-3 border-red-200">
                    <CardContent className="p-3 space-y-3">
                      <div>
                        <Label className="text-xs">Partner</Label>
                        <select className="w-full border rounded-md px-3 py-2 text-sm" value={editForm.partner_id} onChange={e => setEditForm(f => ({ ...f, partner_id: e.target.value }))}>
                          <option value="">No partner</option>
                          {partners.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Profit Share %</Label>
                        <Input type="number" min={0} max={100} value={editForm.profit_share_percent} onChange={e => setEditForm(f => ({ ...f, profit_share_percent: +e.target.value }))} />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleSaveEdit(bb.id)} className="bg-red-600 hover:bg-red-700">Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingBb(null)}>Cancel</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Financial summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Revenue</span>
                    <p className="font-semibold">RM {revenue.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2 cursor-pointer" onClick={() => setExpandedBb(isExpanded ? null : bb.id)}>
                    <span className="text-gray-500 flex items-center gap-1">Costing {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
                    <p className="font-semibold">RM {totalCost.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Profit</span>
                    <p className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>RM {profit.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-2">
                    <span className="text-gray-500">Partner ({bb.profit_share_percent || 0}%)</span>
                    <p className="font-semibold text-xs">{partner?.name || 'None'}</p>
                    {partner && <p className="text-gray-600">RM {partnerShare.toLocaleString()}</p>}
                  </div>
                </div>

                {/* Costing breakdown (expandable) */}
                {isExpanded && (
                  <Card className="mb-3 border-orange-200">
                    <CardContent className="p-3">
                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-1"><DollarSign className="h-4 w-4" /> Cost Breakdown</h4>
                      {bbCosts.length === 0 ? (
                        <p className="text-xs text-gray-400 mb-2">No costs added yet</p>
                      ) : (
                        <div className="space-y-1 mb-3">
                          {bbCosts.map(c => (
                            <div key={c.id} className="flex items-center justify-between bg-orange-50 rounded px-2 py-1">
                              <span className="text-sm">{c.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">RM {c.amount.toLocaleString()}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => handleDeleteCost(c.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between border-t pt-1 mt-1">
                            <span className="text-sm font-semibold">Total</span>
                            <span className="text-sm font-semibold">RM {totalCost.toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                      {/* Add new cost */}
                      <div className="flex gap-2">
                        <Input placeholder="Cost name" className="text-sm" value={newCost.name} onChange={e => setNewCost(f => ({ ...f, name: e.target.value }))} />
                        <Input type="number" placeholder="RM" className="text-sm w-24" value={newCost.amount || ''} onChange={e => setNewCost(f => ({ ...f, amount: +e.target.value }))} />
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 whitespace-nowrap" onClick={() => handleAddCost(bb.id)}><Plus className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

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
    </div>
  )
}
