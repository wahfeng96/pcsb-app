'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, LogOut, RefreshCw } from 'lucide-react'

export default function PendingApprovalPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email || '')
    })
  }, [])

  async function checkStatus() {
    setChecking(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('profiles').select('approved, role').eq('id', user.id).single()
      if (data && (data.approved || data.role === 'owner')) {
        window.location.href = '/dashboard'
        return
      }
    }
    setChecking(false)
    alert('Your account is still pending approval. Please check back later.')
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
            <Clock className="h-8 w-8 text-red-600 animate-pulse" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-gray-900">Waiting for Approval</h1>
            <p className="text-sm text-gray-500 mt-2">
              Your account has been created successfully. The owner will review and approve your access shortly.
            </p>
          </div>

          {email && (
            <div className="bg-gray-100 rounded-lg px-4 py-2 text-sm text-gray-600">
              Signed up as: <span className="font-semibold text-gray-900">{email}</span>
            </div>
          )}

          <div className="flex gap-2 justify-center">
            <Button onClick={checkStatus} disabled={checking} className="bg-red-600 hover:bg-red-700">
              <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
              Check Status
            </Button>
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
