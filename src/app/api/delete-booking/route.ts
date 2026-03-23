import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { bookingId, userId } = await req.json()
  if (!bookingId || !userId) {
    return NextResponse.json({ error: 'Missing bookingId or userId' }, { status: 400 })
  }

  // Use service role to bypass RLS for cascading deletes
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify user is owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (!profile || profile.role !== 'owner') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Delete profit_sharing first, then booking
  await supabase.from('profit_sharing').delete().eq('booking_id', bookingId)
  const { error } = await supabase.from('bookings').delete().eq('id', bookingId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
