// Synthetic component-test adapter; never contacts Supabase.
export function createClient() {
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      const fixture = (window as unknown as { profitLossFixture?: Record<string, unknown> }).profitLossFixture
      const writes = (window as unknown as { profitLossWrites?: Array<{ name: string; args?: Record<string, unknown> }> }).profitLossWrites
      if (name === 'get_profit_loss_data') return Promise.resolve({ data: fixture || null, error: null })
      writes?.push({ name, args })
      if (name === 'set_profit_loss_revenue_month' && fixture && args) {
        const revenue = fixture.revenue as Array<Record<string, unknown>>
        const row = revenue.find(item => item.payment_id === args.p_payment_id)
        if (row) {
          row.reporting_month = String(args.p_reporting_month).slice(0, 7)
          row.has_persisted_assignment = true
        }
      }
      return Promise.resolve({ data: null, error: null })
    },
    from(table: string) {
    const data = (window as unknown as { salesFixture: Record<string, unknown[]> }).salesFixture[table] || []
    let result: unknown = data
    let patch: Record<string, unknown> | null = null
    const query = { select: () => query,
      eq: (key: string, value: unknown) => { result = data.filter(row => (row as Record<string, unknown>)[key] === value); if (patch) (result as Record<string, unknown>[]).forEach(row => Object.assign(row, patch)); return query },
      single: () => { result = (result as unknown[])[0]; return query },
      update: (value: Record<string, unknown>) => { patch = value; return query },
      insert: (value: Record<string, unknown> | Record<string, unknown>[]) => { const added = (Array.isArray(value) ? value : [value]).map(row => ({ ...row, id: crypto.randomUUID() })); data.push(...added); result = added; return query },
      delete: () => query, order: () => query, neq: () => query,
      then: (resolve: (value: { data: unknown }) => unknown) => Promise.resolve({ data: result }).then(resolve) }
    return query
    },
  }
}
