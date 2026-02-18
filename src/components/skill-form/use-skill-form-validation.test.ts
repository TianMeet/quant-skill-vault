import type { SkillGuardrails, SkillTestCase } from '@/lib/types'
import { describe, expect, it } from 'vitest'
import { buildSkillFormValidationModel } from '@/components/skill-form/use-skill-form-validation'

function makeGuardrails(overrides: Partial<SkillGuardrails> = {}): SkillGuardrails {
  return {
    allowed_tools: [],
    disable_model_invocation: false,
    user_invocable: true,
    stop_conditions: [''],
    escalation: 'ASK_HUMAN',
    ...overrides,
  }
}

function makeTests(tests: Array<Partial<SkillTestCase>>): SkillTestCase[] {
  return tests.map((t) => ({
    name: t.name ?? '',
    input: t.input ?? '',
    expected_output: t.expected_output ?? '',
  }))
}

describe('buildSkillFormValidationModel', () => {
  it('reports all required fields missing when form is empty', () => {
    const result = buildSkillFormValidationModel({
      title: '',
      summary: '',
      steps: ['', '', ''],
      triggers: ['', '', ''],
      guardrails: makeGuardrails({ stop_conditions: [''] }),
      tests: makeTests([{ name: '', input: '', expected_output: '' }]),
    })

    expect(result.requiredStatus.total).toBe(6)
    expect(result.requiredStatus.filled).toBe(0)
    expect(result.requiredStatus.missing).toEqual(['标题', '摘要', '步骤(>=3)', '触发词(>=3)', '安全护栏', '测试用例'])
    expect(result.fieldErrors.title).toBe('标题不能为空')
    expect(result.fieldErrors.summary).toBe('摘要不能为空')
    expect(result.fieldErrors.steps).toContain('步骤至少填写 3 条')
    expect(result.fieldErrors.triggers).toContain('触发词至少填写 3 条')
    expect(result.fieldErrors.guardrails).toContain('至少填写 1 个停止条件')
    expect(result.fieldErrors.tests).toContain('至少填写 1 个完整测试用例')
  })

  it('marks required checks as done when all constraints are satisfied', () => {
    const result = buildSkillFormValidationModel({
      title: 'Quant Research Skill',
      summary: 'Summarize factor signals and produce actionable notes.',
      steps: ['read context', 'extract factors', 'produce output'],
      triggers: ['分析因子', '复盘策略', '总结信号'],
      guardrails: makeGuardrails({ stop_conditions: ['high risk action'], escalation: 'REVIEW' }),
      tests: makeTests([{ name: 'happy path', input: 'x', expected_output: 'y' }]),
    })

    expect(result.requiredStatus.filled).toBe(6)
    expect(result.requiredStatus.missing).toEqual([])
    expect(result.fieldErrors).toEqual({})
    expect(result.filledSteps).toBe(3)
    expect(result.filledTriggers).toBe(3)
    expect(result.filledStopConditions).toBe(1)
    expect(result.completeTests).toBe(1)
  })

  it('fails guardrails when escalation is invalid even with stop conditions', () => {
    const result = buildSkillFormValidationModel({
      title: 'A',
      summary: 'B',
      steps: ['1', '2', '3'],
      triggers: ['a', 'b', 'c'],
      guardrails: makeGuardrails({
        stop_conditions: ['s1'],
        escalation: 'NOT_VALID' as SkillGuardrails['escalation'],
      }),
      tests: makeTests([{ name: 't', input: 'i', expected_output: 'o' }]),
    })

    expect(result.requiredStatus.missing).toContain('安全护栏')
    expect(result.fieldErrors.guardrails).toContain('有效升级策略')
  })
})
