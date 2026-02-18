'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { SkillForm } from '@/components/skill-form'
import type { SkillData } from '@/lib/types'
import { toUserFriendlyErrorMessage } from '@/lib/friendly-validation'
import { guardedFetch } from '@/lib/guarded-fetch'

export default function EditSkillPage() {
  const params = useParams()
  const [skill, setSkill] = useState<(SkillData & { tags: string[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    async function load() {
      setLoadError('')
      try {
        const res = await guardedFetch(`/api/skills/${params.id}`)
        if (res.ok) {
          const data = await res.json()
          setSkill(data)
        } else {
          const data = await res.json().catch(() => ({}))
          setSkill(null)
          setLoadError(toUserFriendlyErrorMessage(data.error || `加载失败（${res.status}）`))
        }
      } catch {
        setSkill(null)
        setLoadError('加载 Skill 失败，请稍后重试。')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.id])

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-8"><div className="skeleton h-8 w-48 mb-4" /><div className="skeleton h-4 w-96" /></div>
  if (!skill) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 text-sm" style={{ color: 'var(--danger)' }}>
        {loadError || 'Skill not found'}
      </div>
    )
  }

  return <SkillForm initialData={skill} skillId={Number(params.id)} />
}
