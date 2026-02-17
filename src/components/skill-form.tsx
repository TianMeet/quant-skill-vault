'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { SkillData } from '@/lib/types'
import { useSkillStore } from '@/lib/stores/skill-store'
import { Button } from '@/components/ui/button'
import { SkillFormAuthorTab } from '@/components/skill-form/author-tab'
import { SkillFormEnhanceTab, type AiChangeSet, type AiLintPreview } from '@/components/skill-form/enhance-tab'
import { SkillFormExportTab } from '@/components/skill-form/export-tab'
import { SkillFormFilesTab, type SkillFileItem } from '@/components/skill-form/files-tab'
import { SkillFormGuardrailsTab } from '@/components/skill-form/guardrails-tab'
import { SkillFormTestsTab } from '@/components/skill-form/tests-tab'
import { SkillFormTriggersTab } from '@/components/skill-form/triggers-tab'
import { useSkillFormValidation } from '@/components/skill-form/use-skill-form-validation'
import { AlertCircle } from 'lucide-react'

interface SkillFormProps {
  initialData?: SkillData & { tags?: string[] }
  skillId?: number
  variant?: 'default' | 'industrial'
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
  const [aiChangeSet, setAiChangeSet] = useState<AiChangeSet | null>(null)
  const [aiLintPreview, setAiLintPreview] = useState<AiLintPreview | null>(null)
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

  const {
    requiredStatus,
    filledSteps,
    filledTriggers,
    filledStopConditions,
    completeTests,
    isAiField,
    aiRingClass,
    shouldShowFieldError,
    getFieldError,
    getFieldState,
    tabStatus,
  } = useSkillFormValidation({
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
  })

  return (
    <div className={isIndustrial ? 'min-h-full px-5 py-4 flex flex-col' : 'mx-auto max-w-4xl px-4 py-8'}>
      <div className="flex-1">
      <div
        className={isIndustrial ? '-mx-5 sticky top-0 z-20 mb-5 px-5 pb-3 pt-4' : 'mb-5'}
        style={
          isIndustrial
            ? {
                background: 'color-mix(in srgb, var(--background) 92%, transparent)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }
            : undefined
        }
      >
        {/* Header */}
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className={`${isIndustrial ? 'text-base' : 'text-2xl'} font-semibold`}>{isEdit ? '编辑 Skill' : '新建 Skill'}</h1>
          {!isEdit && (
            <span className="text-[11px] font-mono" style={{ color: requiredStatus.filled === requiredStatus.total ? 'var(--success)' : 'var(--muted-foreground)' }}>
              {requiredStatus.filled}/{requiredStatus.total} {requiredStatus.filled === requiredStatus.total ? '就绪' : '必填'}
            </span>
          )}
        </div>

        {/* Segmented Progress Bar */}
        {!isEdit && (
          <div className="mb-4 flex gap-1">
            {requiredStatus.checks.map((check) => (
              <div key={check.key} className="group relative flex-1">
                <div
                  className="h-1 rounded-full transition-all duration-500"
                  style={{ background: check.done ? 'var(--success)' : 'var(--border)' }}
                />
                <span className="pointer-events-none absolute left-0 top-2 text-[9px] font-mono opacity-0 transition-opacity group-hover:opacity-100" style={{ color: 'var(--muted-foreground)' }}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className={`mb-4 ${roundedLgClass} flex items-center gap-2 p-3 text-sm`} style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 border-b" style={{ borderColor: 'var(--border)' }}>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setUIField('activeTab', tab.id)}
              variant="ghost"
              className={`relative flex h-auto items-center gap-1.5 rounded-none px-3 py-2 text-xs font-medium transition-colors ${isIndustrial ? 'font-mono' : ''}`}
              style={{
                color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
            >
              {tab.label}
              {tabStatus[tab.id] !== undefined && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: tabStatus[tab.id] ? 'var(--success)' : 'var(--warning)' }}
                />
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1 right-1 h-0.5" style={{ background: 'var(--accent)' }} />
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Author Tab */}
      {activeTab === 'author' && (
        <SkillFormAuthorTab
          roundedClass={roundedClass}
          roundedLgClass={roundedLgClass}
          monoDataClass={monoDataClass}
          title={title}
          summary={summary}
          tags={tags}
          tagInput={tagInput}
          inputs={inputs}
          outputs={outputs}
          steps={steps}
          risks={risks}
          filledSteps={filledSteps}
          setTagInput={setTagInput}
          handleAddTag={handleAddTag}
          removeTag={removeTag}
          markUserEdited={markUserEdited}
          setField={(field, value) => setField(field, value)}
          updateStep={updateStep}
          removeStep={removeStep}
          addStep={addStep}
          shouldShowFieldError={shouldShowFieldError}
          getFieldError={getFieldError}
          getFieldState={getFieldState}
          isAiField={isAiField}
          aiRingClass={aiRingClass}
        />
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
        <SkillFormTriggersTab
          roundedLgClass={roundedLgClass}
          monoDataClass={monoDataClass}
          triggers={triggers}
          filledTriggers={filledTriggers}
          markUserEdited={markUserEdited}
          updateTrigger={updateTrigger}
          removeTrigger={removeTrigger}
          addTrigger={addTrigger}
          shouldShowFieldError={shouldShowFieldError}
          isAiField={isAiField}
          getFieldError={getFieldError}
          getFieldState={getFieldState}
        />
      )}

      {/* Guardrails Tab */}
      {activeTab === 'guardrails' && (
        <SkillFormGuardrailsTab
          roundedClass={roundedClass}
          roundedLgClass={roundedLgClass}
          monoDataClass={monoDataClass}
          guardrails={guardrails}
          filledStopConditions={filledStopConditions}
          markUserEdited={markUserEdited}
          setGuardrails={setGuardrails}
          addAllowedTool={addAllowedTool}
          removeAllowedTool={removeAllowedTool}
          updateStopCondition={updateStopCondition}
          removeStopCondition={removeStopCondition}
          addStopCondition={addStopCondition}
          shouldShowFieldError={shouldShowFieldError}
          getFieldError={getFieldError}
          getFieldState={getFieldState}
          aiRingClass={aiRingClass}
        />
      )}

      {/* Tests Tab */}
      {activeTab === 'tests' && (
        <SkillFormTestsTab
          roundedClass={roundedClass}
          monoDataClass={monoDataClass}
          tests={tests}
          completeTests={completeTests}
          markUserEdited={markUserEdited}
          updateTest={updateTest}
          removeTest={removeTest}
          addTest={addTest}
          shouldShowFieldError={shouldShowFieldError}
          getFieldError={getFieldError}
          getFieldState={getFieldState}
          aiRingClass={aiRingClass}
        />
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          <SkillFormFilesTab
            skillId={skillId}
            roundedClass={roundedClass}
            roundedLgClass={roundedLgClass}
            ALLOWED_DIRS={ALLOWED_DIRS}
            files={files}
            selectedFile={selectedFile}
            fileContent={fileContent}
            newFileDir={newFileDir}
            setNewFileDir={setNewFileDir}
            newFileName={newFileName}
            setNewFileName={setNewFileName}
            fileSaving={fileSaving}
            handleCreateFile={handleCreateFile}
            handleUploadFile={handleUploadFile}
            handleSelectFile={handleSelectFile}
            handleDeleteFile={handleDeleteFile}
            handleSaveFile={handleSaveFile}
            setFileContent={setFileContent}
          />
        </div>
      )}

      {/* Enhance Tab */}
      {activeTab === 'enhance' && (
        <div className="space-y-4">
          <SkillFormEnhanceTab
            skillId={skillId}
            roundedClass={roundedClass}
            roundedLgClass={roundedLgClass}
            aiInstruction={aiInstruction}
            setAiInstruction={setAiInstruction}
            aiLoading={aiLoading}
            aiError={aiError}
            aiChangeSet={aiChangeSet}
            aiLintPreview={aiLintPreview}
            aiApplying={aiApplying}
            aiApplied={aiApplied}
            aiPreviewFile={aiPreviewFile}
            setAiPreviewFile={setAiPreviewFile}
            handleAiPropose={handleAiPropose}
            handleAiApply={handleAiApply}
            clearAiChangeSet={() => { setAiChangeSet(null); setAiLintPreview(null); setAiPreviewFile(null) }}
          />
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <SkillFormExportTab
          roundedLgClass={roundedLgClass}
          lintErrors={lintErrors}
          lintPassed={lintPassed}
          isEdit={isEdit}
          skillId={skillId}
          handleLint={handleLint}
        />
      )}
      </div>

      {/* Save Area */}
      <div
        className={isIndustrial ? 'sticky bottom-0 z-30 -mx-5 mt-4 border-t px-5 py-3 relative shadow-[0_-6px_20px_rgba(0,0,0,0.08)]' : 'sticky bottom-0 z-30 mt-4 border-t px-4 py-3 relative shadow-[0_-6px_20px_rgba(0,0,0,0.08)]'}
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--background) 94%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
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
          <Button
            onClick={handleSave}
            disabled={saving}
            type="button"
            className={`${roundedLgClass} px-6`}
          >
            {saving ? '保存中...' : isEdit ? '更新 Skill' : '创建 Skill'}
          </Button>
          <Button
            onClick={() => router.back()}
            type="button"
            variant="outline"
            className={`${roundedLgClass} px-6`}
          >
            取消
          </Button>
        </div>
      </div>
    </div>
  )
}
