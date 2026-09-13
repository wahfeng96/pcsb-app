export function useRole() {
  return { canEdit: Boolean((window as unknown as { accountsCanEdit?: boolean }).accountsCanEdit) }
}
