import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--accent)] text-white shadow-[var(--shadow-sm)] hover:opacity-90',
        secondary:
          'border-transparent bg-[var(--muted)] text-[var(--muted-foreground)] hover:opacity-90',
        destructive:
          'border-transparent bg-[var(--danger)] text-white shadow-[var(--shadow-sm)] hover:opacity-90',
        outline: 'text-[var(--foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
