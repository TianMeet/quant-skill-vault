import { useMemo } from 'react'
import type { SkillGuardrails, SkillTestCase } from '@/lib/types'
import type { FieldVisualState } from '@/components/ui/input'

const VALID_ESCALATIONS = ['REVIEW', 'BLOCK', 'ASK_HUMAN']

type CheckKey = 'title' | 'summary' | 'steps' | 'triggers' | 'guardrails' | 'tests'

interface ValidationCheck {
  key: CheckKey
  done: boolean
  label: string
}

interface SkillValidationModel {
  requiredStatus: {
    checks: ValidationCheck[]
    total: number
    filled: number
    missing: string[]
  }
  filledSteps: number
  filledTriggers: number
  filledStopConditions: number
  completeTests: number
  fieldErrors: Record<string, string>
}

interface BuildSkillFormValidationParams {
  title: string
  summary: string
  steps: string[]
  triggers: string[]
  guardrails: SkillGuardrails
  tests: SkillTestCase[]
}

interface UseSkillFormValidationParams extends BuildSkillFormValidationParams {
  showValidation: boolean
  userEdited: Set<string>
  activeField: string | null
  aiFilledFields: Set<string>
}

export function buildSkillFormValidationModel({
  title,
  summary,
  steps,
  triggers,
  guardrails,
  tests,
}: BuildSkillFormValidationParams): SkillValidationModel {
  const filledSteps = steps.filter((s) => s.trim()).length
  const filledTriggers = triggers.filter((t) => t.trim()).length
  const filledStopConditions = guardrails.stop_conditions.filter((s) => s.trim()).length
  const completeTests = tests.filter((t) => t.name.trim() && t.input.trim() && t.expected_output.trim()).length

  const checks: ValidationCheck[] = [
    { key: 'title', done: title.trim().length > 0, label: '标题' },
    { key: 'summary', done: summary.trim().length > 0, label: '摘要' },
    { key: 'steps', done: filledSteps >= 3, label: '步骤(>=3)' },
    { key: 'triggers', done: filledTriggers >= 3, label: '触发词(>=3)' },
    {
      key: 'guardrails',
      done: filledStopConditions >= 1 && VALID_ESCALATIONS.includes(guardrails.escalation),
      label: '安全护栏',
    },
    {
      key: 'tests',
      done: completeTests >= 1,
      label: '测试用例',
    },
  ]

  const fieldErrors: Record<string, string> = {}
  if (!title.trim()) fieldErrors.title = '标题不能为空'
  if (!summary.trim()) fieldErrors.summary = '摘要不能为空'
  if (filledSteps < 3) fieldErrors.steps = `步骤至少填写 3 条（当前 ${filledSteps}）`
  if (filledTriggers < 3) fieldErrors.triggers = `触发词至少填写 3 条（当前 ${filledTriggers}）`
  if (!VALID_ESCALATIONS.includes(guardrails.escalation) || filledStopConditions < 1) {
    fieldErrors.guardrails = '至少填写 1 个停止条件，并设置有效升级策略'
  }
  if (completeTests < 1) {
    fieldErrors.tests = '至少填写 1 个完整测试用例（名称、输入、预期输出）'
  }

  return {
    requiredStatus: {
      checks,
      total: checks.length,
      filled: checks.filter((c) => c.done).length,
      missing: checks.filter((c) => !c.done).map((c) => c.label),
    },
    filledSteps,
    filledTriggers,
    filledStopConditions,
    completeTests,
    fieldErrors,
  }
}

export function useSkillFormValidation({
  title,
  summary,
  steps,
  triggers,
  guardrails,
  tests,
  showValidation,
  userEdited,
  activeField,
  aiFilledFields,
}: UseSkillFormValidationParams) {
  const model = useMemo(
    () =>
      buildSkillFormValidationModel({
        title,
        summary,
        steps,
        triggers,
        guardrails,
        tests,
      }),
    [title, summary, steps, triggers, guardrails, tests],
  )

  const isAiField = (field: string) => activeField === field || aiFilledFields.has(field)
  const aiRingClass = (field: string) =>
    isAiField(field) ? 'ring-2 ring-[var(--input-ai)] transition-all duration-300' : 'transition-all duration-300'

  const shouldShowFieldError = (field: string) => showValidation || userEdited.has(field)
  const getFieldError = (field: string) => (shouldShowFieldError(field) ? model.fieldErrors[field] : undefined)

  const getFieldState = (field: string, done = false): FieldVisualState => {
    if (getFieldError(field)) return 'error'
    if (isAiField(field)) return 'ai'
    if (done) return 'success'
    return 'default'
  }

  const tabStatus: Record<string, boolean | undefined> = {
    author: model.requiredStatus.checks[0].done && model.requiredStatus.checks[1].done && model.requiredStatus.checks[2].done,
    triggers: model.requiredStatus.checks[3].done,
    guardrails: model.requiredStatus.checks[4].done,
    tests: model.requiredStatus.checks[5].done,
  }

  return {
    ...model,
    isAiField,
    aiRingClass,
    shouldShowFieldError,
    getFieldError,
    getFieldState,
    tabStatus,
  }
}
