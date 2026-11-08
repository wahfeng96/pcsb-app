'use client'

import { useProfile } from './use-profile'
import { canEditOtherProfitLoss } from '@/lib/page-access'

export function useRole() {
  const { profile, loading } = useProfile()
  return {
    profile,
    loading,
    isOwner: profile?.role === 'owner',
    isTeam: profile?.role === 'team',
    isAgency: profile?.role === 'agency',
    isPartner: profile?.role === 'partner',
    canEdit: profile?.role === 'owner',  // Only owner can edit
    canEditOtherProfitLoss: canEditOtherProfitLoss(profile),
    canEditProfitLoss: profile?.role === 'owner' || (
      (profile?.role === 'team' || profile?.role === 'partner') && profile.approved === true &&
      profile?.can_edit_profit_loss === true &&
      profile?.allowed_pages?.includes('/profit-loss') === true
    ),
  }
}
