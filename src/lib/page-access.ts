export const APP_PAGES = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/clients', label: 'Clients' },
  { href: '/billboards', label: 'Billboards' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/sales-summary', label: 'Sales Summary' },
  { href: '/profit-loss', label: 'P&L' },
  { href: '/profit-sharing', label: 'Profit Sharing' },
  { href: '/commission', label: 'Commission' },
  { href: '/users', label: 'Users' },
  { href: '/remarks', label: 'Remarks' },
] as const

export type AppPagePath = typeof APP_PAGES[number]['href']

// P&L is intentionally excluded: every non-owner needs an explicit owner grant.
export const DEFAULT_ALLOWED_PAGES = APP_PAGES.filter(page => page.href !== '/profit-loss').map(page => page.href)

export function canAccessPage(role: string | undefined, allowedPages: string[] | null | undefined, href: string) {
  if (role === 'owner') return true
  if (href === '/profit-loss') return Array.isArray(allowedPages) && allowedPages.includes(href)
  // Null/undefined preserves full page access for existing users until customised.
  if (allowedPages == null) return true
  return allowedPages.includes(href)
}

export function firstAllowedPage(role: string | undefined, allowedPages: string[] | null | undefined) {
  return APP_PAGES.find(page => canAccessPage(role, allowedPages, page.href))?.href || '/no-access'
}
