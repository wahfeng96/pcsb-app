'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const MONEY_SYMBOLS = ['💰', '💵', '💲', '🪙', '💎', '📈', '🏆']

interface FallingItem {
  id: number
  symbol: string
  x: number
  delay: number
  duration: number
  size: number
}

function MoneyRain() {
  const [items, setItems] = useState<FallingItem[]>([])

  useEffect(() => {
    const generated: FallingItem[] = []
    for (let i = 0; i < 40; i++) {
      generated.push({
        id: i,
        symbol: MONEY_SYMBOLS[Math.floor(Math.random() * MONEY_SYMBOLS.length)],
        x: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 3 + Math.random() * 4,
        size: 16 + Math.random() * 24,
      })
    }
    setItems(generated)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {items.map(item => (
        <span
          key={item.id}
          className="absolute animate-fall"
          style={{
            left: `${item.x}%`,
            top: '-40px',
            fontSize: `${item.size}px`,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
            opacity: 0.3 + Math.random() * 0.4,
          }}
        >
          {item.symbol}
        </span>
      ))}
      <style jsx>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.4; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
        .animate-fall {
          animation: fall linear infinite;
        }
      `}</style>
    </div>
  )
}

export default function LandingPage() {
  const [checking, setChecking] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard')
      } else {
        setChecking(false)
      }
    })
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-950 to-gray-950">
        <div className="w-8 h-8 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-red-950 via-gray-950 to-gray-900 flex flex-col items-center justify-center px-6 overflow-hidden">
      <MoneyRain />

      {/* Content */}
      <div className="relative z-10 text-center space-y-8 max-w-md">
        {/* Logo */}
        <div className="mx-auto w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-red-600/30">
          <span className="text-white font-bold text-3xl">PC</span>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">PCSB</h1>
          <p className="text-red-300 text-lg font-medium">Management System</p>
          <p className="text-gray-400 text-sm mt-2">Powering Connections, Strengthening Brands</p>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">7</div>
            <div className="text-xs text-gray-400">Billboards</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">4</div>
            <div className="text-xs text-gray-400">Locations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">24/7</div>
            <div className="text-xs text-gray-400">Live</div>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <Link href="/auth/login" className="block">
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white h-12 text-base font-semibold shadow-lg shadow-red-600/20">
              Sign In
            </Button>
          </Link>
          <Link href="/auth/signup" className="block">
            <Button variant="outline" className="w-full h-12 text-base border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white">
              Create Account
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs">
          Penjenamaan Canggih Sdn Bhd © 2026
        </p>
      </div>
    </div>
  )
}
