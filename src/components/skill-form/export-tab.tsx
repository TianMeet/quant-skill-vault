'use client'

import { useMemo } from 'react'
import { AlertCircle, CheckCircle, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toFriendlyLintIssues } from '@/lib/friendly-validation'

interface RequiredStatus {
  checks: Array<{ key: string; done: boolean; label: string }>
  total: number
  filled: number
  missing: string[]
}

interface ExportTabProps {
  roundedLgClass: string
  lintErrors: Array<{ field: string; message: string }>
  lintPassed: boolean
  isEdit: boolean
  skillId?: number
  requiredStatus: RequiredStatus
  handleLint: () => Promise<void>
}

export function SkillFormExportTab({
  roundedLgClass,
  lintErrors,
  lintPassed,
  isEdit,
  skillId,
  requiredStatus,
  handleLint,
}: ExportTabProps) {
  const friendlyIssues = useMemo(() => toFriendlyLintIssues(lintErrors), [lintErrors])
  const readyForExport = requiredStatus.filled === requiredStatus.total
  const lintState = lintPassed ? 'passed' : friendlyIssues.length > 0 ? 'failed' : 'idle'

  return (
    <div className="space-y-4">
      <div className={`${roundedLgClass} border p-4`} style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <p className="text-sm font-medium">导出前预检</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {requiredStatus.checks.map((check) => (
            <div
              key={check.key}
              className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
              style={{
                borderColor: check.done ? 'color-mix(in srgb, var(--success) 40%, var(--border))' : 'var(--border)',
                background: check.done ? 'var(--success-light)' : 'var(--card)',
              }}
            >
              {check.done ? (
                <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--success)' }} />
              ) : (
                <CircleDashed className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
              )}
              <span style={{ color: check.done ? 'var(--success)' : 'var(--muted-foreground)' }}>{check.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs" style={{ color: readyForExport ? 'var(--success)' : 'var(--warning)' }}>
          完整度：{requiredStatus.filled}/{requiredStatus.total}
          {!readyForExport && requiredStatus.missing.length > 0 ? `（待补齐：${requiredStatus.missing.join('、')}）` : ''}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          校验状态：
          {lintState === 'passed' && ' 已通过'}
          {lintState === 'failed' && ` 未通过（${friendlyIssues.length}项）`}
          {lintState === 'idle' && ' 未运行'}
        </p>
      </div>

      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>导出前请先运行校验检查，所有验证必须通过。</p>
      <Button onClick={() => void handleLint()} type="button" variant="secondary" className={`${roundedLgClass} px-4`}>
        运行校验
      </Button>
      {friendlyIssues.length > 0 && (
        <div className={`${roundedLgClass} p-4`} style={{ background: 'var(--danger-light)' }}>
          <p className="font-medium mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--danger)' }}><AlertCircle className="h-4 w-4" /> 校验失败</p>
          <ul className="space-y-2">
            {friendlyIssues.map((e, i) => (
              <li key={i} className="text-sm" style={{ color: 'var(--danger)' }}>
                <span className="text-xs rounded px-1.5 py-0.5" style={{ background: 'color-mix(in srgb, var(--danger-light) 65%, var(--background))' }}>{e.fieldLabel}</span>{' '}
                {e.message}
                {e.suggestion && (
                  <p className="mt-1 text-xs" style={{ color: 'color-mix(in srgb, var(--danger) 82%, var(--muted-foreground))' }}>
                    建议：{e.suggestion}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {lintPassed && (
        <div className={`${roundedLgClass} p-4`} style={{ background: 'var(--success-light)' }}>
          <p className="font-medium flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}><CheckCircle className="h-4 w-4" /> 校验通过</p>
          {isEdit && (
            <div className="mt-3 flex gap-2">
              <Button asChild className={`${roundedLgClass} px-4`}>
                <a href={`/api/skills/${skillId}/export.zip`}>导出 ZIP</a>
              </Button>
              <Button asChild variant="outline" className={`${roundedLgClass} px-4`}>
                <a href={`/api/skills/${skillId}/export.md`}>导出 MD</a>
              </Button>
              <Button asChild variant="outline" className={`${roundedLgClass} px-4`}>
                <a href={`/api/skills/${skillId}/export.json`}>导出 JSON</a>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
