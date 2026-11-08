import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { authenticatedCaller, rpc, adminCreate } = vi.hoisted(() => ({ authenticatedCaller: vi.fn(), rpc: vi.fn(), adminCreate: vi.fn() }))
vi.mock('@/lib/api-auth', () => ({ authenticatedCaller }))
vi.mock('@supabase/supabase-js', () => ({ createClient: adminCreate }))
import { GET } from '@/app/api/agency-calendar/route'
import { POST as deleteBooking } from '@/app/api/delete-booking/route'
import { POST, PUT, DELETE } from '@/app/api/billboard-costs/route'

describe('Agency API authorization', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.useRealTimers() })
  it('requires an authenticated approved caller and the Agency role for calendar reads', async () => {
    authenticatedCaller.mockResolvedValue(null)
    expect((await GET(new NextRequest('https://example.com/api/agency-calendar?month=2099-01'))).status).toBe(401)
    authenticatedCaller.mockResolvedValue({ role: 'team' })
    expect((await GET(new NextRequest('https://example.com/api/agency-calendar?month=2099-01'))).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('validates month server-side and invokes only the session-scoped RPC without caching', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T16:00:00Z'))
    authenticatedCaller.mockResolvedValue({ role: 'agency', supabase: { rpc } })
    for (const query of ['', '?month=2026-10', '?month=2026-11&month=2026-10', '?month=2026-11-01', '?month=infinity']) {
      expect((await GET(new NextRequest(`https://example.com/api/agency-calendar${query}`))).status).toBe(403)
    }
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: { bookings: [], billboards: [], content_changes: [] } })
    const response = await GET(new NextRequest('https://example.com/api/agency-calendar?month=2026-11'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(rpc).toHaveBeenCalledWith('get_agency_calendar', { p_month: '2026-11-01' })
  })
  it('uses the authenticated team ID instead of a spoofed owner ID for billboard access checks', async () => {
    authenticatedCaller.mockResolvedValue({ id: 'real-team-id', role: 'team' })
    const eq = vi.fn()
    const query = (data: unknown) => {
      const chain = { select: () => chain, eq: (key: string, value: string) => { eq(key, value); return chain }, single: async () => ({ data }) }
      return chain
    }
    adminCreate.mockReturnValue({ from: (table: string) => query(table === 'profiles' ? { role: 'team' } : { can_edit: false }) })
    const result = await POST(new NextRequest('https://example.com/api/billboard-costs', { method: 'POST', body: JSON.stringify({ userId: 'spoofed-owner-id', billboard_id: 'screen', name: 'Cost' }) }))
    expect(result.status).toBe(403)
    expect(eq).toHaveBeenCalledWith('id', 'real-team-id')
    expect(eq).toHaveBeenCalledWith('user_id', 'real-team-id')
    expect(eq).not.toHaveBeenCalledWith('id', 'spoofed-owner-id')
  })
  it('blocks every service-role write endpoint even when Agency spoofs an owner userId', async () => {
    authenticatedCaller.mockResolvedValue({ id: 'agency-id', role: 'agency' })
    for (const handler of [deleteBooking, POST, PUT, DELETE]) {
      const result = await handler(new NextRequest('https://example.com/api/write', { method: 'POST', body: JSON.stringify({ userId: 'owner-id', bookingId: 'booking', id: 'cost', billboard_id: 'screen', name: 'Cost' }) }))
      expect(result.status).toBe(403)
    }
    expect(adminCreate).not.toHaveBeenCalled()
  })
})
