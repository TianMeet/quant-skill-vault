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
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <SkillForm variant="industrial" />
      </div>
      <div className="w-[400px] shrink-0">
        <ConsolePanel />
      </div>
    </div>
  )
}
