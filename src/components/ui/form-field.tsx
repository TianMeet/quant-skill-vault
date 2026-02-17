import * as React from 'react'

import type { FieldVisualState } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FieldCount {
  current: number
  recommended?: number
  max?: number
}

interface FormFieldProps {
  label: string
  required?: boolean
  hint?: string
  error?: string
  count?: FieldCount
  status?: FieldVisualState
  className?: string
  labelClassName?: string
  children: React.ReactNode
}

function countLabel(count: FieldCount): string {
  if (typeof count.max === 'number') return `${count.current}/${count.max}`
  if (typeof count.recommended === 'number') return `${count.current}/${count.recommended} 建议`
  return String(count.current)
}

export function FormField({
  label,
  required = false,
  hint,
  error,
  count,
  status = 'default',
  className,
  labelClassName,
  children,
}: FormFieldProps) {
  const metaTone = error
    ? 'text-[var(--danger)]'
    : status === 'success'
      ? 'text-[var(--success)]'
      : 'text-[var(--muted-foreground)]'

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className={cn('text-sm font-medium', labelClassName)}>
          {label}
          {required ? <span className="ml-1 text-[var(--danger)]">*</span> : null}
        </Label>
        {count ? <span className={cn('text-xs font-mono', metaTone)}>{countLabel(count)}</span> : null}
      </div>

      {children}

      {(hint || error) && (
        <p className={cn('text-xs', error ? 'text-[var(--danger)]' : metaTone)}>{error || hint}</p>
      )}
    </div>
  )
}
