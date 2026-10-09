export function useRole() {
  const accountsOwner = Boolean((window as unknown as { accountsCanEdit?: boolean }).accountsCanEdit)
  const profitLossEditor = Boolean((window as unknown as { profitLossOwner?: boolean }).profitLossOwner)
  return {
    loading: false,
    profile: { role: 'team', approved: true, allowed_pages: (window as unknown as { otherView?: boolean }).otherView === false ? [] : ['/other-profit-loss'] },
    canEdit: accountsOwner,
    isOwner: accountsOwner || profitLossEditor,
    canEditProfitLoss: accountsOwner || profitLossEditor,
  }
}
