import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except auth pages, api routes, and pending-approval)
  if (!user && !request.nextUrl.pathname.startsWith('/auth') && !request.nextUrl.pathname.startsWith('/api') && !request.nextUrl.pathname.startsWith('/pending-approval')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && request.nextUrl.pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Check approval status for authenticated users (except pending-approval page and api routes)
  if (user && !request.nextUrl.pathname.startsWith('/pending-approval') && !request.nextUrl.pathname.startsWith('/api') && !request.nextUrl.pathname.startsWith('/auth')) {
    const { data: profile } = await supabase.from('profiles').select('approved, role').eq('id', user.id).single()
    // Owner always gets in; others need approval
    if (profile && profile.role !== 'owner' && !profile.approved) {
      const url = request.nextUrl.clone()
      url.pathname = '/pending-approval'
      return NextResponse.redirect(url)
    }
  }

  // Redirect approved users away from pending-approval page
  if (user && request.nextUrl.pathname.startsWith('/pending-approval')) {
    const { data: profile } = await supabase.from('profiles').select('approved, role').eq('id', user.id).single()
    if (profile && (profile.approved || profile.role === 'owner')) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Redirect root to dashboard
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}
