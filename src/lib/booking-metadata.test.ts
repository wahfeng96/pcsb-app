import { describe, it, expect } from 'vitest'
import { bookingMetadata, metadataOptions, matchesMetadata } from './booking-metadata'
describe('optional booking metadata', () => {
  it('supports legacy, blank, create/edit and trimming without changing brand', () => {
    expect(bookingMetadata({})).toEqual({ campaign_name: null, booking_number: null })
    expect(bookingMetadata({ campaign_name: '  ', booking_number: '' })).toEqual(bookingMetadata({}))
    const saved = bookingMetadata({ brand_name: 'Original', campaign_name: ' Launch ', booking_number: ' OD123 ' })
    expect(bookingMetadata(JSON.parse(JSON.stringify(saved)))).toEqual({ campaign_name: 'Launch', booking_number: 'OD123' })
  })
  it('validates lengths, types and controls without HTML interpretation', () => {
    expect(() => bookingMetadata({ campaign_name: 'x'.repeat(201) })).toThrow()
    expect(() => bookingMetadata({ booking_number: 'x'.repeat(101) })).toThrow()
    expect(() => bookingMetadata({ campaign_name: 'a\u0000b' })).toThrow()
    expect(() => bookingMetadata({ campaign_name: 5 as never })).toThrow()
    expect(bookingMetadata({ campaign_name: '<script>alert(1)</script>' }).campaign_name).toContain('<script>')
  })
  it('scopes options to supplied rows and brand and combines search', () => {
    const rows = [{ brand_name: 'A', campaign_name: 'One' }, { brand_name: 'B', campaign_name: 'Two' }, { brand_name: 'A' }]
    expect(metadataOptions(rows, 'campaign_name', 'A')).toEqual(['One'])
    expect(metadataOptions(rows.slice(0,1), 'brand_name')).toEqual(['A'])
    expect(rows.filter(r => matchesMetadata(r, 'A', 'One', ' a '))).toHaveLength(1)
    expect(rows.filter(r => matchesMetadata(r, 'A', 'Two'))).toHaveLength(0)
    expect(rows.filter(r => matchesMetadata(r, '', ''))).toHaveLength(3)
  })
})
