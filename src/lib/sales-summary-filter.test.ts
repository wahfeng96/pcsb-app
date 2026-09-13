import { describe, expect, it } from 'vitest'
import { filterSalesBookings, salespersonOptions } from './sales-summary-filter'
const records = [
  { id: '1', billboard_id: 'a', sales_person: 'Alex' },
  { id: '2', billboard_id: 'b', sales_person: 'Alex' },
  { id: '3', billboard_id: 'a', sales_person: 'alex' },
  { id: '4', billboard_id: 'a', sales_person: null },
  { id: '5', billboard_id: 'b', sales_person: '' },
  { id: '6', billboard_id: 'a', sales_person: '  ' },
  { id: '7', billboard_id: 'a', sales_person: 'all' },
]
describe('permission-scoped sales filters', () => {
  it('All retains assigned and unassigned records', () => expect(filterSalesBookings(records, 'all', 'all')).toEqual(records))
  it('matches exact names and combines location', () => {
    expect(filterSalesBookings(records, 'all', 'person:Alex').map(b => b.id)).toEqual(['1', '2'])
    expect(filterSalesBookings(records, 'b', 'person:Alex').map(b => b.id)).toEqual(['2'])
  })
  it('groups null, empty and whitespace as unassigned', () => expect(filterSalesBookings(records, 'all', 'unassigned').map(b => b.id)).toEqual(['4', '5', '6']))
  it('does not collide with reserved labels', () => expect(filterSalesBookings(records, 'all', 'person:all').map(b => b.id)).toEqual(['7']))
  it('uses only accessible input for options and results; unknown selection fails closed', () => {
    const accessible = records.slice(2)
    expect(salespersonOptions(accessible).map(p => p.label)).not.toContain('Alex')
    expect(filterSalesBookings(accessible, 'all', 'person:Alex')).toEqual([])
    expect(salespersonOptions(records).filter(p => p.label === 'Alex')).toHaveLength(1)
  })
})
