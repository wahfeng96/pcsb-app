export const APP_PAGES = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/clients', label: 'Clients' },
  { href: '/billboards', label: 'Billboards' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/sales-summary', label: 'Sales Summary' },
  { href: '/profit-sharing', label: 'Profit Sharing' },
  { href: '/commission', label: 'Commission' },
  { href: '/users', label: 'Users' },
  { href: '/remarks', label: 'Remarks' },
] as const

export type AppPagePath = typeof APP_PAGES[number]['href']

export function canAccessPage(role: string | undefined, allowedPages: string[] | null | undefined, href: string) {
  if (role === 'owner') return true
  // Null/undefined preserves full page access for existing users until customised.
  if (allowedPages == null) return true
  return allowedPages.includes(href)
}

export function firstAllowedPage(role: string | undefined, allowedPages: string[] | null | undefined) {
  return APP_PAGES.find(page => canAccessPage(role, allowedPages, page.href))?.href || '/no-access'
}
