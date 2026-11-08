import { NextRequest, NextResponse } from 'next/server'
import { authenticatedCaller } from '@/lib/api-auth'
import { isAllowedAgencyMonth } from '@/lib/agency-access'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const caller = await authenticatedCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'agency') return NextResponse.json({ error: 'Agency access required' }, { status: 403 })
  const months = request.nextUrl.searchParams.getAll('month')
  if (months.length !== 1 || !isAllowedAgencyMonth(months[0])) {
    return NextResponse.json({ error: 'Only current and future Malaysia months are available' }, { status: 403 })
  }
  // Session-bound RPC performs the same approval, role and month checks in PostgreSQL.
  const { data, error } = await caller.supabase.rpc('get_agency_calendar', { p_month: `${months[0]}-01` })
  if (error) return NextResponse.json({ error: 'Calendar access denied' }, { status: 403 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
