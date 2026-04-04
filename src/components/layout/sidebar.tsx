'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Calendar, Users, Building2, FileText, BarChart3, HandCoins, Percent, Shield, StickyNote, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/billboards', label: 'Billboards', icon: Building2 },
  { href: '/accounts', label: 'Accounts', icon: FileText },
  { href: '/sales-summary', label: 'Sales Summary', icon: BarChart3 },
  { href: '/profit-sharing', label: 'Profit Sharing', icon: HandCoins },
  { href: '/commission', label: 'Commission', icon: Percent },
  { href: '/users', label: 'Users', icon: Shield },
  { href: '/remarks', label: 'Remarks', icon: StickyNote },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <aside className={cn('flex-col w-56 bg-white border-r border-gray-200 h-screen fixed', className)}>
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Image src="/pcsb-logo.png" alt="PCSB" width={120} height={40} className="object-contain h-10 w-auto" />
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 w-full"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
