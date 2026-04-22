'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Pin, PinOff, Pencil, Trash2, X, Check } from 'lucide-react'

interface Remark {
  id: string
  user_id: string
  title: string
  content: string
  pinned: boolean
  created_at: string
  updated_at: string
}

export default function RemarksPage() {
  const [remarks, setRemarks] = useState<Remark[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const supabase = createClient()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('remarks')
      .select('*')
      .eq('user_id', user.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    setRemarks(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    if (editingId) {
      await supabase.from('remarks').update({ title, content, updated_at: new Date().toISOString() }).eq('id', editingId)
    } else {
      await supabase.from('remarks').insert({ user_id: user.id, title, content })
    }
    setTitle('')
    setContent('')
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    load()
  }

  async function togglePin(id: string, pinned: boolean) {
    await supabase.from('remarks').update({ pinned: !pinned, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function handleDelete(id: string) {
    await supabase.from('remarks').delete().eq('id', id)
    setDeleteConfirm(null)
    load()
  }

  function startEdit(r: Remark) {
    setEditingId(r.id)
    setTitle(r.title)
    setContent(r.content)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setTitle('')
    setContent('')
  }

  if (loading) return <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Remarks</h1>
        {!showForm && (
          <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-4 border-red-200">
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Title (optional)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="font-medium"
            />
            <Textarea
              placeholder="Write your remark here..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleSave} disabled={saving || !content.trim()}>
                <Check className="h-4 w-4 mr-1" /> {editingId ? 'Update' : 'Save'}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelForm}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {remarks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <p className="text-sm">No remarks yet</p>
            <p className="text-xs mt-1">Tap + to record something important</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {remarks.map(r => (
            <Card key={r.id} className={r.pinned ? 'border-red-300 bg-red-50/30' : ''}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {r.title && <p className="font-semibold text-sm mb-0.5">{r.title}</p>}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.content}</p>
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      {new Date(r.updated_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => togglePin(r.id, r.pinned)} className="p-1.5 rounded hover:bg-gray-100" title={r.pinned ? 'Unpin' : 'Pin'}>
                      {r.pinned ? <PinOff className="h-3.5 w-3.5 text-red-500" /> : <Pin className="h-3.5 w-3.5 text-gray-400" />}
                    </button>
                    <button onClick={() => startEdit(r)} className="p-1.5 rounded hover:bg-gray-100">
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                    {deleteConfirm === r.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded bg-red-100 hover:bg-red-200">
                          <Check className="h-3.5 w-3.5 text-red-600" />
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="p-1.5 rounded hover:bg-gray-100">
                          <X className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(r.id)} className="p-1.5 rounded hover:bg-gray-100">
                        <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
