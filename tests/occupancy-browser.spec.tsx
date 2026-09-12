import type { ReactElement } from 'react'
import type { MountResult } from '@playwright/experimental-ct-react'
import { expect, test } from '@playwright/experimental-ct-react'
import { OccupancyPopover } from '../src/components/calendar/occupancy-popover'

const occupants = [
  { id: 'alpha', name: 'Alpha Campaign', spotSize: 1 },
  { id: 'beta', name: 'Beta & Co', spotSize: 0.5 },
]

async function mountFixture(mount: (component: ReactElement) => Promise<MountResult>) {
  return mount(
    <div style={{ position: 'relative', width: 92, height: 62, margin: 12, background: '#dcfce7', border: '1px solid #86efac' }}>
      <span>12</span>
      <OccupancyPopover dateLabel="12 Sep 2026" screenName="Likas Screen" occupied={1.5} maxSlots={10} occupants={occupants} />
    </div>,
  )
}

test('desktop hover and keyboard dismissal', async ({ mount, page }) => {
  await mountFixture(mount)
  const trigger = page.getByRole('button', { name: /show occupants/i })
  await trigger.hover()
  await expect(page.getByRole('tooltip')).toContainText('Alpha Campaign')
  await expect(page.getByRole('tooltip')).toContainText('Beta & Co')
  await expect(page.getByRole('tooltip')).toContainText('0.5 slots')
  await page.screenshot({ path: 'screenshots/occupancy-desktop-hover.png', fullPage: true })
  await trigger.focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
})

test('mobile tap toggles and outside tap dismisses', async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountFixture(mount)
  const trigger = page.getByRole('button', { name: /show occupants/i })
  await trigger.tap()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.screenshot({ path: 'screenshots/occupancy-mobile-tap.png', fullPage: true })
  await page.mouse.click(350, 700)
  await expect(page.getByRole('tooltip')).toBeHidden()
})
