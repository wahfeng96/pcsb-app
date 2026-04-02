'use client'

import { useState, useEffect } from 'react'
import { BottomNav } from './bottom-nav'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)

  useEffect(() => {
    function checkLandscape() {
      // Mobile landscape: width > height AND width < 1024px (not desktop)
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024)
    }
    checkLandscape()
    window.addEventListener('resize', checkLandscape)
    window.addEventListener('orientationchange', () => setTimeout(checkLandscape, 100))
    return () => {
      window.removeEventListener('resize', checkLandscape)
      window.removeEventListener('orientationchange', () => {})
    }
  }, [])

  // Close sidebar when switching back to portrait
  useEffect(() => {
    if (!isLandscape) setSidebarOpen(false)
  }, [isLandscape])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar (always visible on md+) */}
      <Sidebar className="hidden md:flex" />

      {/* Mobile landscape sidebar overlay */}
      {isLandscape && sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          <Sidebar className="flex md:hidden z-50" onNavigate={() => setSidebarOpen(false)} />
        </>
      )}

      {/* Landscape toggle button */}
      {isLandscape && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed top-2 left-2 z-50 md:hidden bg-white border border-gray-300 rounded-lg p-1.5 shadow-sm hover:bg-gray-50 active:bg-gray-100"
        >
          {sidebarOpen
            ? <PanelLeftClose className="h-5 w-5 text-gray-600" />
            : <PanelLeftOpen className="h-5 w-5 text-gray-600" />
          }
        </button>
      )}

      <TopBar />
      <main className={`md:ml-56 pb-20 md:pb-6 px-4 py-4 md:px-6 ${isLandscape ? 'pt-12' : ''}`}>
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
