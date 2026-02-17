import * as React from 'react'

import { cn } from '@/lib/utils'

export type FieldVisualState = 'default' | 'error' | 'success' | 'ai'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  state?: FieldVisualState
  density?: 'compact' | 'default'
}

const stateClassMap: Record<FieldVisualState, string> = {
  default:
    'border-[var(--input-border)] hover:border-[var(--input-border-hover)] focus-visible:border-[var(--input-ring)] focus-visible:ring-[var(--input-ring)]',
  error:
    'border-[var(--input-error)] bg-[var(--danger-light)] hover:border-[var(--input-error)] focus-visible:border-[var(--input-error)] focus-visible:ring-[var(--input-error)]',
  success:
    'border-[var(--input-success)] bg-[var(--success-light)] hover:border-[var(--input-success)] focus-visible:border-[var(--input-success)] focus-visible:ring-[var(--input-success)]',
  ai:
    'border-[var(--input-ai)] bg-[var(--accent-light)] hover:border-[var(--input-ai)] focus-visible:border-[var(--input-ai)] focus-visible:ring-[var(--input-ai)]',
}

const densityClassMap = {
  compact: 'h-9 px-3 py-1.5 text-sm',
  default: 'h-10 px-3 py-2 text-sm',
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, state = 'default', density = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-md border bg-[var(--input-bg)] text-[var(--foreground)] shadow-[var(--shadow-sm)] transition-colors placeholder:text-[var(--input-placeholder)] hover:bg-[var(--input-bg-hover)] focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:border-[var(--input-disabled)] disabled:bg-[var(--muted)] disabled:opacity-70',
          densityClassMap[density],
          stateClassMap[state],
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input }
