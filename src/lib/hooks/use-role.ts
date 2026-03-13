'use client'

import { useProfile } from './use-profile'

export function useRole() {
  const { profile, loading } = useProfile()
  return {
    profile,
    loading,
    isOwner: profile?.role === 'owner',
    isTeam: profile?.role === 'team',
    isPartner: profile?.role === 'partner',
    canEdit: profile?.role === 'owner',  // Only owner can edit
  }
}
