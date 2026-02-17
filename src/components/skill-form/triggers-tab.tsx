'use client'

import { Plus, Trash2 } from 'lucide-react'
import { FormField } from '@/components/ui/form-field'
import { Button } from '@/components/ui/button'
import { Input, type FieldVisualState } from '@/components/ui/input'

interface TriggersTabProps {
  roundedLgClass: string
  monoDataClass: string
  triggers: string[]
  filledTriggers: number
  markUserEdited: (field: string) => void
  updateTrigger: (index: number, value: string) => void
  removeTrigger: (index: number) => void
  addTrigger: () => void
  shouldShowFieldError: (field: string) => boolean
  isAiField: (field: string) => boolean
  getFieldError: (field: string) => string | undefined
  getFieldState: (field: string, done?: boolean) => FieldVisualState
}

export function SkillFormTriggersTab({
  roundedLgClass,
  monoDataClass,
  triggers,
  filledTriggers,
  markUserEdited,
  updateTrigger,
  removeTrigger,
  addTrigger,
  shouldShowFieldError,
  isAiField,
  getFieldError,
  getFieldState,
}: TriggersTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>触发短语将包含在导出描述中（用双引号包裹）。建议每条都尽量贴近真实用户表达。</p>
      <FormField
        label="触发短语"
        required
        hint="至少填写 3 条。"
        error={getFieldError('triggers')}
        count={{ current: filledTriggers, recommended: 3 }}
        status={getFieldState('triggers', filledTriggers >= 3)}
      >
        {triggers.map((trigger, i) => {
          const triggerFilled = trigger.trim().length > 0
          const triggerState: FieldVisualState =
            !triggerFilled && shouldShowFieldError('triggers')
              ? 'error'
              : isAiField('triggers')
                ? 'ai'
                : triggerFilled
                  ? 'success'
                  : 'default'
          return (
            <div key={i} className="mb-2 flex gap-2">
              <Input
                value={trigger}
                onChange={(e) => { markUserEdited('triggers'); updateTrigger(i, e.target.value) }}
                state={triggerState}
                className={`flex-1 ${roundedLgClass} ${monoDataClass}`}
                placeholder={`触发短语 ${i + 1}`}
              />
              {triggers.length > 3 && (
                <Button
                  onClick={() => { markUserEdited('triggers'); removeTrigger(i) }}
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
      </FormField>
      <Button onClick={addTrigger} type="button" variant="ghost" size="sm" className="h-8 px-2 text-sm text-[var(--muted-foreground)]">
        <Plus className="h-4 w-4" /> 添加触发词
      </Button>
      {triggers.filter(Boolean).length >= 3 && (
        <div className={`mt-4 ${roundedLgClass} p-3 text-sm`} style={{ background: 'var(--muted)' }}>
          <p className="font-medium mb-1">预览（描述摘录）：</p>
          <p style={{ color: 'var(--muted-foreground)' }}>触发短语：{triggers.filter(Boolean).map((t) => `"${t}"`).join(', ')}</p>
        </div>
      )}
    </div>
  )
}
