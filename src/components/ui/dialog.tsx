'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Separate trigger from other children - trigger always renders, rest only when open
  const childArray = React.Children.toArray(children)
  const trigger = childArray.find(
    (child) => React.isValidElement(child) && (child as React.ReactElement<{ 'data-dialog-trigger'?: boolean }>).type === DialogTrigger
  )
  const rest = childArray.filter(
    (child) => !(React.isValidElement(child) && (child as React.ReactElement<{ 'data-dialog-trigger'?: boolean }>).type === DialogTrigger)
  )

  return (
    <>
      {trigger && React.isValidElement(trigger) 
        ? React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, { onClick: () => onOpenChange?.(true) })
        : null
      }
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/80" onClick={() => onOpenChange?.(false)} />
          {rest}
        </div>
      )}
    </>
  )
}

function DialogTrigger({ asChild, children, onClick, ...props }: { asChild?: boolean; children: React.ReactElement; onClick?: () => void; className?: string }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, { onClick })
  }
  return <button onClick={onClick} {...props}>{children}</button>
}

function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg rounded-lg max-h-[90vh] overflow-y-auto", className)} {...props}>
      {children}
    </div>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle }
