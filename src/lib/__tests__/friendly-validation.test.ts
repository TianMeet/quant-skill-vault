import { describe, expect, it } from 'vitest'
import {
  toFriendlyLintIssues,
  toFriendlyLintSummary,
  toUserFriendlyErrorMessage,
} from '@/lib/friendly-validation'

describe('friendly-validation', () => {
  it('maps lint rules to friendly issues', () => {
    const issues = toFriendlyLintIssues([
      { field: 'slug', message: 'name (slug) must match ^[a-z0-9-]{1,64}$, got: ""' },
      { field: 'triggers', message: 'triggers must have >= 3 items, got: 0' },
      { field: 'steps', message: 'steps must have 3~7 items, got: 0' },
      { field: 'tests', message: 'tests must have >= 1 test case' },
      { field: 'guardrails.stop_conditions', message: 'stop_conditions must have >= 1 item' },
    ])

    expect(issues).toHaveLength(5)
    expect(issues[0].message).toContain('填写标题')
    expect(issues[1].message).toContain('至少需要 3 条')
    expect(issues[2].message).toContain('3 到 7 条')
    expect(issues[3].message).toContain('完整测试用例')
    expect(issues[4].message).toContain('停止条件')
  })

  it('summarizes friendly lint issues', () => {
    const summary = toFriendlyLintSummary([
      { field: 'steps', message: 'steps must have 3~7 items, got: 0' },
      { field: 'tests', message: 'tests must have >= 1 test case' },
    ])

    expect(summary).toContain('1.')
    expect(summary).toContain('步骤需要 3 到 7 条')
    expect(summary).toContain('完整测试用例')
  })

  it('maps common API errors to user-friendly messages', () => {
    expect(toUserFriendlyErrorMessage('Validation failed')).toContain('未通过校验')
    expect(toUserFriendlyErrorMessage('Slug already exists')).toContain('同名')
    expect(toUserFriendlyErrorMessage('Text file exceeds 200KB limit')).toContain('200KB')
    expect(toUserFriendlyErrorMessage('path must not contain ..')).toContain('不能包含 ..')
  })
})
