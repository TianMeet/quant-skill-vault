'use client'

import { useMemo } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toFriendlyLintIssues } from '@/lib/friendly-validation'

interface ExportTabProps {
  roundedLgClass: string
  lintErrors: Array<{ field: string; message: string }>
  lintPassed: boolean
  isEdit: boolean
  skillId?: number
  handleLint: () => Promise<void>
}

export function SkillFormExportTab({
  roundedLgClass,
  lintErrors,
  lintPassed,
  isEdit,
  skillId,
  handleLint,
}: ExportTabProps) {
  const friendlyIssues = useMemo(() => toFriendlyLintIssues(lintErrors), [lintErrors])

  return (
    <div className="space-y-4">
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
