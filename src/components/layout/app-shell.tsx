'use client'

import { BottomNav } from './bottom-nav'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopBar />
      <main className="md:ml-56 pb-20 md:pb-6 px-4 py-4 md:px-6">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
