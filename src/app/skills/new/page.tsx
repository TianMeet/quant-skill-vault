'use client'

import { useEffect } from 'react'
import { SkillForm } from '@/components/skill-form'
import { ConsolePanel } from '@/components/console-panel'
import { useSkillStore } from '@/lib/stores/skill-store'

export default function NewSkillPage() {
  const reset = useSkillStore((s) => s.reset)

  useEffect(() => {
    reset()
    return () => { reset() }
  }, [reset])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden pr-3">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <SkillForm variant="industrial" />
      </div>
      <div className="relative mx-2 w-3 shrink-0">
        <div
          className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2"
          style={{
            background:
              'linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--border) 92%, transparent) 20%, color-mix(in srgb, var(--border) 92%, transparent) 80%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-10 left-1/2 w-3 -translate-x-1/2 rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            filter: 'blur(8px)',
          }}
        />
      </div>
      <div className="w-[400px] shrink-0 bg-[var(--background)]">
        <ConsolePanel />
      </div>
    </div>
  )
}
