export function useRole() {
  const accountsOwner = Boolean((window as unknown as { accountsCanEdit?: boolean }).accountsCanEdit)
  const profitLossEditor = Boolean((window as unknown as { profitLossOwner?: boolean }).profitLossOwner)
  return {
    canEdit: accountsOwner,
    isOwner: accountsOwner || profitLossEditor,
    canEditProfitLoss: accountsOwner || profitLossEditor,
  }
}
