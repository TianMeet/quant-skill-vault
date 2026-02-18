'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONE_BASES = ['--accent', '--success', '--warning', '--danger', '--input-ai']

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0
  }
  return h
}

function toneStyle(seed: string) {
  const base = TONE_BASES[hashSeed(seed) % TONE_BASES.length] || '--accent'
  return {
    background: `color-mix(in srgb, var(${base}) 14%, var(--card))`,
    borderColor: `color-mix(in srgb, var(${base}) 36%, var(--border))`,
    color: `color-mix(in srgb, var(${base}) 84%, var(--foreground))`,
  }
}

interface TagPillProps {
  label: string
  title?: string
  className?: string
  trailing?: ReactNode
}

export function TagPill({ label, title, className, trailing }: TagPillProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium leading-none shadow-[var(--shadow-sm)]',
        className
      )}
      style={toneStyle(label)}
    >
      <span className="truncate">{label}</span>
      {trailing}
    </span>
  )
}

export function TagCountPill({ label, className, title }: { label: string; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium leading-none',
        className
      )}
      style={{
        borderColor: 'var(--border)',
        background: 'var(--muted)',
        color: 'var(--muted-foreground)',
      }}
    >
      {label}
    </span>
  )
}
