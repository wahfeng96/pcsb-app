// Synthetic component-test adapter; never contacts Supabase.
export function createClient() {
  return {
    rpc(name: string, args?: Record<string, unknown>) {
      const fixture = (window as unknown as { profitLossFixture?: Record<string, unknown> }).profitLossFixture
      const writes = (window as unknown as { profitLossWrites?: Array<{ name: string; args?: Record<string, unknown> }> }).profitLossWrites
      if (name === 'get_profit_loss_data') return Promise.resolve({ data: fixture || null, error: null })
      writes?.push({ name, args })
      if (name === 'assign_profit_loss_revenue' && fixture && args) {
        const revenue = fixture.revenue as Array<Record<string, unknown>>
        const row = revenue.find(item => item.booking_id === args.p_booking_id && item.billing_month === args.p_billing_month)
        if (row) {
          row.reporting_month = String(args.p_reporting_month).slice(0, 7)
          row.has_persisted_assignment = true
        }
        return Promise.resolve({ data: row?.payment_id || 'materialized-payment', error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
    from(table: string) {
    if (table === 'other_profit_loss_entries') {
      const state = window as unknown as { otherEntries: Array<Record<string, unknown>>; otherError?: string; otherWrites: Array<Record<string, unknown>> }
      let result = [...state.otherEntries]
      let operation = 'read'
      let payload: Record<string, unknown> | Record<string, unknown>[] = {}
      let single = false
      let targetId = ''
      const query = {
        select: () => query,
        gte: (key: string, value: string) => { result = result.filter(row => String(row[key]) >= value); return query },
        lte: (key: string, value: string) => { result = result.filter(row => String(row[key]) <= value); return query },
        order: () => query,
        range: (from: number, to: number) => { result = result.slice(from, to + 1); return query },
        eq: (key: string, value: string) => { targetId = value; result = result.filter(row => row[key] === value); return query },
        update: (value: Record<string, unknown>) => { operation = 'update'; payload = value; return query },
        insert: (value: Record<string, unknown> | Record<string, unknown>[]) => { operation = 'insert'; payload = value; return query },
        delete: () => { operation = 'delete'; return query },
        single: () => { single = true; return query },
        then: (resolve: (value: unknown) => unknown) => {
          if (state.otherError) return Promise.resolve({ data: null, error: { message: state.otherError } }).then(resolve)
          if (operation === 'read') return Promise.resolve({ data: result, error: null }).then(resolve)
          state.otherWrites.push({ operation, payload, id: targetId })
          if (operation === 'insert') { const rows = (Array.isArray(payload) ? payload : [payload]).map(value => ({ ...value, id: crypto.randomUUID() })); state.otherEntries.push(...rows); return Promise.resolve({ data: single ? rows[0] : rows, error: null }).then(resolve) }
          const row = state.otherEntries.find(entry => entry.id === targetId)
          if (operation === 'update' && row) Object.assign(row, payload)
          if (operation === 'delete') state.otherEntries = state.otherEntries.filter(entry => entry.id !== targetId)
          return Promise.resolve({ data: row || null, error: null }).then(resolve)
        },
      }
      return query
    }
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
