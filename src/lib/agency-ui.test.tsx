// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { from, fetchMock, profile } = vi.hoisted(() => ({ from: vi.fn(), fetchMock: vi.fn(), profile: { id: 'agency', role: 'agency', approved: true } }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from }) }))
vi.mock('@/lib/hooks/use-profile', () => ({ useProfile: () => ({ profile, loading: false }) }))
vi.mock('@/lib/hooks/use-role', () => ({ useRole: () => ({ canEdit: true }) }))
import CalendarPage from '@/app/(app)/calendar/page'
import UsersPage from '@/app/(app)/users/page'
import { malaysiaMonth } from './agency-access'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => { vi.clearAllMocks(); profile.role = 'agency'; vi.stubGlobal('fetch', fetchMock) })

describe('Agency calendar interface', () => {
  it('preserves internal users previous-month navigation and existing data access', async () => {
    profile.role = 'team'
    from.mockReturnValue({ select: () => ({ order: async () => ({ data: [] }) }) })
    render(<CalendarPage />)
    await screen.findByRole('heading', { name: 'Calendar' })
    expect(screen.getByRole('button', { name: 'Previous month' })).not.toBeDisabled()
    expect(screen.queryAllByTitle('Add content change').length).toBeGreaterThan(0)
    expect(from).toHaveBeenCalledTimes(3)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(from).toHaveBeenCalledTimes(3)
  })
  it('loads only restricted data, blocks previous-month navigation and removes write controls', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ bookings: [], billboards: [], content_changes: [] }) })
    render(<CalendarPage />)
    await screen.findByText(/Read-only · Current and future months/)
    expect(from).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/agency-calendar?month=${malaysiaMonth()}`)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.queryByTitle('Add content change')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Click to add content change')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await screen.findByText(/Read-only · Current and future months/)
    expect(screen.getByRole('button', { name: 'Previous month' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    await screen.findByText(/Read-only · Current and future months/)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })
})

describe('Owner Agency role selection', () => {
  it('offers Agency for existing and new accounts with fixed read-only access text', async () => {
    const chain = (data: unknown[]) => ({ select: () => ({ order: async () => ({ data }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data }).then(resolve) }) })
    from.mockImplementation((table: string) => chain(table === 'profiles' ? [{ id: 'a', name: 'Agency User', email: 'agency@example.test', role: 'agency', approved: true, allowed_pages: ['/calendar'] }] : []))
    render(<UsersPage />)
    await screen.findByText('Agency User')
    expect(screen.getByRole('option', { name: 'Agency' })).toBeInTheDocument()
    expect(screen.getByText('Calendar only · Read-only · Current/future months (Malaysia)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Access' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create User' }))
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'agency' } })
    expect(screen.getByText(/Agency users can only view the calendar/)).toBeInTheDocument()
    expect(screen.queryByText('Pages this user can see')).not.toBeInTheDocument()
    expect(screen.queryByText('Billboard access')).not.toBeInTheDocument()
  })
})
