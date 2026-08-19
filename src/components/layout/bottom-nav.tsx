'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, Building2, MoreHorizontal, FileText, BarChart3, HandCoins, Percent, Shield, StickyNote, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProfile } from '@/lib/hooks/use-profile'
import { canAccessPage } from '@/lib/page-access'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/billboards', label: 'Billboards', icon: Building2 },
]

const moreNav = [
  { href: '/accounts', label: 'Accounts', icon: FileText },
  { href: '/sales-summary', label: 'Sales Summary', icon: BarChart3 },
  { href: '/profit-sharing', label: 'Profit Sharing', icon: HandCoins },
  { href: '/commission', label: 'Commission', icon: Percent },
  { href: '/users', label: 'Users', icon: Shield },
  { href: '/remarks', label: 'Remarks', icon: StickyNote },
]

export function BottomNav() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const { profile, loading } = useProfile()
  const visibleMainNav = loading ? [] : mainNav.filter(item => canAccessPage(profile?.role, profile?.allowed_pages, item.href))
  const visibleMoreNav = loading ? [] : moreNav.filter(item => canAccessPage(profile?.role, profile?.allowed_pages, item.href))
  const isMoreActive = visibleMoreNav.some(item => pathname.startsWith(item.href))

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-white border-t border-gray-200 shadow-lg rounded-t-xl p-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-sm font-semibold text-gray-700">More</span>
              <button onClick={() => setShowMore(false)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleMoreNav.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 py-3 rounded-lg text-xs',
                      active ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden">
        <div className="flex justify-around items-center h-16">
          {visibleMainNav.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs',
                  active ? 'text-red-600' : 'text-gray-500'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            )
          })}
          {visibleMoreNav.length > 0 && <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs',
              isMoreActive ? 'text-red-600' : 'text-gray-500'
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>}
        </div>
      </nav>
    </>
  )
}
