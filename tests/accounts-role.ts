export function useRole() {
  const accountsOwner = Boolean((window as unknown as { accountsCanEdit?: boolean }).accountsCanEdit)
  return {
    canEdit: accountsOwner,
    isOwner: accountsOwner || Boolean((window as unknown as { profitLossOwner?: boolean }).profitLossOwner),
  }
}
