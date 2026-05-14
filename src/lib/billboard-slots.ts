import type { Billboard } from '@/types/database'

export const DIGITAL_SCREEN_MAX_SLOTS = 10
export const STATIC_MAX_SLOTS = 1

export function isStaticBillboard(billboard: Pick<Billboard, 'name' | 'location'> | null | undefined): boolean {
  if (!billboard) return false
  return `${billboard.name || ''} ${billboard.location || ''}`.toLowerCase().includes('static')
}

export function getBillboardMaxSlots(billboard: Pick<Billboard, 'name' | 'location' | 'max_slots'> | null | undefined): number {
  if (isStaticBillboard(billboard)) return STATIC_MAX_SLOTS
  return DIGITAL_SCREEN_MAX_SLOTS
}
