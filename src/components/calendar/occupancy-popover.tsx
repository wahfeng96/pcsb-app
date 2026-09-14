'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatSlotAmount, type OccupancyOccupant } from '@/lib/calendar-occupancy'

interface OccupancyPopoverProps {
  dateLabel: string
  screenName: string
  occupied: number
  maxSlots: number
  occupants: OccupancyOccupant[]
}

export function OccupancyPopover({ dateLabel, screenName, occupied, maxSlots, occupants }: OccupancyPopoverProps) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popupId = useId()

  function cancelScheduledClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    setOpen(true)
  }

  function scheduleClose() {
    if (pinned) return
    closeTimerRef.current = setTimeout(() => setOpen(false), 120)
  }

  const displayOccupied = Number.isInteger(occupied) ? occupied : occupied.toFixed(1)
  const title = `${dateLabel}: ${displayOccupied} of ${maxSlots} slots occupied on ${screenName}`

  useLayoutEffect(() => {
    if (!open) return

    function updatePosition() {
      const trigger = triggerRef.current
      const popup = popupRef.current
      if (!trigger || !popup) return
      const triggerRect = trigger.getBoundingClientRect()
      const popupRect = popup.getBoundingClientRect()
      const padding = 8
      const preferredTop = triggerRect.top - popupRect.height - 6
      const top = preferredTop >= padding
        ? preferredTop
        : Math.min(triggerRect.bottom + 6, window.innerHeight - popupRect.height - padding)
      const left = Math.min(
        Math.max(triggerRect.right - popupRect.width, padding),
        window.innerWidth - popupRect.width - padding,
      )
      setPosition({ left: Math.max(padding, left), top: Math.max(padding, top) })
    }

    function dismissOnOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false)
        setPinned(false)
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setPinned(false)
        triggerRef.current?.focus()
      }
    }

    updatePosition()
    const frame = window.requestAnimationFrame(updatePosition)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    if (popupRef.current) resizeObserver?.observe(popupRef.current)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', dismissOnOutside)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', dismissOnOutside)
      document.removeEventListener('keydown', dismissOnEscape)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [open])

  if (occupants.length === 0) return null

  const popup = open ? (
    <div
      ref={popupRef}
      id={popupId}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
      className="fixed z-[100] max-h-[min(18rem,calc(100vh-1rem))] w-max max-w-[min(18rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-left text-white shadow-xl"
      onMouseEnter={cancelScheduledClose}
      onMouseLeave={scheduleClose}
    >
      <p className="text-xs font-semibold">Occupants · {dateLabel}</p>
      <p className="mt-0.5 text-[10px] text-gray-300">{screenName} · {formatSlotAmount(occupied)} occupied</p>
      <ul className="mt-2 space-y-1.5" aria-label="Booking occupants">
        {occupants.map(occupant => (
          <li key={occupant.id} className="flex min-w-0 items-start justify-between gap-4 text-xs">
            <span className="min-w-0 [overflow-wrap:anywhere] font-medium">{occupant.name}</span>
            <span className="shrink-0 text-gray-300">{formatSlotAmount(occupant.spotSize)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[9px] text-gray-400">Press Escape or tap outside to close.</p>
    </div>
  ) : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${title}. Show occupants`}
        aria-describedby={open ? popupId : undefined}
        aria-expanded={open}
        className="absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-semibold leading-tight underline decoration-dotted underline-offset-2 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1"
        onMouseEnter={cancelScheduledClose}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        onBlur={event => {
          if (!popupRef.current?.contains(event.relatedTarget as Node) && !pinned) setOpen(false)
        }}
        onClick={() => {
          const nextOpen = !(open && pinned)
          setPinned(nextOpen)
          setOpen(nextOpen)
        }}
      >
        {displayOccupied}/{maxSlots}
      </button>
      {typeof document !== 'undefined' && popup ? createPortal(popup, document.body) : null}
    </>
  )
}
