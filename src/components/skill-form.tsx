'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SkillData, SkillGuardrails } from '@/lib/types'
import { useSkillStore } from '@/lib/stores/skill-store'
import { FormField } from '@/components/ui/form-field'
import { Input, type FieldVisualState } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2, AlertCircle, CheckCircle, Upload, File, Wand2, Loader2, Eye } from 'lucide-react'

interface SkillFormProps {
  initialData?: SkillData & { tags?: string[] }
  skillId?: number
  variant?: 'default' | 'industrial'
}

interface SkillFileItem {
  path: string
  mime: string
  isBinary: boolean
  size?: number
  contentText?: string
}

export function SkillForm({ initialData, skillId, variant = 'default' }: SkillFormProps) {
  const router = useRouter()
  const isEdit = !!skillId
  const isIndustrial = variant === 'industrial'

  // Zustand store
  const store = useSkillStore()
  const {
    title, summary, inputs, outputs, steps, risks, triggers, guardrails, tests, tags,
    activeTab, saving, error, lintErrors, lintPassed,
    activeField, aiFilledFields, userEdited,
    setField, setUIField, markUserEdited,
    addStep, removeStep, updateStep,
    addTrigger, removeTrigger, updateTrigger,
    addTest, removeTest, updateTest,
    addStopCondition, removeStopCondition, updateStopCondition,
    addTag, removeTag, addAllowedTool, removeAllowedTool, setGuardrails,
    initFromData,
  } = store

  // edit 模式初始化
  useEffect(() => {
    if (initialData) {
      initFromData(initialData)
    }
  }, [initialData, initFromData])

  // AI 高亮样式 helper
  const isAiField = (field: string) => activeField === field || aiFilledFields.has(field)
  const aiRingClass = (field: string) =>
    isAiField(field) ? 'ring-2 ring-[var(--input-ai)] transition-all duration-300' : 'transition-all duration-300'

  // industrial variant 的基础样式
  const roundedClass = isIndustrial ? 'rounded-none' : 'rounded-md'
  const roundedLgClass = isIndustrial ? 'rounded-none' : 'rounded-lg'
  const monoDataClass = isIndustrial ? 'font-mono' : ''

  // Files tab state (保持本地)
  const [files, setFiles] = useState<SkillFileItem[]>([])
  const [selectedFile, setSelectedFile] = useState<SkillFileItem | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [newFileDir, setNewFileDir] = useState('references')
  const [newFileName, setNewFileName] = useState('')
  const [fileSaving, setFileSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [showValidation, setShowValidation] = useState(false)

  // AI tab state (保持本地)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiChangeSet, setAiChangeSet] = useState<{
    skillPatch: Record<string, unknown>
    fileOps: Array<{ op: string; path: string; mime?: string; content_text?: string }>
    notes?: string
  } | null>(null)
  const [aiLintPreview, setAiLintPreview] = useState<{ valid: boolean; errors: Array<{ field: string; message: string }> } | null>(null)
  const [aiApplying, setAiApplying] = useState(false)
  const [aiApplied, setAiApplied] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiPreviewFile, setAiPreviewFile] = useState<string | null>(null)

  const ALLOWED_DIRS = ['references', 'examples', 'scripts', 'assets', 'templates']

  const loadFiles = useCallback(async () => {
    if (!skillId) return
    const res = await fetch(`/api/skills/${skillId}/files`)
    if (res.ok) setFiles(await res.json())
  }, [skillId])

  useEffect(() => {
    if (skillId) loadFiles()
  }, [skillId, loadFiles])

  async function handleCreateFile() {
    if (!skillId || !newFileName.trim()) return
    const filePath = `${newFileDir}/${newFileName.trim()}`
    setFileSaving(true)
    setUIField('error', '')
    try {
      const res = await fetch(`/api/skills/${skillId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '', mime: guessMime(newFileName), isBinary: false }),
      })
      if (res.ok) {
        setNewFileName('')
        await loadFiles()
      } else {
        const data = await res.json().catch(() => ({}))
        setUIField('error', data.error || `Failed to create file (${res.status})`)
      }
    } catch {
      setUIField('error', 'Network error creating file')
    }
    setFileSaving(false)
  }

  async function handleSelectFile(f: SkillFileItem) {
    if (!skillId) return
    setSelectedFile(f)
    if (!f.isBinary) {
      const res = await fetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(f.path)}`)
      if (res.ok) {
        const data = await res.json()
        setFileContent(data.contentText || '')
      }
    }
  }

  async function handleSaveFile() {
    if (!skillId || !selectedFile) return
    setFileSaving(true)
    await fetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(selectedFile.path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: fileContent }),
    })
    setFileSaving(false)
    await loadFiles()
  }

  async function handleDeleteFile(path: string) {
    if (!skillId || !confirm(`Delete ${path}?`)) return
    await fetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    if (selectedFile?.path === path) { setSelectedFile(null); setFileContent('') }
    await loadFiles()
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!skillId || !e.target.files?.[0]) return
    const file = e.target.files[0]
    const path = `assets/${file.name}`
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      await fetch(`/api/skills/${skillId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content: base64, mime: file.type || 'application/octet-stream', isBinary: true }),
      })
      await loadFiles()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function guessMime(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = { md: 'text/markdown', json: 'application/json', yaml: 'text/yaml', yml: 'text/yaml', sql: 'application/sql', txt: 'text/plain', svg: 'image/svg+xml', png: 'image/png' }
    return map[ext || ''] || 'text/plain'
  }

  const FIELD_TAB: Record<string, string> = {
    title: 'author', summary: 'author', steps: 'author',
    triggers: 'triggers', guardrails: 'guardrails', tests: 'tests',
  }

  async function handleSave() {
    setUIField('error', '')
    if (requiredStatus.filled < requiredStatus.total) {
      setShowValidation(true)
      const first = requiredStatus.checks.find((c) => !c.done)
      if (first) setUIField('activeTab', FIELD_TAB[first.key] || 'author')
      setTimeout(() => setShowValidation(false), 3000)
      return
    }
    setShowValidation(false)
    setUIField('saving', true)
    try {
      const body = { title, summary, inputs, outputs, steps: steps.filter(Boolean), risks, triggers: triggers.filter(Boolean), guardrails: { ...guardrails, stop_conditions: guardrails.stop_conditions.filter(Boolean) }, tests: tests.filter((t) => t.name && t.input && t.expected_output), tags }
      const url = isEdit ? `/api/skills/${skillId}` : '/api/skills'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json()
        setUIField('error', data.error || 'Save failed')
        return
      }
      const data = await res.json()
      router.push(`/skills/${data.id}`)
    } catch {
      setUIField('error', 'Network error')
    } finally {
      setUIField('saving', false)
    }
  }

  async function handleLint() {
    setUIField('lintErrors', [])
    setUIField('lintPassed', false)
    const body = { title, summary, inputs, outputs, steps: steps.filter(Boolean), risks, triggers: triggers.filter(Boolean), guardrails: { ...guardrails, stop_conditions: guardrails.stop_conditions.filter(Boolean) }, tests: tests.filter((t) => t.name && t.input && t.expected_output), tags }
    try {
      const res = await fetch('/api/lint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.valid) {
        setUIField('lintPassed', true)
      } else {
        setUIField('lintErrors', data.errors)
      }
    } catch {
      setUIField('error', 'Lint check failed')
    }
  }

  function handleAddTag() {
    const t = tagInput.trim()
    if (t) { addTag(t); setTagInput('') }
  }

  const tabs = [
    { id: 'author', label: '编写' },
    { id: 'triggers', label: '触发词' },
    { id: 'guardrails', label: '安全护栏' },
    { id: 'tests', label: '测试' },
    { id: 'files', label: '文件' },
    { id: 'enhance', label: 'AI 增强' },
    { id: 'export', label: '导出' },
  ]

  async function handleAiPropose(action: string) {
    if (!skillId) return
    setAiLoading(true)
    setAiError('')
    setAiChangeSet(null)
    setAiLintPreview(null)
    setAiApplied(false)
    setAiPreviewFile(null)
    try {
      const res = await fetch(`/api/skills/${skillId}/ai/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instruction: aiInstruction || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiError(data.error || `AI 建议失败 (${res.status})`)
        return
      }
      setAiChangeSet(data.changeSet)
      setAiLintPreview(data.lintPreview)
    } catch {
      setAiError('调用 AI 时网络错误')
    } finally {
      setAiLoading(false)
    }
  }

  async function handleAiApply() {
    if (!skillId || !aiChangeSet) return
    setAiApplying(true)
    setAiError('')
    try {
      const res = await fetch(`/api/skills/${skillId}/ai/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeSet: aiChangeSet }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiError(data.error || `AI 应用失败 (${res.status})`)
        return
      }
      setAiApplied(true)
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      setAiError('应用变更时网络错误')
    } finally {
      setAiApplying(false)
    }
  }

  const requiredStatus = useMemo(() => {
    const checks = [
      { key: 'title', done: title.trim().length > 0, label: '标题' },
      { key: 'summary', done: summary.trim().length > 0, label: '摘要' },
      { key: 'steps', done: steps.filter((s) => s.trim()).length >= 3, label: '步骤(>=3)' },
      { key: 'triggers', done: triggers.filter((t) => t.trim()).length >= 3, label: '触发词(>=3)' },
      {
        key: 'guardrails',
        done:
          guardrails.stop_conditions.filter((s) => s.trim()).length >= 1 &&
          ['REVIEW', 'BLOCK', 'ASK_HUMAN'].includes(guardrails.escalation),
        label: '安全护栏',
      },
      {
        key: 'tests',
        done: tests.some((t) => t.name.trim() && t.input.trim() && t.expected_output.trim()),
        label: '测试用例',
      },
    ]
    return {
      checks,
      total: checks.length,
      filled: checks.filter((c) => c.done).length,
      missing: checks.filter((c) => !c.done).map((c) => c.label),
    }
  }, [title, summary, steps, triggers, guardrails, tests])

  const filledSteps = useMemo(() => steps.filter((s) => s.trim()).length, [steps])
  const filledTriggers = useMemo(() => triggers.filter((t) => t.trim()).length, [triggers])
  const filledStopConditions = useMemo(() => guardrails.stop_conditions.filter((s) => s.trim()).length, [guardrails.stop_conditions])
  const completeTests = useMemo(
    () => tests.filter((t) => t.name.trim() && t.input.trim() && t.expected_output.trim()).length,
    [tests],
  )

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {}
    if (!title.trim()) errors.title = '标题不能为空'
    if (!summary.trim()) errors.summary = '摘要不能为空'
    if (filledSteps < 3) errors.steps = `步骤至少填写 3 条（当前 ${filledSteps}）`
    if (filledTriggers < 3) errors.triggers = `触发词至少填写 3 条（当前 ${filledTriggers}）`
    if (!['REVIEW', 'BLOCK', 'ASK_HUMAN'].includes(guardrails.escalation) || filledStopConditions < 1) {
      errors.guardrails = '至少填写 1 个停止条件，并设置有效升级策略'
    }
    if (completeTests < 1) errors.tests = '至少填写 1 个完整测试用例（名称、输入、预期输出）'
    return errors
  }, [title, summary, guardrails.escalation, filledSteps, filledTriggers, filledStopConditions, completeTests])

  const shouldShowFieldError = (field: string) => showValidation || userEdited.has(field)
  const getFieldError = (field: string) => (shouldShowFieldError(field) ? fieldErrors[field] : undefined)
  const getFieldState = (field: string, done = false): FieldVisualState => {
    if (getFieldError(field)) return 'error'
    if (isAiField(field)) return 'ai'
    if (done) return 'success'
    return 'default'
  }

  const tabStatus: Record<string, boolean | undefined> = useMemo(() => {
    const c = requiredStatus.checks
    return {
      author: c[0].done && c[1].done && c[2].done,
      triggers: c[3].done,
      guardrails: c[4].done,
      tests: c[5].done,
    }
  }, [requiredStatus])

  return (
    <div className={isIndustrial ? 'px-5 py-4' : 'mx-auto max-w-4xl px-4 py-8'}>
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <h1 className={`${isIndustrial ? 'text-base' : 'text-2xl'} font-semibold`}>{isEdit ? '编辑 Skill' : '新建 Skill'}</h1>
        {!isEdit && (
          <span className="text-[11px] font-mono" style={{ color: requiredStatus.filled === requiredStatus.total ? 'var(--success)' : 'var(--muted-foreground)' }}>
            {requiredStatus.filled}/{requiredStatus.total} {requiredStatus.filled === requiredStatus.total ? '就绪' : '必填'}
          </span>
        )}
      </div>

      {/* Segmented Progress Bar */}
      {!isEdit && (
        <div className="flex gap-1 mb-5">
          {requiredStatus.checks.map((check) => (
            <div key={check.key} className="flex-1 group relative">
              <div
                className="h-1 rounded-full transition-all duration-500"
                style={{ background: check.done ? 'var(--success)' : 'var(--border)' }}
              />
              <span className="absolute top-2 left-0 text-[9px] font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ color: 'var(--muted-foreground)' }}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className={`mb-4 ${roundedLgClass} p-3 text-sm flex items-center gap-2`} style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-0.5 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setUIField('activeTab', tab.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors relative flex items-center gap-1.5 ${isIndustrial ? 'font-mono' : ''}`}
            style={{
              color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {tab.label}
            {tabStatus[tab.id] !== undefined && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: tabStatus[tab.id] ? 'var(--success)' : 'var(--warning)' }}
              />
            )}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-1 right-1 h-0.5" style={{ background: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Author Tab */}
      {activeTab === 'author' && (
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
                <span key={tag} className={`inline-flex items-center gap-1 ${roundedClass} px-2 py-0.5 text-xs font-medium`} style={{ background: 'var(--card)', color: 'var(--muted-foreground)' }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} className="opacity-50 hover:opacity-100">&times;</button>
                </span>
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
              <button onClick={handleAddTag} className={`${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>添加</button>
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
                  {steps.length > 3 && <button onClick={() => { markUserEdited('steps'); removeStep(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
                </div>
              )
            })}
            {steps.length < 7 && <button onClick={addStep} className="inline-flex items-center gap-1 text-xs hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-3 w-3" /> 添加步骤</button>}
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
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
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
                  {triggers.length > 3 && <button onClick={() => { markUserEdited('triggers'); removeTrigger(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
                </div>
              )
            })}
          </FormField>
          <button onClick={addTrigger} className="inline-flex items-center gap-1 text-sm hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-4 w-4" /> 添加触发词</button>
          {triggers.filter(Boolean).length >= 3 && (
            <div className={`mt-4 ${roundedLgClass} p-3 text-sm`} style={{ background: 'var(--muted)' }}>
              <p className="font-medium mb-1">预览（描述摘录）：</p>
              <p style={{ color: 'var(--muted-foreground)' }}>触发短语：{triggers.filter(Boolean).map((t) => `"${t}"`).join(', ')}</p>
            </div>
          )}
        </div>
      )}

      {/* Guardrails Tab */}
      {activeTab === 'guardrails' && (
        <div className="space-y-4">
          <FormField
            label="允许的工具"
            hint="限制可调用工具可以降低风险。"
            count={{ current: guardrails.allowed_tools.length }}
            status={guardrails.allowed_tools.length > 0 ? 'success' : 'default'}
          >
            <div className="flex flex-wrap gap-1 mb-2">
              {guardrails.allowed_tools.map((tool) => (
                <span key={tool} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                  {tool}
                  <button onClick={() => removeAllowedTool(tool)} className="opacity-60 hover:opacity-100">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input id="tool-input" density="compact" className={`flex-1 ${roundedClass}`} placeholder="例如 Read, Write, Bash" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllowedTool((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }} />
              <button onClick={() => { const el = document.getElementById('tool-input') as HTMLInputElement; addAllowedTool(el.value); el.value = '' }} className={`${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>添加</button>
            </div>
          </FormField>
          <div className="flex items-center justify-between py-1">
            <label className="text-sm font-medium">禁用模型调用</label>
            <button onClick={() => setGuardrails({ ...guardrails, disable_model_invocation: !guardrails.disable_model_invocation })} className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors" style={{ background: guardrails.disable_model_invocation ? 'var(--accent)' : 'var(--muted)' }}>
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${guardrails.disable_model_invocation ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-1">
            <label className="text-sm font-medium">用户可调用</label>
            <button onClick={() => setGuardrails({ ...guardrails, user_invocable: !guardrails.user_invocable })} className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors" style={{ background: guardrails.user_invocable ? 'var(--accent)' : 'var(--muted)' }}>
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${guardrails.user_invocable ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <FormField
            label="升级策略"
            required
            error={getFieldError('guardrails')}
            status={getFieldState('guardrails', filledStopConditions >= 1)}
          >
            <select value={guardrails.escalation} onChange={(e) => { markUserEdited('guardrails'); setGuardrails({ ...guardrails, escalation: e.target.value as SkillGuardrails['escalation'] }) }} className={`h-10 w-full ${roundedClass} border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm shadow-[var(--shadow-sm)] transition-colors focus-visible:border-[var(--input-ring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--input-ring)] ${aiRingClass('guardrails')}`}>
              <option value="ASK_HUMAN">ASK_HUMAN</option>
              <option value="REVIEW">REVIEW</option>
              <option value="BLOCK">BLOCK</option>
            </select>
          </FormField>
          <FormField
            label="停止条件"
            required
            hint="至少填写 1 条，明确停止触发点。"
            error={getFieldError('guardrails')}
            count={{ current: filledStopConditions, recommended: 1 }}
            status={getFieldState('guardrails', filledStopConditions >= 1)}
          >
            {guardrails.stop_conditions.map((sc, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Input
                  value={sc}
                  density="compact"
                  onChange={(e) => { markUserEdited('guardrails'); updateStopCondition(i, e.target.value) }}
                  state={!sc.trim() && shouldShowFieldError('guardrails') ? 'error' : getFieldState('guardrails', sc.trim().length > 0)}
                  className={`flex-1 ${roundedClass} ${monoDataClass}`}
                  placeholder="停止条件..."
                />
                {guardrails.stop_conditions.length > 1 && <button onClick={() => { markUserEdited('guardrails'); removeStopCondition(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            <button onClick={addStopCondition} className="inline-flex items-center gap-1 text-xs hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-3 w-3" /> 添加条件</button>
          </FormField>
        </div>
      )}

      {/* Tests Tab */}
      {activeTab === 'tests' && (
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
                {tests.length > 1 && <button onClick={() => { markUserEdited('tests'); removeTest(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
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
          <button onClick={addTest} className="inline-flex items-center gap-1 text-sm hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-4 w-4" /> 添加测试用例</button>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          {!skillId ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>请先保存 Skill 以管理支持文件。</p>
          ) : (
            <>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>目录</label>
                  <select value={newFileDir} onChange={(e) => setNewFileDir(e.target.value)} className={`${roundedClass} border px-2 py-1.5 text-sm`}>
                    {ALLOWED_DIRS.map((d) => <option key={d} value={d}>{d}/</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>文件名</label>
                  <Input value={newFileName} density="compact" onChange={(e) => setNewFileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateFile())} className={`w-full ${roundedClass}`} placeholder="例如 rules.md" />
                </div>
                <button onClick={handleCreateFile} disabled={fileSaving || !newFileName.trim()} className={`${roundedLgClass} px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50`} style={{ background: 'var(--foreground)' }}>
                  <Plus className="inline h-4 w-4 mr-1" />创建
                </button>
                <label className={`cursor-pointer ${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                  <Upload className="inline h-4 w-4 mr-1" />上传
                  <input type="file" className="hidden" onChange={handleUploadFile} />
                </label>
              </div>

              <div className="flex gap-4 min-h-[300px]">
                <div className={`w-1/3 ${roundedClass} border p-2 overflow-auto`}>
                  {ALLOWED_DIRS.map((dir) => {
                    const dirFiles = files.filter((f) => f.path.startsWith(dir + '/'))
                    if (dirFiles.length === 0) return null
                    return (
                      <div key={dir} className="mb-3">
                        <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>{dir}/</p>
                        {dirFiles.map((f) => (
                          <div key={f.path} className={`flex items-center justify-between ${roundedClass} px-2 py-1 text-sm cursor-pointer transition-colors`} style={{ background: selectedFile?.path === f.path ? 'var(--muted)' : 'transparent' }}>
                            <button onClick={() => handleSelectFile(f)} className="flex items-center gap-1 truncate flex-1 text-left">
                              <File className="h-3 w-3 shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                              <span className="truncate">{f.path.split('/').slice(1).join('/')}</span>
                            </button>
                            <button onClick={() => handleDeleteFile(f.path)} className="shrink-0 ml-1 opacity-30 hover:opacity-100" style={{ color: 'var(--danger)' }}>
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {files.length === 0 && <p className="text-xs p-2" style={{ color: 'var(--muted-foreground)' }}>暂无文件</p>}
                </div>

                <div className={`flex-1 ${roundedClass} border p-2`}>
                  {selectedFile ? (
                    selectedFile.isBinary ? (
                      <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>二进制文件：{selectedFile.path} ({selectedFile.mime})</p>
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{selectedFile.path}</span>
                          <button onClick={handleSaveFile} disabled={fileSaving} className={`${roundedClass} px-3 py-1 text-xs font-medium text-white disabled:opacity-50`} style={{ background: 'var(--foreground)' }}>
                            {fileSaving ? '保存中...' : '保存'}
                          </button>
                        </div>
                        <Textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} className={`flex-1 w-full rounded min-h-[250px] font-mono resize-none`} />
                      </div>
                    )
                  ) : (
                    <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>选择文件进行编辑</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Enhance Tab */}
      {activeTab === 'enhance' && (
        <div className="space-y-4">
          {!skillId ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>请先保存 Skill 以使用增强功能。</p>
          ) : (
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
                <button
                  onClick={() => handleAiPropose('update-skill')}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 py-2 text-sm font-medium text-white disabled:opacity-50`}
                  style={{ background: 'var(--accent)' }}
                  data-testid="ai-improve-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  优化
</button>
                <button
                  onClick={() => handleAiPropose('fix-lint')}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 py-2 text-sm font-medium text-white disabled:opacity-50`}
                  style={{ background: 'var(--warning)' }}
                  data-testid="ai-fix-lint-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                  修复校验
                </button>
                <button
                  onClick={() => handleAiPropose('create-supporting-files')}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 py-2 text-sm font-medium text-white disabled:opacity-50`}
                  style={{ background: 'var(--success)' }}
                  data-testid="ai-gen-files-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
                  生成文件
                </button>
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
                            <button
                              onClick={() => setAiPreviewFile(aiPreviewFile === fop.path ? null : fop.path)}
                              className="font-mono text-xs text-blue-600 hover:underline flex items-center gap-1"
                              data-testid={`ai-file-${fop.path}`}
                            >
                              <Eye className="h-3 w-3" /> {fop.path}
                            </button>
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
                          {aiLintPreview.errors.map((e, i) => (
                            <li key={i} className="text-xs text-amber-600">
                              <span className="font-mono bg-amber-100 px-1 rounded">{e.field}</span> {e.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleAiApply}
                      disabled={aiApplying || aiApplied || (aiLintPreview !== null && !aiLintPreview.valid)}
                      className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-6 py-2 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-[0.97]`}
                      style={{ background: 'var(--foreground)' }}
                      data-testid="ai-apply-btn"
                    >
                      {aiApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {aiApplied ? '已应用' : '应用变更'}
                    </button>
                    <button
                      onClick={() => { setAiChangeSet(null); setAiLintPreview(null); setAiPreviewFile(null) }}
                      className={`${roundedLgClass} border px-4 py-2 text-sm font-medium transition-colors`}
                      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                    >
                      放弃
                    </button>
                  </div>

                  {aiApplied && (
                    <div className={`${roundedLgClass} p-3 text-sm flex items-center gap-2`} style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                      <CheckCircle className="h-4 w-4" /> 变更已成功应用，正在刷新...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>导出前请先运行校验检查，所有验证必须通过。</p>
          <button
            onClick={handleLint}
            className={`${roundedLgClass} px-4 py-2 text-sm font-medium text-white transition-colors`}
            style={{ background: 'var(--foreground)' }}
          >
            运行校验
          </button>
          {lintErrors.length > 0 && (
            <div className={`${roundedLgClass} p-4`} style={{ background: 'var(--danger-light)' }}>
              <p className="font-medium mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--danger)' }}><AlertCircle className="h-4 w-4" /> 校验失败</p>
              <ul className="space-y-1">
                {lintErrors.map((e, i) => (
                  <li key={i} className="text-sm" style={{ color: 'var(--danger)' }}>
                    <span className="font-mono text-xs rounded px-1.5 py-0.5" style={{ background: 'var(--danger-light)' }}>{e.field}</span> {e.message}
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
                  <a href={`/api/skills/${skillId}/export.zip`} className={`${roundedLgClass} px-4 py-2 text-sm font-medium text-white`} style={{ background: 'var(--accent)' }}>
                    导出 ZIP
                  </a>
                  <a href={`/api/skills/${skillId}/export.md`} className={`${roundedLgClass} border px-4 py-2 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    导出 MD
                  </a>
                  <a href={`/api/skills/${skillId}/export.json`} className={`${roundedLgClass} border px-4 py-2 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    导出 JSON
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save Area */}
      <div className="sticky bottom-0 mt-8 border-t pt-4 pb-4 -mx-5 px-5 relative" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
        {showValidation && requiredStatus.filled < requiredStatus.total && (
          <div className="absolute bottom-full left-5 right-5 mb-2 animate-in">
            <div className={`${roundedClass} px-3 py-2 text-xs flex items-center gap-2 shadow-md`} style={{ background: 'var(--foreground)', color: 'var(--background)' }}>
              <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--warning)' }} />
              <span>
                未完成：{requiredStatus.checks.filter((c) => !c.done).slice(0, 2).map((c) => c.label).join('、')}
                {requiredStatus.total - requiredStatus.filled > 2 && ` 等${requiredStatus.total - requiredStatus.filled}项`}
              </span>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`${roundedLgClass} px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-[0.97]`}
            style={{ background: 'var(--accent)' }}
          >
            {saving ? '保存中...' : isEdit ? '更新 Skill' : '创建 Skill'}
          </button>
          <button
            onClick={() => router.back()}
            className={`${roundedLgClass} border px-6 py-2.5 text-sm font-medium transition-colors`}
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
