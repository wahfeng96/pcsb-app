export const PROFIT_LOSS_PATH = '/profit-loss'
export const LEGACY_PAID_REVENUE_MONTH = '2026-10'

export type ProfitLossBillboard = { id: string; name: string; location: string }
export type PaidRevenue = {
  payment_id: string; booking_id: string; billing_month: string; reporting_month: string
  has_persisted_assignment: boolean; invoice_number: string | null; client_id: string
  client_name: string; brand_name: string | null; billboard_id: string; billboard_name: string
  billboard_location: string; amount: number
}
export type CostCategory = { id: string; name: string; is_active: boolean }
export type CostAllocation = { id: string; billboard_id: string | null; billboard_name: string; amount: number }
export type ProfitLossCost = {
  id: string; cost_date: string; category_id: string; category_name: string; description: string
  supplier_payee: string; amount: number; remarks: string | null; allocations: CostAllocation[]
}
export type ProfitLossData = {
  billboards: ProfitLossBillboard[]; revenue: PaidRevenue[]; categories: CostCategory[]; costs: ProfitLossCost[]; locks: string[]
}
export type ProfitLossTotals = { revenue: number; cost: number; net: number; margin: number | null }

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

export function revenueForPeriod(revenue: PaidRevenue[], year: number, month: string, billboardId: string): PaidRevenue[] {
  return revenue.filter(item => {
    const [itemYear, itemMonth] = item.reporting_month.split('-')
    return Number(itemYear) === year && (month === 'all' || itemMonth === month) && (billboardId === 'all' || item.billboard_id === billboardId)
  })
}

export function costsForPeriod(costs: ProfitLossCost[], year: number, month: string, billboardId: string): Array<ProfitLossCost & { reporting_amount: number }> {
  return costs.flatMap(cost => {
    const [costYear, costMonth] = cost.cost_date.split('-')
    if (Number(costYear) !== year || (month !== 'all' && costMonth !== month)) return []
    if (billboardId === 'all') return [{ ...cost, reporting_amount: Number(cost.amount) }]
    const reportingAmount = cost.allocations.filter(allocation => allocation.billboard_id === billboardId).reduce((sum, allocation) => sum + Number(allocation.amount), 0)
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
