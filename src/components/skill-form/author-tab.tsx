'use client'

import { Plus, Trash2 } from 'lucide-react'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, type FieldVisualState } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface AuthorTabProps {
  roundedClass: string
  roundedLgClass: string
  monoDataClass: string
  title: string
  summary: string
  tags: string[]
  tagInput: string
  inputs: string
  outputs: string
  steps: string[]
  risks: string
  filledSteps: number
  setTagInput: (value: string) => void
  handleAddTag: () => void
  removeTag: (tag: string) => void
  markUserEdited: (field: string) => void
  setField: (field: 'title' | 'summary' | 'inputs' | 'outputs' | 'risks', value: string) => void
  updateStep: (index: number, value: string) => void
  removeStep: (index: number) => void
  addStep: () => void
  shouldShowFieldError: (field: string) => boolean
  getFieldError: (field: string) => string | undefined
  getFieldState: (field: string, done?: boolean) => FieldVisualState
  isAiField: (field: string) => boolean
  aiRingClass: (field: string) => string
}

export function SkillFormAuthorTab({
  roundedClass,
  roundedLgClass,
  monoDataClass,
  title,
  summary,
  tags,
  tagInput,
  inputs,
  outputs,
  steps,
  risks,
  filledSteps,
  setTagInput,
  handleAddTag,
  removeTag,
  markUserEdited,
  setField,
  updateStep,
  removeStep,
  addStep,
  shouldShowFieldError,
  getFieldError,
  getFieldState,
  isAiField,
  aiRingClass,
}: AuthorTabProps) {
  return (
    <div className="space-y-4">
      <FormField
        label="标题"
        required
        hint="建议 6-40 个字符，便于检索和复用。"
        error={getFieldError('title')}
        count={{ current: title.length, recommended: 40 }}
        status={getFieldState('title', title.trim().length > 0)}
      >
        <Input
          value={title}
          onChange={(e) => { markUserEdited('title'); setField('title', e.target.value) }}
          state={getFieldState('title', title.trim().length > 0)}
          className={`w-full ${roundedClass} text-base font-medium ${monoDataClass}`}
          placeholder="Skill 标题"
        />
      </FormField>

      <FormField
        label="摘要"
        required
        hint="一行解释这个 Skill 解决什么问题。"
        error={getFieldError('summary')}
        count={{ current: summary.length, recommended: 120 }}
        status={getFieldState('summary', summary.trim().length > 0)}
      >
        <Textarea
          value={summary}
          onChange={(e) => { markUserEdited('summary'); setField('summary', e.target.value) }}
          state={getFieldState('summary', summary.trim().length > 0)}
          className={`w-full ${roundedClass} ${monoDataClass} min-h-[90px]`}
          rows={2}
          placeholder="简要描述该 Skill 的功能"
        />
      </FormField>

      <FormField
        label="标签"
        hint="输入后按回车或点击添加。"
        count={{ current: tags.length }}
        status={isAiField('tags') ? 'ai' : 'default'}
      >
        <div
          className={`mb-2 flex min-h-[42px] flex-wrap gap-1 border border-dashed p-2 ${roundedClass} ${aiRingClass('tags')}`}
          style={{ borderColor: 'var(--input-border-hover)', background: 'var(--muted)' }}
        >
          {tags.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>暂无标签</span>
          )}
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className={`inline-flex items-center gap-1 ${roundedClass} px-2 py-0.5 text-xs font-medium`}>
              {tag}
              <Button
                onClick={() => removeTag(tag)}
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
            value={tagInput}
            density="compact"
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
            state={tagInput.trim() ? 'success' : 'default'}
            className={`flex-1 ${roundedClass}`}
            placeholder="添加标签..."
          />
          <Button onClick={handleAddTag} type="button" variant="outline" size="sm" className={`${roundedLgClass} px-3`}>
            添加
          </Button>
        </div>
      </FormField>

      <FormField
        label="输入 (Markdown)"
        hint="说明调用方会提供什么输入。"
        count={{ current: inputs.length, recommended: 220 }}
        status={getFieldState('inputs', inputs.trim().length > 0)}
      >
        <Textarea
          value={inputs}
          onChange={(e) => { markUserEdited('inputs'); setField('inputs', e.target.value) }}
          state={getFieldState('inputs', inputs.trim().length > 0)}
          className={`w-full ${roundedClass} min-h-[120px] font-mono`}
          rows={4}
        />
      </FormField>

      <FormField
        label="输出 (Markdown)"
        hint="说明交付格式、边界和质量要求。"
        count={{ current: outputs.length, recommended: 220 }}
        status={getFieldState('outputs', outputs.trim().length > 0)}
      >
        <Textarea
          value={outputs}
          onChange={(e) => { markUserEdited('outputs'); setField('outputs', e.target.value) }}
          state={getFieldState('outputs', outputs.trim().length > 0)}
          className={`w-full ${roundedClass} min-h-[120px] font-mono`}
          rows={4}
        />
      </FormField>

      <FormField
        label="步骤 (3-7)"
        required
        hint="每步建议是可执行动作，不要过于抽象。"
        error={getFieldError('steps')}
        count={{ current: filledSteps, recommended: 3 }}
        status={getFieldState('steps', filledSteps >= 3)}
      >
        {steps.map((step, i) => {
          const stepFilled = step.trim().length > 0
          const stepState: FieldVisualState =
            !stepFilled && shouldShowFieldError('steps')
              ? 'error'
              : isAiField('steps')
                ? 'ai'
                : stepFilled
                  ? 'success'
                  : 'default'
          return (
            <div key={i} className="mb-2 flex gap-2">
              <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-medium" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{i + 1}</span>
              <Input
                value={step}
                density="compact"
                onChange={(e) => { markUserEdited('steps'); updateStep(i, e.target.value) }}
                state={stepState}
                className={`flex-1 ${roundedLgClass} ${monoDataClass}`}
                placeholder={`步骤 ${i + 1}`}
              />
              {steps.length > 3 && (
                <Button
                  onClick={() => { markUserEdited('steps'); removeStep(i) }}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[var(--danger)] opacity-50 hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )
        })}
        {steps.length < 7 && (
          <Button onClick={addStep} type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-[var(--muted-foreground)]">
            <Plus className="h-3 w-3" /> 添加步骤
          </Button>
        )}
      </FormField>

      <FormField
        label="风险 (Markdown)"
        hint="可填写失败模式、误用风险与缓解方式。"
        count={{ current: risks.length, recommended: 180 }}
        status={getFieldState('risks', risks.trim().length > 0)}
      >
        <Textarea
          value={risks}
          onChange={(e) => { markUserEdited('risks'); setField('risks', e.target.value) }}
          state={getFieldState('risks', risks.trim().length > 0)}
          className={`w-full ${roundedClass} min-h-[120px] font-mono`}
          rows={4}
        />
      </FormField>
    </div>
  )
}
