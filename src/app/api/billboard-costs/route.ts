import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Service role client to bypass RLS
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Verify user can edit: owner can edit all, team needs can_edit access on that billboard
async function canEditCosts(supabase: ReturnType<typeof createClient>, userId: string, billboardId?: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()
  if (!profile) return false
  if (profile.role === 'owner') return true
  if ((profile.role === 'team' || profile.role === 'partner') && billboardId) {
    const { data: access } = await supabase
      .from('user_billboard_access')
      .select('can_edit')
      .eq('user_id', userId)
      .eq('billboard_id', billboardId)
      .single()
    return access?.can_edit === true
  }
  return false
}

// Month input gives "2026-03" but Postgres date column needs "2026-03-01"
function toDate(month: string | null): string | null {
  if (!month) return null
  return month.length === 7 ? `${month}-01` : month
}

// POST = add new cost
export async function POST(req: NextRequest) {
  const { userId, billboard_id, name, amount, start_month, end_month } = await req.json()
  if (!userId || !billboard_id || !name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getAdmin()
  if (!(await canEditCosts(supabase, userId, billboard_id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data, error } = await supabase.from('billboard_costs').insert({
    billboard_id,
    name,
    amount: amount || 0,
    start_month: toDate(start_month),
    end_month: toDate(end_month),
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

  // Look up billboard_id from the cost record for access check
  const { data: cost } = await supabase.from('billboard_costs').select('billboard_id').eq('id', id).single()
  if (!cost) return NextResponse.json({ error: 'Cost not found' }, { status: 404 })
  if (!(await canEditCosts(supabase, userId, cost.billboard_id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await supabase.from('billboard_costs').update({
    name,
    amount: amount || 0,
    start_month: toDate(start_month),
    end_month: toDate(end_month),
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

  // Look up billboard_id from the cost record for access check
  const { data: cost } = await supabase.from('billboard_costs').select('billboard_id').eq('id', id).single()
  if (!cost) return NextResponse.json({ error: 'Cost not found' }, { status: 404 })
  if (!(await canEditCosts(supabase, userId, cost.billboard_id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await supabase.from('billboard_costs').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
