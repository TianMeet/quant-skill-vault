import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent)] text-white shadow-[var(--shadow-sm)] hover:opacity-90',
        destructive:
          'bg-[var(--danger)] text-white shadow-[var(--shadow-sm)] hover:opacity-90',
        outline:
          'border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)] hover:bg-[var(--muted)]',
        secondary:
          'bg-[var(--muted)] text-[var(--foreground)] shadow-[var(--shadow-sm)] hover:opacity-90',
        ghost: 'hover:bg-[var(--muted)] hover:text-[var(--foreground)]',
        link: 'text-[var(--accent)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  throttleMs?: number
  debounceMs?: number
  preventWhilePending?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      throttleMs = 420,
      debounceMs = 80,
      preventWhilePending = true,
      onClick,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    const lastTriggerAtRef = React.useRef(0)
    const pendingRef = React.useRef(false)
    const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    React.useEffect(
      () => () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
        }
      },
      []
    )

    const handleClick = React.useCallback<React.MouseEventHandler<HTMLButtonElement>>(
      (event) => {
        if (!onClick || props.disabled) return

        if (preventWhilePending && pendingRef.current) return

        const trigger = () => {
          const now = Date.now()
          if (throttleMs > 0 && now - lastTriggerAtRef.current < throttleMs) return
          lastTriggerAtRef.current = now

          const maybePromise = onClick(event) as unknown
          if (!maybePromise || typeof (maybePromise as { then?: unknown }).then !== 'function') return

          pendingRef.current = true
          void Promise.resolve(maybePromise)
            .catch(() => undefined)
            .finally(() => {
              pendingRef.current = false
            })
        }

        if (debounceMs > 0) {
          if (typeof (event as unknown as { persist?: () => void }).persist === 'function') {
            ;(event as unknown as { persist: () => void }).persist()
          }
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = setTimeout(trigger, debounceMs)
          return
        }

        trigger()
      },
      [onClick, props.disabled, preventWhilePending, throttleMs, debounceMs]
    )

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
