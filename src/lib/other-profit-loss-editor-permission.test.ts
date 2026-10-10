import { describe, expect, it } from 'vitest'
import { canEditOtherProfitLoss } from './page-access'

const editor = { role: 'partner', approved: true, allowed_pages: ['/other-profit-loss'], can_edit_other_profit_loss: true }

describe('Other P&L editor authorization', () => {
  it('allows the owner and approved explicit editors', () => {
    expect(canEditOtherProfitLoss({ role: 'owner' })).toBe(true)
    expect(canEditOtherProfitLoss(editor)).toBe(true)
    expect(canEditOtherProfitLoss({ ...editor, role: 'team' })).toBe(true)
  })

  it.each([
    null, undefined, {}, { ...editor, approved: false },
    { ...editor, can_edit_other_profit_loss: false },
    { ...editor, can_edit_other_profit_loss: undefined },
    { ...editor, allowed_pages: null },
    { ...editor, allowed_pages: [] },
    { ...editor, allowed_pages: ['/profit-loss', '/accounts'] },
  ])('denies absent, unapproved, ungranted or wrong-page profiles: %j', profile => {
    expect(canEditOtherProfitLoss(profile)).toBe(false)
  })
})
