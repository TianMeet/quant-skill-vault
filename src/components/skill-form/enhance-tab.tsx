'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, Eye, File, Loader2, Wand2 } from 'lucide-react'
import { FormField } from '@/components/ui/form-field'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toFriendlyLintIssues } from '@/lib/friendly-validation'

export interface AiChangeSet {
  skillPatch: Record<string, unknown>
  fileOps: Array<{ op: string; path: string; mime?: string; content_text?: string; content_base64?: string }>
  notes?: string
}

export interface AiLintPreview {
  valid: boolean
  errors: Array<{ field: string; message: string }>
}

interface AiFileState {
  loading: boolean
  exists: boolean
  isBinary: boolean
  contentText: string | null
  error: string
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
  currentSkill: Record<string, unknown>
  loadCurrentFile: (path: string) => Promise<{ exists: boolean; isBinary: boolean; contentText: string | null }>
  handleAiPropose: (action: string) => Promise<void>
  handleAiApply: () => Promise<void>
  clearAiChangeSet: () => void
}

const FIELD_LABEL: Record<string, string> = {
  title: '标题',
  summary: '摘要',
  inputs: '输入',
  outputs: '输出',
  steps: '步骤',
  risks: '风险',
  triggers: '触发词',
  guardrails: '安全护栏',
  tests: '测试',
  tags: '标签',
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function isEqualValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  return stableStringify(left) === stableStringify(right)
}

function countLinesDiff(beforeText: string, afterText: string): { added: number; removed: number } {
  const beforeCounts = new Map<string, number>()
  const afterCounts = new Map<string, number>()
  for (const line of beforeText.split(/\r?\n/)) {
    beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1)
  }
  for (const line of afterText.split(/\r?\n/)) {
    afterCounts.set(line, (afterCounts.get(line) || 0) + 1)
  }

  const keys = new Set([...beforeCounts.keys(), ...afterCounts.keys()])
  let added = 0
  let removed = 0
  for (const key of keys) {
    const before = beforeCounts.get(key) || 0
    const after = afterCounts.get(key) || 0
    if (after > before) added += after - before
    if (before > after) removed += before - after
  }
  return { added, removed }
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
  currentSkill,
  loadCurrentFile,
  handleAiPropose,
  handleAiApply,
  clearAiChangeSet,
}: EnhanceTabProps) {
  const friendlyLintIssues = useMemo(
    () => toFriendlyLintIssues(aiLintPreview?.errors ?? []),
    [aiLintPreview],
  )
  const [previewFileState, setPreviewFileState] = useState<{ path: string; state: AiFileState } | null>(null)

  const skillDiffEntries = useMemo(() => {
    if (!aiChangeSet) return []
    return Object.entries(aiChangeSet.skillPatch)
      .filter(([key, after]) => !isEqualValue(currentSkill[key], after))
      .map(([key, after]) => ({
        key,
        label: FIELD_LABEL[key] || key,
        before: currentSkill[key],
        after,
      }))
  }, [aiChangeSet, currentSkill])

  const selectedFileOp = useMemo(() => {
    if (!aiChangeSet || !aiPreviewFile) return null
    return aiChangeSet.fileOps.find((fop) => fop.path === aiPreviewFile) || null
  }, [aiChangeSet, aiPreviewFile])

  const selectedFileState =
    aiPreviewFile && previewFileState?.path === aiPreviewFile ? previewFileState.state : undefined
  const beforeFileText =
    selectedFileState && selectedFileState.exists && !selectedFileState.isBinary
      ? selectedFileState.contentText || ''
      : ''
  const afterFileText =
    selectedFileOp?.op === 'delete'
      ? ''
      : (selectedFileOp?.content_text || '')
  const lineDiff = selectedFileOp ? countLinesDiff(beforeFileText, afterFileText) : { added: 0, removed: 0 }

  async function handleToggleAiPreview(path: string) {
    if (aiPreviewFile === path) {
      setAiPreviewFile(null)
      return
    }

    setAiPreviewFile(path)
    setPreviewFileState({
      path,
      state: {
        loading: true,
        exists: false,
        isBinary: false,
        contentText: null,
        error: '',
      },
    })

    try {
      const result = await loadCurrentFile(path)
      setPreviewFileState({
        path,
        state: {
          loading: false,
          exists: result.exists,
          isBinary: result.isBinary,
          contentText: result.contentText,
          error: '',
        },
      })
    } catch {
      setPreviewFileState({
        path,
        state: {
          loading: false,
          exists: false,
          isBinary: false,
          contentText: null,
          error: '读取当前文件失败',
        },
      })
    }
  }

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
          {skillDiffEntries.length > 0 && (
            <div className={`${roundedClass} border p-4`}>
              <h3 className="text-sm font-semibold mb-2">建议的 Skill 变更</h3>
              <div className="space-y-2">
                {skillDiffEntries.map((entry) => (
                  <div key={entry.key} className={`${roundedClass} border p-2`}>
                    <span className="font-mono text-xs rounded px-1" style={{ background: 'var(--muted)' }}>{entry.label}</span>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>当前</p>
                        <pre className={`${roundedClass} p-2 text-xs overflow-auto max-h-40`} style={{ background: 'var(--muted)' }}>
                          {stableStringify(entry.before)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>建议</p>
                        <pre className={`${roundedClass} p-2 text-xs overflow-auto max-h-40`} style={{ background: 'color-mix(in srgb, var(--accent) 9%, var(--muted))' }}>
                          {stableStringify(entry.after)}
                        </pre>
                      </div>
                    </div>
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
                      onClick={() => void handleToggleAiPreview(fop.path)}
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
                  {selectedFileState?.loading ? (
                    <div className={`${roundedClass} flex items-center gap-2 p-3 text-sm`} style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> 正在加载当前文件内容...
                    </div>
                  ) : selectedFileState?.error ? (
                    <div className={`${roundedClass} p-3 text-sm`} style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                      {selectedFileState.error}
                    </div>
                  ) : selectedFileOp ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        <span>新增行：{lineDiff.added}</span>
                        <span>删除行：{lineDiff.removed}</span>
                      </div>
                      {(selectedFileOp.content_base64 || selectedFileState?.isBinary) ? (
                        <div className={`${roundedClass} p-3 text-xs`} style={{ background: 'var(--muted)' }}>
                          此文件包含二进制内容，当前仅展示路径级变更。
                        </div>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>当前内容</p>
                            <pre className={`${roundedClass} p-3 text-xs overflow-auto max-h-64`} style={{ background: 'var(--muted)' }} data-testid="ai-file-preview-before">
                              {beforeFileText || '（空文件）'}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>建议内容</p>
                            <pre className={`${roundedClass} p-3 text-xs overflow-auto max-h-64`} style={{ background: 'color-mix(in srgb, var(--accent) 9%, var(--muted))' }} data-testid="ai-file-preview">
                              {selectedFileOp.op === 'delete' ? '（将删除）' : (afterFileText || '（空文件）')}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
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
