// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsUnlockDialog } from './accounts-unlock-dialog'

afterEach(cleanup)
describe('Accounts per-entry PIN dialog',()=>{
  it('requires four digits and clears a rejected PIN while keeping the chosen entry open',async()=>{
    const onUnlock=vi.fn().mockResolvedValue({ok:false,error:'Incorrect PIN.'})
    const onClose=vi.fn()
    render(<AccountsUnlockDialog entry="Enchanteur · Aug 2026 · @test" onClose={onClose} onUnlock={onUnlock} />)
    const input=screen.getByLabelText('PIN')
    const submit=screen.getByRole('button',{name:'Return to Invoice Sent'}) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(input,{target:{value:'12'}})
    expect(submit.disabled).toBe(true)
    fireEvent.change(input,{target:{value:'9999'}})
    fireEvent.click(submit)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent','Incorrect PIN.')
    expect((input as HTMLInputElement).value).toBe('')
    expect(onClose).not.toHaveBeenCalled()
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })
  it('prevents duplicate submits and closes only after the server and refresh succeed',async()=>{
    let complete!: (value:{ok:boolean})=>void
    const onUnlock=vi.fn(()=>new Promise<{ok:boolean}>(resolve=>{complete=resolve}))
    const onClose=vi.fn()
    render(<AccountsUnlockDialog entry="Selected entry" onClose={onClose} onUnlock={onUnlock} />)
    fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'2468'}})
    const form=screen.getByRole('button',{name:'Return to Invoice Sent'}).closest('form')!
    fireEvent.submit(form);fireEvent.submit(form)
    expect(onUnlock).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button',{name:'Unlocking...'}) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    complete({ok:true})
    await waitFor(()=>expect(onClose).toHaveBeenCalledTimes(1))
    expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('')
  })
  it('shows a recoverable failure on network errors',async()=>{
    render(<AccountsUnlockDialog entry="Selected entry" onClose={vi.fn()} onUnlock={vi.fn().mockRejectedValue(new Error('offline'))} />)
    fireEvent.change(screen.getByLabelText('PIN'),{target:{value:'2468'}})
    fireEvent.click(screen.getByRole('button',{name:'Return to Invoice Sent'}))
    expect((await screen.findByRole('alert')).textContent).toContain('Refresh Accounts')
  })
})
