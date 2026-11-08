// Calendar access boundaries use Malaysia business time, never the browser/server locale.
export function malaysiaMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(now)
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`
}

export function isAllowedAgencyMonth(month: string, now = new Date()): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= malaysiaMonth(now)
}

export function agencyCanRequest(path: string, method = 'GET'): boolean {
  return (method === 'GET' || method === 'HEAD') && (path === '/calendar' || path === '/api/agency-calendar')
}
