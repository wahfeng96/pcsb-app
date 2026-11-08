import { beforeEach, describe, expect, it, vi } from 'vitest'
const { ownerSession, adminClient, upsert, createUser, from } = vi.hoisted(() => ({ ownerSession: { role: 'owner' }, adminClient: vi.fn(), upsert: vi.fn(), createUser: vi.fn(), from: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: adminClient }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: ownerSession }) }) }) }) }) }))
import { POST } from '@/app/api/admin/create-user/route'

function request(role = 'agency') {
  return new Request('https://example.com/api/admin/create-user', { method: 'POST', body: JSON.stringify({ name: 'Agency', email: 'agency@example.test', password: 'test-only-password', role, allowed_pages: ['/users','/profit-loss'], can_edit_profit_loss: true, billboard_access: [{ billboard_id: 'screen', can_edit: true }] }) })
}
describe('Owner-controlled Agency account creation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); ownerSession.role = 'owner'
    upsert.mockResolvedValue({ error: null })
    createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
    from.mockImplementation((table: string) => table === 'billboards' ? { select: async () => ({ data: [{ id: 'screen' }] }) } : { upsert })
    adminClient.mockReturnValue({ from, auth: { admin: { createUser } } })
  })
  it('creates Agency with fixed calendar access and strips requested edit/billboard grants', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ role: 'agency', allowed_pages: ['/calendar'], approved: true, can_edit_profit_loss: false, can_edit_other_profit_loss: false }), { onConflict: 'id' })
    expect(from).not.toHaveBeenCalledWith('user_billboard_access')
  })
  it('rejects Agency self-creation/escalation and arbitrary role inputs before admin operations', async () => {
    ownerSession.role = 'agency'
    expect((await POST(request())).status).toBe(403)
    expect(adminClient).not.toHaveBeenCalled()
    ownerSession.role = 'owner'
    expect((await POST(request('unexpected'))).status).toBe(400)
    expect((await POST(request('owner'))).status).toBe(400)
    expect(adminClient).not.toHaveBeenCalled()
  })
})
