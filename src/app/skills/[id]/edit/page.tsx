'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { SkillForm } from '@/components/skill-form'
import type { SkillData } from '@/lib/types'

export default function EditSkillPage() {
  const params = useParams()
  const [skill, setSkill] = useState<(SkillData & { tags: string[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/skills/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setSkill(data)
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-8"><div className="skeleton h-8 w-48 mb-4" /><div className="skeleton h-4 w-96" /></div>
  if (!skill) return <div className="mx-auto max-w-4xl px-6 py-8 text-sm" style={{ color: 'var(--danger)' }}>Skill not found</div>

  return <SkillForm initialData={skill} skillId={Number(params.id)} />
}
