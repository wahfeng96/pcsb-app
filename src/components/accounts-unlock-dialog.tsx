'use client'

import { useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function AccountsUnlockDialog({ entry, onClose, onUnlock }: {
  entry: string | null
  onClose: () => void
  onUnlock: (pin: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  function close() {
    if (busy.current) return
    setPin(''); setError(''); onClose()
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy.current || !/^\d{4}$/.test(pin)) return
    busy.current = true
    setSaving(true); setError('')
    try {
      const result = await onUnlock(pin)
      setPin('')
      if (result.ok) onClose()
      else setError(result.error || 'Unable to unlock this entry.')
    } catch {
      setPin(''); setError('Unable to unlock this entry. Refresh Accounts and try again.')
    } finally {
      busy.current = false; setSaving(false)
    }
  }
  return <Dialog open={entry !== null} onOpenChange={open => { if (!open) close() }}>
    <DialogContent role="dialog" aria-modal="true" aria-labelledby="accounts-unlock-title">
      <DialogHeader><DialogTitle id="accounts-unlock-title">Unlock completed entry</DialogTitle></DialogHeader>
      <p className="text-sm text-gray-600">{entry}</p>
      <p className="text-sm text-gray-600">Enter the PIN to return this Accounts entry to Invoice Sent. Profit Sharing and Commission records remain unchanged. Any existing P&amp;L assignment is retained; this entry leaves completed Accounts revenue until completed again. Locked P&amp;L months must be unlocked first.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium" htmlFor="accounts-unlock-pin">PIN</label>
        <Input id="accounts-unlock-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}" autoFocus required value={pin} disabled={saving} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0,4))} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button>
          <Button type="submit" disabled={saving || !/^\d{4}$/.test(pin)}>{saving ? 'Unlocking...' : 'Return to Invoice Sent'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
