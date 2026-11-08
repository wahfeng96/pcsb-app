import { authenticatedCaller } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const caller = await authenticatedCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { bookingId } = await req.json()
  if (!bookingId) {
    return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
  }

  // Use service role to bypass RLS for cascading deletes
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Delete profit_sharing first, then booking
  await supabase.from('profit_sharing').delete().eq('booking_id', bookingId)
  const { error } = await supabase.from('bookings').delete().eq('id', bookingId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
