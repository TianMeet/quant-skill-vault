'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { SkillTestCase } from '@/lib/types'
import { FormField } from '@/components/ui/form-field'
import { Button } from '@/components/ui/button'
import { Input, type FieldVisualState } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface TestsTabProps {
  roundedClass: string
  monoDataClass: string
  tests: SkillTestCase[]
  completeTests: number
  markUserEdited: (field: string) => void
  updateTest: (index: number, field: keyof SkillTestCase, value: string) => void
  removeTest: (index: number) => void
  addTest: () => void
  shouldShowFieldError: (field: string) => boolean
  getFieldError: (field: string) => string | undefined
  getFieldState: (field: string, done?: boolean) => FieldVisualState
  aiRingClass: (field: string) => string
}

export function SkillFormTestsTab({
  roundedClass,
  monoDataClass,
  tests,
  completeTests,
  markUserEdited,
  updateTest,
  removeTest,
  addTest,
  shouldShowFieldError,
  getFieldError,
  getFieldState,
  aiRingClass,
}: TestsTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>定义测试用例（至少 1 个）。每个测试包含名称、输入和预期输出。</p>
      <FormField
        label="测试用例"
        required
        hint="至少 1 条完整用例（名称/输入/预期输出）。"
        error={getFieldError('tests')}
        count={{ current: completeTests, recommended: 1 }}
        status={getFieldState('tests', completeTests >= 1)}
      >
        <div className="h-0.5" />
      </FormField>

      {tests.map((test, i) => (
        <div key={i} className={`${roundedClass} border border-[var(--input-border)] p-3 space-y-2 ${aiRingClass('tests')}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">测试 {i + 1}</span>
            {tests.length > 1 && (
              <Button
                onClick={() => { markUserEdited('tests'); removeTest(i) }}
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--danger)] opacity-50 hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Input
            value={test.name}
            density="compact"
            onChange={(e) => { markUserEdited('tests'); updateTest(i, 'name', e.target.value) }}
            state={!test.name.trim() && shouldShowFieldError('tests') ? 'error' : 'default'}
            className={`w-full ${roundedClass} ${monoDataClass}`}
            placeholder="测试名称"
          />
          <Textarea
            value={test.input}
            density="compact"
            onChange={(e) => { markUserEdited('tests'); updateTest(i, 'input', e.target.value) }}
            state={!test.input.trim() && shouldShowFieldError('tests') ? 'error' : 'default'}
            className={`w-full ${roundedClass} min-h-[92px] font-mono`}
            rows={2}
            placeholder="输入"
          />
          <Textarea
            value={test.expected_output}
            density="compact"
            onChange={(e) => { markUserEdited('tests'); updateTest(i, 'expected_output', e.target.value) }}
            state={!test.expected_output.trim() && shouldShowFieldError('tests') ? 'error' : 'default'}
            className={`w-full ${roundedClass} min-h-[92px] font-mono`}
            rows={2}
            placeholder="预期输出"
          />
        </div>
      ))}

      <Button onClick={addTest} type="button" variant="ghost" size="sm" className="h-8 px-2 text-sm text-[var(--muted-foreground)]">
        <Plus className="h-4 w-4" /> 添加测试用例
      </Button>
    </div>
  )
}
