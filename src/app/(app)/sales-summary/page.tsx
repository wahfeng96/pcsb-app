'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, addMonths, subMonths, parseISO, isSameMonth } from 'date-fns'
import type { Billboard, Booking, Client } from '@/types/database'

type BookingWithRefs = Booking & { client: Client; billboard: Billboard }

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

export default function SalesSummaryPage() {
  const supabase = createClient()
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [bookings, setBookings] = useState<BookingWithRefs[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBb, setSelectedBb] = useState<string>('all')
  const [startMonth, setStartMonth] = useState(startOfMonth(new Date(new Date().getFullYear(), 0, 1))) // Jan this year

  useEffect(() => {
    async function load() {
      const [bb, bk] = await Promise.all([
        supabase.from('billboards').select('*').order('name'),
        supabase.from('bookings').select('*, client:clients(*), billboard:billboards(*)').neq('status', 'cancelled').order('start_date'),
      ])
      setBillboards(bb.data || [])
      setBookings(bk.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // 12 months starting from startMonth
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => addMonths(startMonth, i))
  }, [startMonth])

  // Filter bookings by billboard
  const filteredBookings = useMemo(() => {
    if (selectedBb === 'all') return bookings
    return bookings.filter(b => b.billboard_id === selectedBb)
  }, [bookings, selectedBb])

  // Build rows: each unique client+brand+sales combo
  const rows = useMemo(() => {
    const rowMap = new Map<string, {
      label: string
      salesPerson: string
      monthAmounts: Map<string, number>
    }>()

    filteredBookings.forEach(b => {
      const brandName = b.brand_name || b.client?.company_name || 'Unknown'
      const sp = b.sales_person || ''
      const label = sp ? `${brandName} (${sp})` : brandName
      const key = `${brandName}-${sp}-${b.billboard_id}`

      if (!rowMap.has(key)) {
        rowMap.set(key, { label, salesPerson: sp, monthAmounts: new Map() })
      }

      const row = rowMap.get(key)!
      const bookingMonths = getMonthsBetween(parseISO(b.start_date), parseISO(b.end_date))
      const monthlyAmt = b.monthly_rate || (bookingMonths.length > 0 ? b.total_amount / bookingMonths.length : 0)

      bookingMonths.forEach(m => {
        const mKey = format(m, 'yyyy-MM')
        row.monthAmounts.set(mKey, (row.monthAmounts.get(mKey) || 0) + monthlyAmt)
      })
    })

    return Array.from(rowMap.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [filteredBookings])

  // Monthly totals
  const monthTotals = useMemo(() => {
    const totals = new Map<string, number>()
    months.forEach(m => {
      const mKey = format(m, 'yyyy-MM')
      let total = 0
      rows.forEach(r => { total += r.monthAmounts.get(mKey) || 0 })
      totals.set(mKey, total)
    })
    return totals
  }, [rows, months])

  // Grand total (all months shown)
  const grandTotal = useMemo(() => {
    let total = 0
    monthTotals.forEach(v => total += v)
    return total
  }, [monthTotals])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Sales Summary</h1>

      {/* Billboard filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button size="sm" variant={selectedBb === 'all' ? 'default' : 'outline'} onClick={() => setSelectedBb('all')} className={selectedBb === 'all' ? 'bg-red-600 hover:bg-red-700' : ''}>All</Button>
        {billboards.map(bb => (
          <Button key={bb.id} size="sm" variant={selectedBb === bb.id ? 'default' : 'outline'} onClick={() => setSelectedBb(bb.id)} className={`whitespace-nowrap text-xs ${selectedBb === bb.id ? 'bg-red-600 hover:bg-red-700' : ''}`}>{bb.name}</Button>
        ))}
      </div>

      {/* Year navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg border p-2">
        <Button size="icon" variant="ghost" onClick={() => setStartMonth(subMonths(startMonth, 12))}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="font-semibold">{format(startMonth, 'yyyy')} — {format(addMonths(startMonth, 11), 'yyyy')}</h2>
        <Button size="icon" variant="ghost" onClick={() => setStartMonth(addMonths(startMonth, 12))}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      {/* Spreadsheet table */}
      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="min-w-max w-full text-xs">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="sticky left-0 bg-gray-100 z-10 px-3 py-2 text-left font-semibold min-w-[180px]">#</th>
              <th className="sticky left-[180px] bg-gray-100 z-10 px-3 py-2 text-left font-semibold min-w-[200px]">INCOME</th>
              {months.map(m => (
                <th key={format(m, 'yyyy-MM')} className={`px-3 py-2 text-right font-semibold min-w-[90px] ${isSameMonth(m, new Date()) ? 'bg-yellow-100' : ''}`}>
                  {format(m, "MMM''yy").toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={14} className="px-3 py-8 text-center text-gray-400">No bookings found</td></tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="sticky left-0 bg-white z-10 px-3 py-2 text-gray-400">{idx + 1}</td>
                  <td className="sticky left-[180px] bg-white z-10 px-3 py-2 font-medium truncate max-w-[200px]">{row.label}</td>
                  {months.map(m => {
                    const mKey = format(m, 'yyyy-MM')
                    const amt = row.monthAmounts.get(mKey) || 0
                    const isCurrentMonth = isSameMonth(m, new Date())
                    return (
                      <td key={mKey} className={`px-3 py-2 text-right tabular-nums ${isCurrentMonth ? 'bg-yellow-50' : ''} ${amt > 0 ? 'text-red-600 font-medium' : 'text-gray-200'}`}>
                        {amt > 0 ? amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
              <td className="sticky left-0 bg-gray-50 z-10 px-3 py-2"></td>
              <td className="sticky left-[180px] bg-gray-50 z-10 px-3 py-2">
                <span className="text-gray-900">{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </td>
              {months.map(m => {
                const mKey = format(m, 'yyyy-MM')
                const total = monthTotals.get(mKey) || 0
                const isCurrentMonth = isSameMonth(m, new Date())
                return (
                  <td key={mKey} className={`px-3 py-2 text-right tabular-nums ${isCurrentMonth ? 'bg-yellow-100' : ''}`}>
                    {total > 0 ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
