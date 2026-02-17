'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { SkillGuardrails } from '@/lib/types'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, type FieldVisualState } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface GuardrailsTabProps {
  roundedClass: string
  roundedLgClass: string
  monoDataClass: string
  guardrails: SkillGuardrails
  filledStopConditions: number
  markUserEdited: (field: string) => void
  setGuardrails: (g: SkillGuardrails) => void
  addAllowedTool: (tool: string) => void
  removeAllowedTool: (tool: string) => void
  updateStopCondition: (index: number, value: string) => void
  removeStopCondition: (index: number) => void
  addStopCondition: () => void
  shouldShowFieldError: (field: string) => boolean
  getFieldError: (field: string) => string | undefined
  getFieldState: (field: string, done?: boolean) => FieldVisualState
  aiRingClass: (field: string) => string
}

export function SkillFormGuardrailsTab({
  roundedClass,
  roundedLgClass,
  monoDataClass,
  guardrails,
  filledStopConditions,
  markUserEdited,
  setGuardrails,
  addAllowedTool,
  removeAllowedTool,
  updateStopCondition,
  removeStopCondition,
  addStopCondition,
  shouldShowFieldError,
  getFieldError,
  getFieldState,
  aiRingClass,
}: GuardrailsTabProps) {
  const [toolInput, setToolInput] = useState('')

  function handleAddAllowedTool() {
    const trimmed = toolInput.trim()
    if (!trimmed) return
    addAllowedTool(trimmed)
    setToolInput('')
  }

  return (
    <div className="space-y-4">
      <FormField
        label="允许的工具"
        hint="限制可调用工具可以降低风险。"
        count={{ current: guardrails.allowed_tools.length }}
        status={guardrails.allowed_tools.length > 0 ? 'success' : 'default'}
      >
        <div className="flex flex-wrap gap-1 mb-2">
          {guardrails.allowed_tools.map((tool) => (
            <Badge key={tool} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {tool}
              <Button
                onClick={() => removeAllowedTool(tool)}
                type="button"
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 text-[10px] opacity-60 hover:opacity-100"
              >
                ×
              </Button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={toolInput}
            density="compact"
            className={`flex-1 ${roundedClass}`}
            placeholder="例如 Read, Write, Bash"
            onChange={(e) => setToolInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddAllowedTool()
              }
            }}
          />
          <Button
            onClick={handleAddAllowedTool}
            type="button"
            variant="outline"
            size="sm"
            className={`${roundedLgClass} px-3`}
          >
            添加
          </Button>
        </div>
      </FormField>

      <div className="flex items-center justify-between py-1">
        <label className="text-sm font-medium">禁用模型调用</label>
        <Switch
          checked={guardrails.disable_model_invocation}
          onCheckedChange={(checked) => setGuardrails({ ...guardrails, disable_model_invocation: checked })}
        />
      </div>

      <div className="flex items-center justify-between py-1">
        <label className="text-sm font-medium">用户可调用</label>
        <Switch
          checked={guardrails.user_invocable}
          onCheckedChange={(checked) => setGuardrails({ ...guardrails, user_invocable: checked })}
        />
      </div>

      <FormField
        label="升级策略"
        required
        error={getFieldError('guardrails')}
        status={getFieldState('guardrails', filledStopConditions >= 1)}
      >
        <Select
          value={guardrails.escalation}
          onValueChange={(value) => {
            markUserEdited('guardrails')
            setGuardrails({ ...guardrails, escalation: value as SkillGuardrails['escalation'] })
          }}
        >
          <SelectTrigger className={`h-10 w-full ${roundedClass} border-[var(--input-border)] bg-[var(--input-bg)] shadow-[var(--shadow-sm)] focus:ring-[var(--input-ring)] ${aiRingClass('guardrails')}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
            <SelectItem value="ASK_HUMAN">ASK_HUMAN</SelectItem>
            <SelectItem value="REVIEW">REVIEW</SelectItem>
            <SelectItem value="BLOCK">BLOCK</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="停止条件"
        required
        hint="至少填写 1 条，明确停止触发点。"
        error={getFieldError('guardrails')}
        count={{ current: filledStopConditions, recommended: 1 }}
        status={getFieldState('guardrails', filledStopConditions >= 1)}
      >
        {guardrails.stop_conditions.map((sc, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <Input
              value={sc}
              density="compact"
              onChange={(e) => { markUserEdited('guardrails'); updateStopCondition(i, e.target.value) }}
              state={!sc.trim() && shouldShowFieldError('guardrails') ? 'error' : getFieldState('guardrails', sc.trim().length > 0)}
              className={`flex-1 ${roundedClass} ${monoDataClass}`}
              placeholder="停止条件..."
            />
            {guardrails.stop_conditions.length > 1 && (
              <Button
                onClick={() => { markUserEdited('guardrails'); removeStopCondition(i) }}
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--danger)] opacity-50 hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button onClick={addStopCondition} type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-[var(--muted-foreground)]">
          <Plus className="h-3 w-3" /> 添加条件
        </Button>
      </FormField>
    </div>
  )
}
