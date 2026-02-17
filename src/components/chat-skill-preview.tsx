'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react'
import type { ToolCallData } from '@/lib/chat/types'
import { Button } from '@/components/ui/button'
import { toUserFriendlyErrorMessage } from '@/lib/friendly-validation'

interface Props {
  toolCall: ToolCallData
  onConfirm: () => Promise<{ id: number } | null>
  onEdit?: () => void
  created?: { success: boolean; skillId?: number }
}

export function ChatSkillPreview({ toolCall, onConfirm, onEdit, created }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const router = useRouter()
  const skill = toolCall.input

  const handleCreate = async () => {
    setCreateError('')
    setCreating(true)
    try {
      const result = await onConfirm()
      if (result?.id) {
        router.push(`/skills/${result.id}`)
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to create skill'
      setCreateError(toUserFriendlyErrorMessage(raw))
    } finally {
      setCreating(false)
    }
  }

  const handleEditInForm = () => {
    sessionStorage.setItem('skill_draft', JSON.stringify(skill))
    onEdit?.()
    router.push('/skills/new?from=chat')
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{skill.title}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {skill.steps.length} 步骤 · {skill.triggers.length} 触发词 · {skill.tests.length} 测试
            </p>
          </div>
          <Button
            onClick={() => setExpanded(!expanded)}
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md"
            aria-label={expanded ? '收起详情' : '展开详情'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="px-4 py-2.5">
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {skill.summary}
        </p>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3 text-xs">
          {/* Steps */}
          <div>
            <p className="font-medium mb-1">步骤</p>
            <ol className="list-decimal list-inside space-y-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {skill.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          {/* Triggers */}
          <div>
            <p className="font-medium mb-1">触发词</p>
            <div className="flex flex-wrap gap-1.5">
              {skill.triggers.map((t, i) => (
                <span
                  key={i}
                  className="badge"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Guardrails */}
          <div>
            <p className="font-medium mb-1">安全护栏</p>
            <p style={{ color: 'var(--muted-foreground)' }}>
              升级策略: {skill.guardrails.escalation} · 停止条件: {skill.guardrails.stop_conditions.join(', ')}
            </p>
          </div>

          {/* Tests */}
          <div>
            <p className="font-medium mb-1">测试用例</p>
            {skill.tests.map((t, i) => (
              <div key={i} className="rounded-md p-2 mb-1" style={{ background: 'var(--muted)' }}>
                <p className="font-medium">{t.name}</p>
                <p style={{ color: 'var(--muted-foreground)' }}>输入: {t.input}</p>
                <p style={{ color: 'var(--muted-foreground)' }}>期望: {t.expected_output}</p>
              </div>
            ))}
          </div>

          {/* Tags */}
          {skill.tags && skill.tags.length > 0 && (
            <div>
              <p className="font-medium mb-1">标签</p>
              <div className="flex flex-wrap gap-1.5">
                {skill.tags.map((tag, i) => (
                  <span key={i} className="badge" style={{ background: 'var(--muted)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {createError && (
        <div
          className="mx-4 mb-2 rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))',
            background: 'var(--danger-light)',
            color: 'var(--danger)',
          }}
        >
          <p className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {createError}
          </p>
        </div>
      )}
      {!created?.success && (
        <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
          <Button
            onClick={handleCreate}
            disabled={creating}
            size="sm"
            className="h-7 rounded-lg px-3 text-xs"
          >
            {creating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            创建 Skill
          </Button>
          <Button
            onClick={handleEditInForm}
            disabled={creating}
            variant="outline"
            size="sm"
            className="h-7 rounded-lg px-3 text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            在表单中编辑
          </Button>
        </div>
      )}

      {/* Created success */}
      {created?.success && (
        <div
          className="px-4 py-3 border-t flex items-center gap-2 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--success)' }}
        >
          <Check className="h-3.5 w-3.5" />
          Skill 已创建成功
        </div>
      )}
    </div>
  )
}
