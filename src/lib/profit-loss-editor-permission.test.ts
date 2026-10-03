import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20261003094000_profit_loss_editor_permission.sql'),
  'utf8',
)

describe('P&L editor permission migration', () => {
  it('requires approval, explicit P&L page access and the editor grant', () => {
    expect(migration).toContain('p.approved = true')
    expect(migration).toContain('p.can_edit_profit_loss = true')
    expect(migration).toContain("'/profit-loss' = ANY")
  })

  it('prevents non-owners from granting the permission to themselves', () => {
    expect(migration).toContain('NEW.can_edit_profit_loss IS DISTINCT FROM OLD.can_edit_profit_loss')
    expect(migration).toContain("RAISE EXCEPTION 'Only the owner can change access fields'")
  })

  it('grants only the approved Lee See Ley profile requested by the owner', () => {
    expect(migration).toContain("lower(email) = 'seeleylee91@gmail.com'")
    expect(migration).toContain('AND approved = true')
    expect(migration).toContain('SET can_edit_profit_loss = true')
  })
})
