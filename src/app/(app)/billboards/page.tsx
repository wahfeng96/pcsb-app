'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit2, DollarSign, Plus, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, differenceInMonths, isSameMonth, isWithinInterval } from 'date-fns'
import type { Billboard, Booking, Client, Profile } from '@/types/database'
import { BOOKING_STATUS_CONFIG } from '@/types/database'

type CostItem = { id: string; billboard_id: string; name: string; amount: number; start_month: string | null; end_month: string | null }

function getMonthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = []
  let current = startOfMonth(start)
  const last = startOfMonth(end)
  while (current <= last) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}

function getMonthlyRevenue(booking: Booking): { month: Date; amount: number }[] {
  const start = parseISO(booking.start_date)
  const end = parseISO(booking.end_date)
  const months = getMonthsBetween(start, end)
  const monthlyAmount = booking.monthly_rate || (months.length > 0 ? (booking.total_amount || 0) / months.length : 0)
  return months.map(m => ({ month: m, amount: monthlyAmount }))
}

function getMonthlyCost(cost: CostItem): { month: Date; amount: number }[] {
  if (!cost.start_month || !cost.end_month) {
    // No month range = one-time cost, show in current month
    return [{ month: startOfMonth(new Date()), amount: cost.amount || 0 }]
  }
  const start = parseISO(cost.start_month)
  const end = parseISO(cost.end_month)
  const months = getMonthsBetween(start, end)
  const monthlyAmount = months.length > 0 ? (cost.amount || 0) / months.length : 0
  return months.map(m => ({ month: m, amount: monthlyAmount }))
}

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
  const [newCost, setNewCost] = useState({ name: '', amount: 0, start_month: '', end_month: '' })
  const [viewMonth, setViewMonth] = useState(startOfMonth(new Date()))
  const [showAddBb, setShowAddBb] = useState(false)
  const [bbForm, setBbForm] = useState({ name: '', location: '', max_slots: 10, description: '' })

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

  async function handleAddBillboard(e: React.FormEvent) {
    e.preventDefault()
    if (!bbForm.name.trim()) return
    await supabase.from('billboards').insert({ name: bbForm.name, location: bbForm.location, max_slots: bbForm.max_slots, description: bbForm.description || null })
    setShowAddBb(false)
    setBbForm({ name: '', location: '', max_slots: 10, description: '' })
    load()
  }

  async function handleDeleteBillboard(id: string) {
    if (!confirm('Delete this billboard and all its bookings/costs?')) return
    await supabase.from('bookings').delete().eq('billboard_id', id)
    await supabase.from('billboard_costs').delete().eq('billboard_id', id)
    await supabase.from('billboards').delete().eq('id', id)
    load()
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
    await supabase.from('billboard_costs').insert({
      billboard_id: bbId,
      name: newCost.name,
      amount: newCost.amount,
      start_month: newCost.start_month || null,
      end_month: newCost.end_month || null,
    })
    setNewCost({ name: '', amount: 0, start_month: '', end_month: '' })
    load()
  }

  async function handleDeleteCost(costId: string) {
    await supabase.from('billboard_costs').delete().eq('id', costId)
    load()
  }

  // Calculate monthly figures for a billboard
  function getMonthlyFigures(bb: Billboard, month: Date) {
    // Revenue: sum of bookings that span this month, divided by their duration
    const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.status !== 'cancelled')
    let monthRevenue = 0
    bbBookings.forEach(b => {
      const entries = getMonthlyRevenue(b)
      const match = entries.find(e => isSameMonth(e.month, month))
      if (match) monthRevenue += match.amount
    })

    // Costs: sum of costs that span this month
    const bbCosts = costs.filter(c => c.billboard_id === bb.id)
    let monthCost = 0
    bbCosts.forEach(c => {
      const entries = getMonthlyCost(c)
      const match = entries.find(e => isSameMonth(e.month, month))
      if (match) monthCost += match.amount
    })

    const profit = monthRevenue - monthCost
    const partnerShare = profit * ((bb.profit_share_percent || 0) / 100)
    const ownerShare = profit - partnerShare

    return { monthRevenue, monthCost, profit, ownerShare, partnerShare }
  }

  // Total figures (all time)
  function getTotalFigures(bb: Billboard) {
    const bbBookings = bookings.filter(b => b.billboard_id === bb.id && b.status !== 'cancelled')
    const totalRevenue = bbBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
    const bbCosts = costs.filter(c => c.billboard_id === bb.id)
    const totalCost = bbCosts.reduce((sum, c) => sum + (c.amount || 0), 0)
    const profit = totalRevenue - totalCost
    const partnerShare = profit * ((bb.profit_share_percent || 0) / 100)
    return { totalRevenue, totalCost, profit, partnerShare }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Billboards</h1>
        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowAddBb(!showAddBb)}>{showAddBb ? <><X className="h-4 w-4 mr-1" /> Cancel</> : <><Plus className="h-4 w-4 mr-1" /> Add Billboard</>}</Button>
      </div>

      {showAddBb && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">New Billboard</h3>
            <form onSubmit={handleAddBillboard} className="space-y-3">
              <div><Label>Name</Label><Input placeholder="e.g. KK Landmark - Panel C" value={bbForm.name} onChange={e => setBbForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div><Label>Location</Label><Input placeholder="e.g. Kota Kinabalu" value={bbForm.location} onChange={e => setBbForm(f => ({ ...f, location: e.target.value }))} /></div>
              <div><Label>Max Slots</Label><Input type="number" min={1} max={20} value={bbForm.max_slots} onChange={e => setBbForm(f => ({ ...f, max_slots: +e.target.value }))} /></div>
              <div><Label>Description (optional)</Label><Input placeholder="Notes about this billboard" value={bbForm.description} onChange={e => setBbForm(f => ({ ...f, description: e.target.value }))} /></div>
              <Button type="submit" className="w-full bg-red-600 hover:bg-red-700">Add Billboard</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Month selector */}
      <div className="flex items-center justify-between bg-white rounded-lg border p-2">
        <Button size="icon" variant="ghost" onClick={() => setViewMonth(subMonths(viewMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center">
          <h2 className="font-semibold">{format(viewMonth, 'MMMM yyyy')}</h2>
          <p className="text-xs text-gray-400">Monthly breakdown</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setViewMonth(addMonths(viewMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-4">
        {billboards.map(bb => {
          const active = bookings.filter(b => b.billboard_id === bb.id && (b.status === 'live' || b.status === 'upcoming'))
          const bbCosts = costs.filter(c => c.billboard_id === bb.id)
          const monthly = getMonthlyFigures(bb, viewMonth)
          const total = getTotalFigures(bb)
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
                    <Button size="icon" variant="ghost" onClick={() => { setEditingBb(isEditing ? null : bb.id); setEditForm({ partner_id: bb.partner_id || '', profit_share_percent: bb.profit_share_percent || 0 }) }}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => handleDeleteBillboard(bb.id)}><Trash2 className="h-4 w-4" /></Button>
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

                {/* Monthly figures */}
                <div className="mb-2">
                  <p className="text-xs text-gray-400 mb-1 font-medium">{format(viewMonth, 'MMM yyyy')}</p>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-blue-50 rounded p-2">
                      <span className="text-gray-500">Revenue</span>
                      <p className="font-semibold">RM {Math.round(monthly.monthRevenue).toLocaleString()}</p>
                    </div>
                    <div className="bg-orange-50 rounded p-2 cursor-pointer" onClick={() => setExpandedBb(isExpanded ? null : bb.id)}>
                      <span className="text-gray-500 flex items-center gap-1">Cost {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
                      <p className="font-semibold">RM {Math.round(monthly.monthCost).toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 rounded p-2">
                      <span className="text-gray-500">Profit</span>
                      <p className={`font-semibold ${monthly.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>RM {Math.round(monthly.profit).toLocaleString()}</p>
                    </div>
                    <div className="bg-purple-50 rounded p-2">
                      <span className="text-gray-500">Partner</span>
                      <p className="font-semibold">RM {Math.round(monthly.partnerShare).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Total figures */}
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1 font-medium">Total (All Time)</p>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="bg-gray-50 rounded p-1.5 text-center">
                      <span className="text-gray-400">Rev</span>
                      <p className="font-medium text-[11px]">RM {total.totalRevenue.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5 text-center">
                      <span className="text-gray-400">Cost</span>
                      <p className="font-medium text-[11px]">RM {total.totalCost.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5 text-center">
                      <span className="text-gray-400">Profit</span>
                      <p className={`font-medium text-[11px] ${total.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>RM {total.profit.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-1.5 text-center">
                      <span className="text-gray-400">Partner</span>
                      <p className="font-medium text-[11px]">RM {total.partnerShare.toLocaleString()}</p>
                    </div>
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
                          {bbCosts.map(c => {
                            const monthEntries = getMonthlyCost(c)
                            const thisMonth = monthEntries.find(e => isSameMonth(e.month, viewMonth))
                            return (
                              <div key={c.id} className="bg-orange-50 rounded px-2 py-1.5">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-sm font-medium">{c.name}</span>
                                    {c.start_month && c.end_month && (
                                      <span className="text-[10px] text-gray-400 ml-2">
                                        {format(parseISO(c.start_month), 'MMM yy')} → {format(parseISO(c.end_month), 'MMM yy')}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <p className="text-xs font-medium">RM {c.amount.toLocaleString()} total</p>
                                      {thisMonth && <p className="text-[10px] text-orange-600">RM {Math.round(thisMonth.amount).toLocaleString()}/mo</p>}
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => handleDeleteCost(c.id)}><Trash2 className="h-3 w-3" /></Button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* Add new cost */}
                      <div className="space-y-2 border-t pt-2">
                        <p className="text-xs font-medium text-gray-500">Add Cost</p>
                        <div className="flex gap-2">
                          <Input placeholder="Cost name" className="text-sm" value={newCost.name} onChange={e => setNewCost(f => ({ ...f, name: e.target.value }))} />
                          <Input type="number" placeholder="Total RM" className="text-sm w-28" value={newCost.amount || ''} onChange={e => setNewCost(f => ({ ...f, amount: +e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-gray-400">From Month</Label>
                            <Input type="month" className="text-sm" value={newCost.start_month} onChange={e => setNewCost(f => ({ ...f, start_month: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px] text-gray-400">To Month</Label>
                            <Input type="month" className="text-sm" value={newCost.end_month} onChange={e => setNewCost(f => ({ ...f, end_month: e.target.value }))} />
                          </div>
                        </div>
                        <Button size="sm" className="w-full bg-red-600 hover:bg-red-700" onClick={() => handleAddCost(bb.id)}><Plus className="h-4 w-4 mr-1" /> Add Cost</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Active bookings */}
                {active.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500 mb-1">Active Bookings</p>
                    {active.map(b => {
                      const monthlyRev = getMonthlyRevenue(b)
                      const thisMonthRev = monthlyRev.find(e => isSameMonth(e.month, viewMonth))
                      return (
                        <div key={b.id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                          <div>
                            <span className="text-xs font-medium">{b.client?.company_name}</span>
                            <span className="text-[10px] text-gray-400 ml-2">
                              {format(parseISO(b.start_date), 'dd MMM yy')} → {format(parseISO(b.end_date), 'dd MMM yy')}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-500">RM {(b.total_amount || 0).toLocaleString()} total</p>
                            {thisMonthRev && <p className="text-[10px] text-blue-600 font-medium">RM {Math.round(thisMonthRev.amount).toLocaleString()}/mo</p>}
                          </div>
                        </div>
                      )
                    })}
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
