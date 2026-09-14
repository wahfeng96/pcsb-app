// Synthetic component-test adapter; never contacts Supabase.
export function createClient() {
  return { from(table: string) {
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
  } }
}
