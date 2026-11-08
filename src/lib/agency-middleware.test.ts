import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { createServerClient, profile } = vi.hoisted(() => ({ createServerClient: vi.fn(), profile: { role: 'agency', approved: true, allowed_pages: ['/dashboard', '/users'] } }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))
import { updateSession } from './supabase/middleware'

describe('Agency middleware', () => {
  beforeEach(() => {
    profile.approved = true
    createServerClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'agency' } } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }) })
  })
  it('redirects direct app, nested, unknown and root URLs to Calendar regardless of allowed_pages', async () => {
    for (const path of ['/', '/dashboard', '/clients', '/users', '/calendar/history', '/unknown']) {
      const response = await updateSession(new NextRequest(`https://example.com${path}?month=2020-01`))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://example.com/calendar')
    }
    expect((await updateSession(new NextRequest('https://example.com/calendar'))).status).toBe(200)
  })
  it('blocks all other APIs and write methods, even direct service-role routes', async () => {
    for (const path of ['/api/admin/create-user', '/api/admin/delete-user', '/api/billboard-costs', '/api/delete-booking', '/api/agency-calendar/extra']) {
      expect((await updateSession(new NextRequest(`https://example.com${path}`, { method: 'POST' }))).status).toBe(403)
    }
    expect((await updateSession(new NextRequest('https://example.com/api/agency-calendar'))).status).toBe(200)
    expect((await updateSession(new NextRequest('https://example.com/api/agency-calendar', { method: 'POST' }))).status).toBe(403)
    expect((await updateSession(new NextRequest('https://example.com/calendar', { method: 'POST' }))).status).toBe(403)
  })
  it('keeps unapproved Agency users pending and denies their calendar API', async () => {
    profile.approved = false
    expect((await updateSession(new NextRequest('https://example.com/calendar'))).headers.get('location')).toBe('https://example.com/pending-approval')
    expect((await updateSession(new NextRequest('https://example.com/api/agency-calendar'))).status).toBe(403)
  })
})
