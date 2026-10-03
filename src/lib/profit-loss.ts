export const PROFIT_LOSS_PATH = '/profit-loss'
export const LEGACY_PAID_REVENUE_MONTH = '2026-10'
export const UNKNOWN_REVENUE_MONTH = 'unknown'

export type ProfitLossBillboard = { id: string; name: string; location: string }
export type PaidRevenue = {
  revenue_id: string; payment_id: string | null; booking_id: string; billing_month: string; reporting_month: string
  source: 'payment' | 'settled_booking'
  has_persisted_assignment: boolean; invoice_number: string | null; client_id: string
  client_name: string; brand_name: string | null; billboard_id: string; billboard_name: string
  billboard_location: string; amount: number
}
export type CostCategory = { id: string; name: string; is_active: boolean }
export type CostAllocation = { id: string; billboard_id: string | null; billboard_name: string; amount: number }
export type ProfitLossCost = {
  id: string; cost_date: string; category_id: string; category_name: string; description: string
  supplier_payee: string; amount: number; remarks: string | null; reporting_months: string[]; allocations: CostAllocation[]
}
export type ProfitLossData = {
  billboards: ProfitLossBillboard[]; revenue: PaidRevenue[]; categories: CostCategory[]; costs: ProfitLossCost[]; locks: string[]
}
export type ProfitLossTotals = { revenue: number; cost: number; net: number; margin: number | null }
export type RevenueSearchField = 'all' | 'client' | 'brand' | 'invoice' | 'billing_month' | 'billboard'

export function mytMonthKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit' }).formatToParts(now)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  if (!year || !month) throw new Error('Unable to determine MYT month')
  return `${year}-${month}`
}

export function monthStart(monthKey: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new Error('Invalid month')
  return `${monthKey}-01`
}

export function allocationTotal(allocations: Array<Pick<CostAllocation, 'amount'>>): number {
  return allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0)
}

export function allocationsMatchTotal(total: number, allocations: Array<Pick<CostAllocation, 'amount'>>): boolean {
  return Number.isFinite(total) && total > 0 && Math.abs(allocationTotal(allocations) - total) < 0.005
}

export function profitLossYears(revenue: PaidRevenue[], costs: ProfitLossCost[], currentYear: number): number[] {
  const values = new Set<number>([currentYear])
  revenue.forEach(item => values.add(Number((item.reporting_month === UNKNOWN_REVENUE_MONTH ? item.billing_month : item.reporting_month).slice(0, 4))))
  costs.forEach(item => (item.reporting_months?.length ? item.reporting_months : [item.cost_date.slice(0, 7)]).forEach(reportingMonth => values.add(Number(reportingMonth.slice(0, 4)))))
  return [...values].filter(Number.isFinite).sort((a, b) => b - a)
}

export function revenueForPeriod(revenue: PaidRevenue[], year: number, month: string, billboardId: string): PaidRevenue[] {
  return revenue.filter(item => {
    if (month === UNKNOWN_REVENUE_MONTH) {
      return item.reporting_month === UNKNOWN_REVENUE_MONTH
        && Number(item.billing_month.slice(0, 4)) === year
        && (billboardId === 'all' || item.billboard_id === billboardId)
    }
    const [itemYear, itemMonth] = item.reporting_month.split('-')
    return item.reporting_month !== UNKNOWN_REVENUE_MONTH
      && Number(itemYear) === year
      && (month === 'all' || itemMonth === month)
      && (billboardId === 'all' || item.billboard_id === billboardId)
  })
}

export function searchRevenueForYear(
  revenue: PaidRevenue[],
  year: number,
  billboardId: string,
  query: string,
  field: RevenueSearchField,
): PaidRevenue[] {
  const search = query.trim().toLocaleLowerCase()
  if (!search) return []

  return revenue.filter(item => {
    const itemYear = Number((item.reporting_month === UNKNOWN_REVENUE_MONTH ? item.billing_month : item.reporting_month).slice(0, 4))
    if (itemYear !== year || (billboardId !== 'all' && item.billboard_id !== billboardId)) return false

    const values: Record<RevenueSearchField, string[]> = {
      all: [item.client_name, item.brand_name || '', item.invoice_number || '', item.billing_month, item.billboard_name, item.billboard_location, String(item.amount)],
      client: [item.client_name],
      brand: [item.brand_name || ''],
      invoice: [item.invoice_number || ''],
      billing_month: [item.billing_month],
      billboard: [item.billboard_name, item.billboard_location],
    }
    return values[field].some(value => value.toLocaleLowerCase().includes(search))
  })
}

export function costsForPeriod(costs: ProfitLossCost[], year: number, month: string, billboardId: string): Array<ProfitLossCost & { reporting_amount: number }> {
  return costs.flatMap(cost => {
    const reportingMonths = cost.reporting_months?.length ? cost.reporting_months : [cost.cost_date.slice(0, 7)]
    const monthsInYear = reportingMonths.filter(reportingMonth => Number(reportingMonth.slice(0, 4)) === year)
    if (monthsInYear.length === 0 || (month !== 'all' && !monthsInYear.includes(`${year}-${month}`))) return []
    const periodShare = month === 'all' ? monthsInYear.length / reportingMonths.length : 1 / reportingMonths.length
    if (billboardId === 'all') return [{ ...cost, reporting_amount: Number(cost.amount) * periodShare }]
    const reportingAmount = cost.allocations.filter(allocation => allocation.billboard_id === billboardId).reduce((sum, allocation) => sum + Number(allocation.amount), 0) * periodShare
    return reportingAmount > 0 ? [{ ...cost, reporting_amount: reportingAmount }] : []
  })
}

export function calculateProfitLoss(revenue: PaidRevenue[], costs: Array<{ reporting_amount: number }>): ProfitLossTotals {
  const paidRevenue = revenue.reduce((sum, item) => sum + Number(item.amount), 0)
  const totalCost = costs.reduce((sum, item) => sum + Number(item.reporting_amount), 0)
  const net = paidRevenue - totalCost
  return { revenue: paidRevenue, cost: totalCost, net, margin: paidRevenue === 0 ? null : (net / paidRevenue) * 100 }
}

export function canAccessProfitLoss(role: string | undefined, approved: boolean | undefined, allowedPages: string[] | null | undefined): boolean {
  if (role === 'owner') return true
  return approved === true && Array.isArray(allowedPages) && allowedPages.includes(PROFIT_LOSS_PATH)
}
