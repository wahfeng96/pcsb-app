'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Users, Edit2, Eye, Trash2, Plus, X, Check, UserCheck, UserX, ShieldCheck, ShieldX } from 'lucide-react'
import type { Profile, Billboard, UserRole } from '@/types/database'
import { useRole } from '@/lib/hooks/use-role'
import { APP_PAGES } from '@/lib/page-access'

type UserAccess = {
  user_id: string
  billboard_id: string
  can_edit: boolean
}

export default function UsersPage() {
  const supabase = createClient()
  const { canEdit } = useRole()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [billboards, setBillboards] = useState<Billboard[]>([])
  const [accessMap, setAccessMap] = useState<UserAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [selectedBillboards, setSelectedBillboards] = useState<Record<string, 'view' | 'edit'>>({})
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'team' as 'team' | 'partner' })
  const [createPages, setCreatePages] = useState<string[]>(APP_PAGES.map(page => page.href))
  const [createBillboards, setCreateBillboards] = useState<Record<string, 'view' | 'edit'>>({})

  async function load() {
    const [pr, bb, ac] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('billboards').select('*').order('name'),
      supabase.from('user_billboard_access').select('*'),
    ])
    setProfiles(pr.data || [])
    setBillboards(bb.data || [])
    setAccessMap(ac.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getUserAccess(userId: string) {
    return accessMap.filter(a => a.user_id === userId)
  }

  function startEditAccess(userId: string) {
    const user = profiles.find(profile => profile.id === userId)
    const current = getUserAccess(userId)
    const selected: Record<string, 'view' | 'edit'> = {}
    current.forEach(a => {
      selected[a.billboard_id] = a.can_edit ? 'edit' : 'view'
    })
    setSelectedBillboards(selected)
    setSelectedPages(user?.allowed_pages ?? APP_PAGES.map(page => page.href))
    setEditingUser(userId)
  }

  async function saveAccess(userId: string) {
    const { error: pageError } = await supabase.from('profiles').update({ allowed_pages: selectedPages }).eq('id', userId)
    if (pageError) {
      alert('Failed to save page access: ' + pageError.message)
      return
    }

    // Delete existing access
    await supabase.from('user_billboard_access').delete().eq('user_id', userId)

    // Insert new access
    const inserts = Object.entries(selectedBillboards).map(([billboard_id, level]) => ({
      user_id: userId,
      billboard_id,
      can_edit: level === 'edit',
    }))

    if (inserts.length > 0) {
      await supabase.from('user_billboard_access').insert(inserts)
    }

    setEditingUser(null)
    load()
  }

  async function updateRole(userId: string, role: UserRole) {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    load()
  }

  async function toggleApproval(userId: string, approved: boolean) {
    await supabase.from('profiles').update({ approved }).eq('id', userId)
    load()
  }

  async function removeUser(userId: string, email: string) {
    if (!confirm(`Remove user "${email}"? They will be signed out and need to sign up again.`)) return
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert('Failed to remove user: ' + (err.error || 'Unknown error'))
    }
    load()
  }

  function toggleBillboard(bbId: string) {
    setSelectedBillboards(prev => {
      const current = prev[bbId]
      if (!current) return { ...prev, [bbId]: 'view' }
      if (current === 'view') return { ...prev, [bbId]: 'edit' }
      const { [bbId]: _, ...rest } = prev
      return rest
    })
  }

  function togglePage(href: string) {
    setSelectedPages(current => current.includes(href)
      ? current.filter(page => page !== href)
      : [...current, href]
    )
  }

  function openCreateUser() {
    setCreateForm({ name: '', email: '', password: '', role: 'team' })
    setCreatePages(APP_PAGES.map(page => page.href))
    setCreateBillboards({})
    setCreateError('')
    setShowCreateUser(true)
  }

  function toggleCreatePage(href: string) {
    setCreatePages(current => current.includes(href)
      ? current.filter(page => page !== href)
      : [...current, href]
    )
  }

  function toggleCreateBillboard(bbId: string) {
    setCreateBillboards(current => {
      const level = current[bbId]
      if (!level) return { ...current, [bbId]: 'view' }
      if (level === 'view') return { ...current, [bbId]: 'edit' }
      const { [bbId]: _, ...rest } = current
      return rest
    })
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setCreatingUser(true)
    setCreateError('')
    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...createForm,
        allowed_pages: createPages,
        billboard_access: Object.entries(createBillboards).map(([billboard_id, level]) => ({
          billboard_id,
          can_edit: level === 'edit',
        })),
      }),
    })
    const result = await response.json()
    setCreatingUser(false)
    if (!response.ok) {
      setCreateError(result.error || 'Unable to create user')
      return
    }
    setShowCreateUser(false)
    await load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users & Access</h1>
        {canEdit && (
          <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={openCreateUser}>
            <Plus className="h-4 w-4 mr-1" /> Create User
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-gray-500">
            Tap a billboard to cycle: <span className="text-gray-400">None</span> → <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700">👁 View</Badge> → <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">✏️ Edit</Badge> → None
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {profiles.map(user => {
          const access = getUserAccess(user.id)
          const isEditing = editingUser === user.id

          return (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm">{user.name || user.email}</p>
                        {user.role !== 'owner' && (
                          user.approved ? (
                            <Badge className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0">Approved</Badge>
                          ) : (
                            <Badge className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0">Pending</Badge>
                          )
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  {canEdit && (
                  <div className="flex items-center gap-2">
                    <select
                      className="text-xs border rounded px-2 py-1"
                      value={user.role}
                      onChange={e => updateRole(user.id, e.target.value as UserRole)}
                    >
                      <option value="owner">Owner</option>
                      <option value="team">Team</option>
                      <option value="partner">Partner</option>
                    </select>
                    {user.role !== 'owner' && (!isEditing ? (
                      <Button size="sm" variant="outline" onClick={() => startEditAccess(user.id)}>
                        <Edit2 className="h-3 w-3 mr-1" /> Access
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => saveAccess(user.id)}>
                          <Check className="h-3 w-3 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  )}
                </div>

                {/* Approve / Remove actions for non-owner users - owner only */}
                {canEdit && user.role !== 'owner' && (
                  <div className="flex gap-1.5 mb-2">
                    {!user.approved ? (
                      <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => toggleApproval(user.id, true)}>
                        <ShieldCheck className="h-3 w-3 mr-1" /> Approve
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => toggleApproval(user.id, false)}>
                        <ShieldX className="h-3 w-3 mr-1" /> Revoke
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => removeUser(user.id, user.email)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remove
                    </Button>
                  </div>
                )}

                {/* Current access display */}
                {!isEditing && (
                  <div className="flex flex-wrap gap-1">
                    {user.role === 'owner' ? (
                      <div className="flex flex-wrap gap-1">
                        <Badge className="text-[10px] bg-red-100 text-red-700">All Pages (Owner)</Badge>
                        <Badge className="text-[10px] bg-red-100 text-red-700">All Billboards (Owner)</Badge>
                      </div>
                    ) : access.length === 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">Pages: {user.allowed_pages == null ? 'All pages' : `${user.allowed_pages.length} selected`}</p>
                        <span className="text-xs text-gray-400">No billboard access</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">Pages: {user.allowed_pages == null ? 'All pages' : `${user.allowed_pages.length} selected`}</p>
                        <div className="flex flex-wrap gap-1">
                          {access.map(a => {
                            const bb = billboards.find(b => b.id === a.billboard_id)
                            return (
                              <Badge key={a.billboard_id} variant="outline" className={`text-[10px] ${a.can_edit ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                                {a.can_edit ? '✏️' : '👁'} {bb?.name || 'Unknown'}
                              </Badge>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Edit access */}
                {isEditing && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-xs text-gray-500 font-medium">Pages this user can see:</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setSelectedPages(APP_PAGES.map(page => page.href))}>All</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setSelectedPages([])}>None</Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {APP_PAGES.map(page => {
                          const selected = selectedPages.includes(page.href)
                          return (
                            <Button
                              key={page.href}
                              size="sm"
                              variant="outline"
                              className={`justify-start text-xs ${selected ? 'bg-red-50 border-red-400 text-red-700' : 'bg-gray-50 text-gray-400'}`}
                              onClick={() => togglePage(page.href)}
                            >
                              {selected ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}{page.label}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                    <p className="text-xs text-gray-500 font-medium mb-1.5">Tap billboard to cycle access:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {billboards.map(bb => {
                        const level = selectedBillboards[bb.id]
                        return (
                          <Button
                            key={bb.id}
                            size="sm"
                            variant="outline"
                            className={`text-xs ${
                              level === 'edit' ? 'bg-green-100 border-green-400 text-green-700' :
                              level === 'view' ? 'bg-blue-100 border-blue-400 text-blue-700' :
                              'bg-gray-50 text-gray-400'
                            }`}
                            onClick={() => toggleBillboard(bb.id)}
                          >
                            {level === 'edit' ? '✏️' : level === 'view' ? '👁' : '✖'} {bb.name}
                          </Button>
                        )
                      })}
                    </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}

        {profiles.length === 0 && (
          <Card><CardContent className="p-4 text-center text-gray-500 text-sm">No users yet. Users appear here after they sign up.</CardContent></Card>
        )}
      </div>

      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Team Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={createUser} className="space-y-4">
            {createError && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{createError}</div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="create-name">Full Name</Label>
                <Input id="create-name" value={createForm.name} onChange={e => setCreateForm(form => ({ ...form, name: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="create-email">Email</Label>
                <Input id="create-email" type="email" value={createForm.email} onChange={e => setCreateForm(form => ({ ...form, email: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="create-password">Temporary Password</Label>
                <Input id="create-password" type="password" minLength={6} value={createForm.password} onChange={e => setCreateForm(form => ({ ...form, password: e.target.value }))} required />
                <p className="mt-1 text-[10px] text-gray-400">Minimum 6 characters. Share it privately with the user.</p>
              </div>
              <div>
                <Label htmlFor="create-role">Role</Label>
                <select id="create-role" className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm" value={createForm.role} onChange={e => setCreateForm(form => ({ ...form, role: e.target.value as 'team' | 'partner' }))}>
                  <option value="team">Team</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Label>Pages this user can see</Label>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setCreatePages(APP_PAGES.map(page => page.href))}>All</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setCreatePages([])}>None</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {APP_PAGES.map(page => {
                  const selected = createPages.includes(page.href)
                  return (
                    <Button key={page.href} type="button" size="sm" variant="outline" className={`justify-start text-xs ${selected ? 'bg-red-50 border-red-400 text-red-700' : 'bg-gray-50 text-gray-400'}`} onClick={() => toggleCreatePage(page.href)}>
                      {selected ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}{page.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label>Billboard access</Label>
              <p className="mb-1.5 text-[10px] text-gray-400">Tap to cycle: None → View → Edit → None</p>
              <div className="flex flex-wrap gap-1.5">
                {billboards.map(bb => {
                  const level = createBillboards[bb.id]
                  return (
                    <Button key={bb.id} type="button" size="sm" variant="outline" className={`text-xs ${level === 'edit' ? 'bg-green-100 border-green-400 text-green-700' : level === 'view' ? 'bg-blue-100 border-blue-400 text-blue-700' : 'bg-gray-50 text-gray-400'}`} onClick={() => toggleCreateBillboard(bb.id)}>
                      {level === 'edit' ? '✏️' : level === 'view' ? '👁' : '✖'} {bb.name}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateUser(false)} disabled={creatingUser}>Cancel</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700" disabled={creatingUser}>
                {creatingUser ? 'Creating...' : 'Create Account'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
