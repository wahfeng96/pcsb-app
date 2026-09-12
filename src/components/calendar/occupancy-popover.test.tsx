// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { OccupancyPopover } from './occupancy-popover'

const props = {
  dateLabel: '12 Sep 2026',
  screenName: 'Likas Screen',
  occupied: 1.5,
  maxSlots: 10,
  occupants: [
    { id: 'one', name: '<img src=x onerror=alert(1)>', spotSize: 1 },
    { id: 'two', name: 'Beta & Co', spotSize: 0.5 },
  ],
}

afterEach(cleanup)

describe('OccupancyPopover', () => {
  it('does not render a trigger for an empty date', () => {
    render(<OccupancyPopover {...props} occupied={0} occupants={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens on desktop hover and safely renders multiple occupant names and amounts', async () => {
    render(<OccupancyPopover {...props} />)
    const trigger = screen.getByRole('button', { name: /show occupants/i })
    fireEvent.mouseEnter(trigger)

    expect(await screen.findByText('Occupants · 12 Sep 2026')).toBeVisible()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('Beta & Co')).toBeVisible()
    expect(screen.getByText('1 slot')).toBeVisible()
    expect(screen.getByText('0.5 slots')).toBeVisible()
  })

  it('opens from keyboard focus and dismisses with Escape', async () => {
    const user = userEvent.setup()
    render(<OccupancyPopover {...props} />)
    await user.tab()
    expect(await screen.findByText('Occupants · 12 Sep 2026')).toBeVisible()
    expect(screen.getByRole('button', { name: /show occupants/i })).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Occupants · 12 Sep 2026')).not.toBeInTheDocument())
  })

  it('toggles on touch-style tap and dismisses on outside press', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <OccupancyPopover {...props} />
        <button type="button">Outside</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: /show occupants/i })
    await user.click(trigger)
    expect(await screen.findByText('Occupants · 12 Sep 2026')).toBeVisible()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))
    await waitFor(() => expect(screen.queryByText('Occupants · 12 Sep 2026')).not.toBeInTheDocument())

    await user.click(trigger)
    expect(await screen.findByText('Occupants · 12 Sep 2026')).toBeVisible()
    await user.click(trigger)
    await waitFor(() => expect(screen.queryByText('Occupants · 12 Sep 2026')).not.toBeInTheDocument())
  })
})
