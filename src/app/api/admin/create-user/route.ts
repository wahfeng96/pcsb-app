import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { APP_PAGES } from '@/lib/page-access'

type BillboardAccessInput = { billboard_id: string; can_edit: boolean }

export async function POST(request: Request) {
  const body = await request.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role === 'partner' ? 'partner' : 'team'
  const validPages = new Set<string>(APP_PAGES.map(page => page.href))
  const allowedPages = Array.isArray(body.allowed_pages)
    ? [...new Set<string>(body.allowed_pages.filter((page: unknown): page is string => typeof page === 'string' && validPages.has(page)))]
    : APP_PAGES.map(page => page.href)
  const billboardAccess: BillboardAccessInput[] = Array.isArray(body.billboard_access)
    ? body.billboard_access.filter((access: unknown): access is BillboardAccessInput => {
        if (!access || typeof access !== 'object') return false
        const candidate = access as Partial<BillboardAccessInput>
        return typeof candidate.billboard_id === 'string' && typeof candidate.can_edit === 'boolean'
      })
    : []

  if (!name || !email || !email.includes('@')) {
    return NextResponse.json({ error: 'Name and a valid email are required' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(cookieName: string) { return cookieStore.get(cookieName)?.value },
        set() {},
        remove() {},
      },
    }
  )

  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', caller.id).single()
  if (!callerProfile || callerProfile.role !== 'owner') {
    return NextResponse.json({ error: 'Only the Owner can create users' }, { status: 403 })
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: billboardRows } = await adminClient.from('billboards').select('id')
  const validBillboardIds = new Set((billboardRows || []).map(row => row.id))
  const safeBillboardAccess = billboardAccess.filter(access => validBillboardIds.has(access.billboard_id))

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || 'Unable to create user' }, { status: 400 })
  }

  const userId = created.user.id
  const { error: profileError } = await adminClient.from('profiles').upsert({
    id: userId,
    email,
    name,
    role,
    approved: true,
    allowed_pages: allowedPages,
  }, { onConflict: 'id' })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  if (safeBillboardAccess.length > 0) {
    const { error: accessError } = await adminClient.from('user_billboard_access').insert(
      safeBillboardAccess.map(access => ({ user_id: userId, ...access }))
    )
    if (accessError) {
      await adminClient.from('profiles').delete().eq('id', userId)
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: accessError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
