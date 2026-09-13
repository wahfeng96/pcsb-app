// Synthetic component-test adapter; never contacts Supabase.
export function createClient() {
  return { from(table: string) {
    const data = (window as unknown as { salesFixture: Record<string, unknown[]> }).salesFixture[table] || []
    const query = { select: () => query, order: () => query, neq: () => query,
      then: (resolve: (value: { data: unknown[] }) => unknown) => Promise.resolve({ data }).then(resolve) }
    return query
  } }
}
