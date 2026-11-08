import { createServerSupabaseClient } from '@/lib/supabase/server'

// The caller always comes from a verified session, never a request body's userId.
export async function authenticatedCaller() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role, approved').eq('id', user.id).single()
  if (!profile || (profile.role !== 'owner' && !profile.approved)) return null
  return { id: user.id, role: profile.role as string, supabase }
}
