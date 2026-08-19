import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { APP_PAGES, canAccessPage, firstAllowedPage } from '@/lib/page-access'

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

  // Check profile and approval status for authenticated users
  if (user && !request.nextUrl.pathname.startsWith('/api') && !request.nextUrl.pathname.startsWith('/auth')) {
    const { data: profile } = await supabase.from('profiles').select('approved, role, allowed_pages').eq('id', user.id).single()
    
    // No profile found (user was removed) → sign out and redirect to login
    if (!profile) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    // Owner always gets in
    if (profile.role === 'owner') {
      // If on pending page, redirect to dashboard
      if (request.nextUrl.pathname.startsWith('/pending-approval')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    } else if (!profile.approved) {
      // Not approved → redirect to pending (unless already there)
      if (!request.nextUrl.pathname.startsWith('/pending-approval')) {
        const url = request.nextUrl.clone()
        url.pathname = '/pending-approval'
        return NextResponse.redirect(url)
      }
    } else {
      // Approved user on pending page → redirect to dashboard
      if (request.nextUrl.pathname.startsWith('/pending-approval')) {
        const url = request.nextUrl.clone()
        url.pathname = firstAllowedPage(profile.role, profile.allowed_pages)
        return NextResponse.redirect(url)
      }

      const requestedPage = APP_PAGES.find(page =>
        request.nextUrl.pathname === page.href || request.nextUrl.pathname.startsWith(`${page.href}/`)
      )
      if (requestedPage && !canAccessPage(profile.role, profile.allowed_pages, requestedPage.href)) {
        const url = request.nextUrl.clone()
        url.pathname = firstAllowedPage(profile.role, profile.allowed_pages)
        return NextResponse.redirect(url)
      }
    }
  }

  // Redirect root to dashboard
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    const { data: profile } = await supabase.from('profiles').select('role, allowed_pages').eq('id', user.id).single()
    url.pathname = firstAllowedPage(profile?.role, profile?.allowed_pages)
    return NextResponse.redirect(url)
  }

  return response
}
