'use client'

import { useMemo } from 'react'
import { AlertCircle, CheckCircle, Eye, File, Loader2, Wand2 } from 'lucide-react'
import { FormField } from '@/components/ui/form-field'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toFriendlyLintIssues } from '@/lib/friendly-validation'

export interface AiChangeSet {
  skillPatch: Record<string, unknown>
  fileOps: Array<{ op: string; path: string; mime?: string; content_text?: string }>
  notes?: string
}

export interface AiLintPreview {
  valid: boolean
  errors: Array<{ field: string; message: string }>
}

interface EnhanceTabProps {
  skillId?: number
  roundedClass: string
  roundedLgClass: string
  aiInstruction: string
  setAiInstruction: (value: string) => void
  aiLoading: boolean
  aiError: string
  aiChangeSet: AiChangeSet | null
  aiLintPreview: AiLintPreview | null
  aiApplying: boolean
  aiApplied: boolean
  aiPreviewFile: string | null
  setAiPreviewFile: (path: string | null) => void
  handleAiPropose: (action: string) => Promise<void>
  handleAiApply: () => Promise<void>
  clearAiChangeSet: () => void
}

export function SkillFormEnhanceTab({
  skillId,
  roundedClass,
  roundedLgClass,
  aiInstruction,
  setAiInstruction,
  aiLoading,
  aiError,
  aiChangeSet,
  aiLintPreview,
  aiApplying,
  aiApplied,
  aiPreviewFile,
  setAiPreviewFile,
  handleAiPropose,
  handleAiApply,
  clearAiChangeSet,
}: EnhanceTabProps) {
  const friendlyLintIssues = useMemo(
    () => toFriendlyLintIssues(aiLintPreview?.errors ?? []),
    [aiLintPreview],
  )

  if (!skillId) {
    return <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>请先保存 Skill 以使用增强功能。</p>
  }

  return (
    <>
      <div>
        <FormField label="指令（可选）" hint="描述你希望 AI 优化的方向。" count={{ current: aiInstruction.length, recommended: 120 }}>
          <Textarea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            className={`w-full ${roundedClass} min-h-[90px]`}
            rows={2}
            placeholder="例如：让摘要更简洁，添加错误处理步骤..."
            data-testid="ai-instruction"
          />
        </FormField>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void handleAiPropose('update-skill')} disabled={aiLoading} type="button" className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4`} data-testid="ai-improve-btn">
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          优化
        </Button>
        <Button onClick={() => void handleAiPropose('fix-lint')} disabled={aiLoading} type="button" className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 bg-[var(--warning)] hover:opacity-90`} data-testid="ai-fix-lint-btn">
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
          修复校验
        </Button>
        <Button onClick={() => void handleAiPropose('create-supporting-files')} disabled={aiLoading} type="button" className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 bg-[var(--success)] hover:opacity-90`} data-testid="ai-gen-files-btn">
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
          生成文件
        </Button>
      </div>

      {aiError && (
        <div className={`${roundedLgClass} p-3 text-sm flex items-center gap-2`} style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
          <AlertCircle className="h-4 w-4" /> {aiError}
        </div>
      )}

      {aiChangeSet && (
        <div className="space-y-4" data-testid="ai-preview">
          {Object.keys(aiChangeSet.skillPatch).length > 0 && (
            <div className={`${roundedClass} border p-4`}>
              <h3 className="text-sm font-semibold mb-2">建议的 Skill 变更</h3>
              <div className="space-y-2">
                {Object.entries(aiChangeSet.skillPatch).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-mono text-xs rounded px-1" style={{ background: 'var(--muted)' }}>{key}</span>
                    <pre className={`mt-1 ${roundedClass} p-2 text-xs overflow-auto max-h-32`} style={{ background: 'var(--muted)' }}>
                      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiChangeSet.fileOps.length > 0 && (
            <div className={`${roundedClass} border p-4`}>
              <h3 className="text-sm font-semibold mb-2">建议的文件变更</h3>
              <div className="space-y-1">
                {aiChangeSet.fileOps.map((fop, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${fop.op === 'upsert' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {fop.op}
                    </span>
                    <Button
                      onClick={() => setAiPreviewFile(aiPreviewFile === fop.path ? null : fop.path)}
                      type="button"
                      variant="ghost"
                      className="h-auto font-mono text-xs text-blue-600 hover:underline flex items-center gap-1 px-0 py-0"
                      data-testid={`ai-file-${fop.path}`}
                    >
                      <Eye className="h-3 w-3" /> {fop.path}
                    </Button>
                  </div>
                ))}
              </div>
              {aiPreviewFile && (
                <div className="mt-3">
                  <p className="text-xs font-mono mb-1" style={{ color: 'var(--muted-foreground)' }}>{aiPreviewFile}</p>
                  <pre className={`${roundedClass} p-3 text-xs overflow-auto max-h-64`} style={{ background: 'var(--muted)' }} data-testid="ai-file-preview">
                    {aiChangeSet.fileOps.find((f) => f.path === aiPreviewFile)?.content_text || '（无内容）'}
                  </pre>
                </div>
              )}
            </div>
          )}

          {aiChangeSet.notes && (
            <div className={`${roundedClass} bg-blue-50 p-3 text-sm text-blue-700`}>
              {aiChangeSet.notes}
            </div>
          )}

          {aiLintPreview && (
            <div className={`${roundedClass} p-3 ${aiLintPreview.valid ? 'bg-green-50' : 'bg-amber-50'}`}>
              <p className={`text-sm font-medium flex items-center gap-2 ${aiLintPreview.valid ? 'text-green-700' : 'text-amber-700'}`}>
                {aiLintPreview.valid ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                校验预览：{aiLintPreview.valid ? '通过' : '存在问题'}
              </p>
              {!aiLintPreview.valid && (
                <ul className="mt-2 space-y-1">
                  {friendlyLintIssues.map((e, i) => (
                    <li key={i} className="text-xs text-amber-600">
                      <span className="bg-amber-100 px-1 rounded">{e.fieldLabel}</span> {e.message}
                      {e.suggestion && <p className="mt-0.5 text-[11px] text-amber-700">建议：{e.suggestion}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => void handleAiApply()}
              disabled={aiApplying || aiApplied || (aiLintPreview !== null && !aiLintPreview.valid)}
              type="button"
              className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-6`}
              data-testid="ai-apply-btn"
            >
              {aiApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {aiApplied ? '已应用' : '应用变更'}
            </Button>
            <Button onClick={clearAiChangeSet} type="button" variant="outline" className={`${roundedLgClass} px-4`}>
              放弃
            </Button>
          </div>

          {aiApplied && (
            <div className={`${roundedLgClass} p-3 text-sm flex items-center gap-2`} style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
              <CheckCircle className="h-4 w-4" /> 变更已成功应用，正在刷新...
            </div>
          )}
        </div>
      )}
    </>
  )
}
