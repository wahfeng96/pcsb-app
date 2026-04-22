'use client'

import { useState } from 'react'
import { BottomNav } from './bottom-nav'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { Menu, X } from 'lucide-react'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar (always visible on md+) */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile sidebar overlay (works for both portrait and landscape) */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          <Sidebar className="flex md:hidden z-50" onNavigate={() => setSidebarOpen(false)} />
        </>
      )}

      {/* Mobile hamburger toggle button (always visible on mobile) */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-2 left-2 z-50 md:hidden bg-white border border-gray-300 rounded-lg p-2 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        aria-label="Toggle menu"
      >
        {sidebarOpen
          ? <X className="h-5 w-5 text-gray-600" />
          : <Menu className="h-5 w-5 text-gray-600" />
        }
      </button>

      <TopBar />
      <main className="md:ml-56 pb-20 md:pb-6 px-4 py-4 md:px-6 pt-14 md:pt-4">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
