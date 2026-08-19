'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'

export default function NoAccessPage() {
  async function signOut() {
    await createClient().auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm text-center bg-white border rounded-xl p-6 shadow-sm">
        <ShieldX className="h-10 w-10 text-gray-400 mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-gray-900">No pages assigned</h1>
        <p className="text-sm text-gray-500 mt-2">Please ask the PCSB Owner to assign page access to your account.</p>
        <Button variant="outline" className="mt-5" onClick={signOut}>Sign Out</Button>
      </div>
    </main>
  )
}
