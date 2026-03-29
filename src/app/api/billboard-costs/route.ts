import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Service role client to bypass RLS
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Verify user is owner
async function verifyOwner(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  return profile?.role === 'owner'
}

// POST = add new cost
export async function POST(req: NextRequest) {
  const { userId, billboard_id, name, amount, start_month, end_month } = await req.json()
  if (!userId || !billboard_id || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getAdmin()
  if (!(await verifyOwner(supabase, userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data, error } = await supabase.from('billboard_costs').insert({
    billboard_id,
    name,
    amount: amount || 0,
    start_month: start_month || null,
    end_month: end_month || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

// PUT = update existing cost
export async function PUT(req: NextRequest) {
  const { userId, id, name, amount, start_month, end_month } = await req.json()
  if (!userId || !id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getAdmin()
  if (!(await verifyOwner(supabase, userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await supabase.from('billboard_costs').update({
    name,
    amount: amount || 0,
    start_month: start_month || null,
    end_month: end_month || null,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE = remove cost
export async function DELETE(req: NextRequest) {
  const { userId, id } = await req.json()
  if (!userId || !id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getAdmin()
  if (!(await verifyOwner(supabase, userId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await supabase.from('billboard_costs').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
