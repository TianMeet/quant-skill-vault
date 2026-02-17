'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { SkillData, SkillTestCase, SkillGuardrails } from '@/lib/types'
import { useSkillStore } from '@/lib/stores/skill-store'
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
    activeField, aiFilledFields,
    setField, setUIField, markUserEdited, setActiveField,
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
  const aiRingClass = (field: string) => {
    if (activeField === field) return 'ring-2 ring-purple-500 transition-all duration-300'
    if (aiFilledFields.has(field)) return 'ring-2 ring-purple-500 transition-all duration-300'
    return 'transition-all duration-300'
  }

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

  useEffect(() => {
    if (skillId) loadFiles()
  }, [skillId])

  async function loadFiles() {
    if (!skillId) return
    const res = await fetch(`/api/skills/${skillId}/files`)
    if (res.ok) setFiles(await res.json())
  }

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
    { id: 'author', label: 'Author' },
    { id: 'triggers', label: 'Triggers' },
    { id: 'guardrails', label: 'Guardrails' },
    { id: 'tests', label: 'Tests' },
    { id: 'files', label: 'Files' },
    { id: 'enhance', label: 'Enhance' },
    { id: 'export', label: 'Export' },
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
        setAiError(data.error || `AI propose failed (${res.status})`)
        return
      }
      setAiChangeSet(data.changeSet)
      setAiLintPreview(data.lintPreview)
    } catch {
      setAiError('Network error calling AI')
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
        setAiError(data.error || `AI apply failed (${res.status})`)
        return
      }
      setAiApplied(true)
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      setAiError('Network error applying changes')
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
        <h1 className={`${isIndustrial ? 'text-base' : 'text-2xl'} font-semibold`}>{isEdit ? 'Edit Skill' : 'New Skill'}</h1>
        {!isEdit && (
          <span className="text-[11px] font-mono" style={{ color: requiredStatus.filled === requiredStatus.total ? 'var(--success)' : 'var(--muted-foreground)' }}>
            {requiredStatus.filled}/{requiredStatus.total} {requiredStatus.filled === requiredStatus.total ? 'Ready' : 'required'}
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
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input value={title} onChange={(e) => { markUserEdited('title'); setField('title', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-2.5 text-base font-medium ${monoDataClass} ${aiRingClass('title')}`} placeholder="Skill title" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Summary</label>
            <textarea value={summary} onChange={(e) => { markUserEdited('summary'); setField('summary', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-2 text-sm ${monoDataClass} ${aiRingClass('summary')}`} rows={2} placeholder="Brief description of what this skill does" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tags</label>
            <div className={`flex flex-wrap gap-1 mb-2 ${aiRingClass('tags')}`}>
              {tags.map((tag) => (
                <span key={tag} className={`inline-flex items-center gap-1 ${roundedClass} px-2 py-0.5 text-xs font-medium`} style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} className="opacity-50 hover:opacity-100">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())} className={`flex-1 ${roundedClass} border px-3 py-1.5 text-sm`} placeholder="Add tag..." />
              <button onClick={handleAddTag} className={`${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>Add</button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Inputs (Markdown)</label>
            <textarea value={inputs} onChange={(e) => { markUserEdited('inputs'); setField('inputs', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-2 text-sm font-mono ${aiRingClass('inputs')}`} rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Outputs (Markdown)</label>
            <textarea value={outputs} onChange={(e) => { markUserEdited('outputs'); setField('outputs', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-2 text-sm font-mono ${aiRingClass('outputs')}`} rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Steps (3-7)</label>
            {steps.map((step, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-medium" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{i + 1}</span>
                <input value={step} onChange={(e) => { markUserEdited('steps'); updateStep(i, e.target.value) }} className={`flex-1 ${roundedLgClass} border px-3 py-1.5 text-sm ${monoDataClass} ${aiRingClass('steps')}`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }} placeholder={`Step ${i + 1}`} />
                {steps.length > 3 && <button onClick={() => { markUserEdited('steps'); removeStep(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {steps.length < 7 && <button onClick={addStep} className="inline-flex items-center gap-1 text-xs hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-3 w-3" /> Add step</button>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Risks (Markdown)</label>
            <textarea value={risks} onChange={(e) => { markUserEdited('risks'); setField('risks', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-2 text-sm font-mono ${aiRingClass('risks')}`} rows={3} />
          </div>
        </div>
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Trigger phrases will be included in the exported description (wrapped in double quotes). Minimum 3 required.</p>
          {triggers.map((trigger, i) => (
            <div key={i} className="flex gap-2">
              <input value={trigger} onChange={(e) => { markUserEdited('triggers'); updateTrigger(i, e.target.value) }} className={`flex-1 ${roundedLgClass} border px-3 py-2 text-sm ${monoDataClass} ${aiRingClass('triggers')}`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }} placeholder={`Trigger phrase ${i + 1}`} />
              {triggers.length > 3 && <button onClick={() => { markUserEdited('triggers'); removeTrigger(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          <button onClick={addTrigger} className="inline-flex items-center gap-1 text-sm hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-4 w-4" /> Add trigger</button>
          {triggers.filter(Boolean).length >= 3 && (
            <div className={`mt-4 ${roundedLgClass} p-3 text-sm`} style={{ background: 'var(--muted)' }}>
              <p className="font-medium mb-1">Preview (description excerpt):</p>
              <p style={{ color: 'var(--muted-foreground)' }}>Trigger phrases: {triggers.filter(Boolean).map((t) => `"${t}"`).join(', ')}</p>
            </div>
          )}
        </div>
      )}

      {/* Guardrails Tab */}
      {activeTab === 'guardrails' && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Allowed Tools</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {guardrails.allowed_tools.map((tool) => (
                <span key={tool} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  {tool}
                  <button onClick={() => removeAllowedTool(tool)} className="text-blue-400 hover:text-blue-600">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input id="tool-input" className={`flex-1 ${roundedClass} border px-3 py-1.5 text-sm`} placeholder="e.g. Read, Write, Bash" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllowedTool((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }} />
              <button onClick={() => { const el = document.getElementById('tool-input') as HTMLInputElement; addAllowedTool(el.value); el.value = '' }} className={`${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>Add</button>
            </div>
          </div>
          <div className="flex items-center justify-between py-1">
            <label className="text-sm font-medium">Disable Model Invocation</label>
            <button onClick={() => setGuardrails({ ...guardrails, disable_model_invocation: !guardrails.disable_model_invocation })} className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors" style={{ background: guardrails.disable_model_invocation ? 'var(--accent)' : 'var(--muted)' }}>
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${guardrails.disable_model_invocation ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-1">
            <label className="text-sm font-medium">User Invocable</label>
            <button onClick={() => setGuardrails({ ...guardrails, user_invocable: !guardrails.user_invocable })} className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors" style={{ background: guardrails.user_invocable ? 'var(--accent)' : 'var(--muted)' }}>
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${guardrails.user_invocable ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Escalation</label>
            <select value={guardrails.escalation} onChange={(e) => { markUserEdited('guardrails'); setGuardrails({ ...guardrails, escalation: e.target.value as SkillGuardrails['escalation'] }) }} className={`${roundedClass} border px-3 py-2 text-sm ${aiRingClass('guardrails')}`}>
              <option value="ASK_HUMAN">ASK_HUMAN</option>
              <option value="REVIEW">REVIEW</option>
              <option value="BLOCK">BLOCK</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Stop Conditions (min 1)</label>
            {guardrails.stop_conditions.map((sc, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input value={sc} onChange={(e) => { markUserEdited('guardrails'); updateStopCondition(i, e.target.value) }} className={`flex-1 ${roundedClass} border px-3 py-1.5 text-sm ${monoDataClass} ${aiRingClass('guardrails')}`} placeholder="Stop condition..." />
                {guardrails.stop_conditions.length > 1 && <button onClick={() => { markUserEdited('guardrails'); removeStopCondition(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            <button onClick={addStopCondition} className="inline-flex items-center gap-1 text-xs hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-3 w-3" /> Add condition</button>
          </div>
        </div>
      )}

      {/* Tests Tab */}
      {activeTab === 'tests' && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Define test cases (minimum 1). Each test has a name, input, and expected output.</p>
          {tests.map((test, i) => (
            <div key={i} className={`${roundedClass} border p-3 space-y-2 ${aiRingClass('tests')}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Test {i + 1}</span>
                {tests.length > 1 && <button onClick={() => { markUserEdited('tests'); removeTest(i) }} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <input value={test.name} onChange={(e) => { markUserEdited('tests'); updateTest(i, 'name', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-1.5 text-sm ${monoDataClass}`} placeholder="Test name" />
              <textarea value={test.input} onChange={(e) => { markUserEdited('tests'); updateTest(i, 'input', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-1.5 text-sm font-mono`} rows={2} placeholder="Input" />
              <textarea value={test.expected_output} onChange={(e) => { markUserEdited('tests'); updateTest(i, 'expected_output', e.target.value) }} className={`w-full ${roundedClass} border px-3 py-1.5 text-sm font-mono`} rows={2} placeholder="Expected output" />
            </div>
          ))}
          <button onClick={addTest} className="inline-flex items-center gap-1 text-sm hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-4 w-4" /> Add test case</button>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          {!skillId ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Save the skill first to manage supporting files.</p>
          ) : (
            <>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Directory</label>
                  <select value={newFileDir} onChange={(e) => setNewFileDir(e.target.value)} className={`${roundedClass} border px-2 py-1.5 text-sm`}>
                    {ALLOWED_DIRS.map((d) => <option key={d} value={d}>{d}/</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Filename</label>
                  <input value={newFileName} onChange={(e) => setNewFileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateFile())} className={`w-full ${roundedClass} border px-3 py-1.5 text-sm`} placeholder="e.g. rules.md" />
                </div>
                <button onClick={handleCreateFile} disabled={fileSaving || !newFileName.trim()} className={`${roundedLgClass} px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50`} style={{ background: 'var(--foreground)' }}>
                  <Plus className="inline h-4 w-4 mr-1" />Create
                </button>
                <label className={`cursor-pointer ${roundedLgClass} border px-3 py-1.5 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                  <Upload className="inline h-4 w-4 mr-1" />Upload
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
                  {files.length === 0 && <p className="text-xs p-2" style={{ color: 'var(--muted-foreground)' }}>No files yet</p>}
                </div>

                <div className={`flex-1 ${roundedClass} border p-2`}>
                  {selectedFile ? (
                    selectedFile.isBinary ? (
                      <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>Binary file: {selectedFile.path} ({selectedFile.mime})</p>
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{selectedFile.path}</span>
                          <button onClick={handleSaveFile} disabled={fileSaving} className={`${roundedClass} px-3 py-1 text-xs font-medium text-white disabled:opacity-50`} style={{ background: 'var(--foreground)' }}>
                            {fileSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        <textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} className={`flex-1 w-full rounded border px-3 py-2 text-sm font-mono resize-none min-h-[250px]`} />
                      </div>
                    )
                  ) : (
                    <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>Select a file to edit</p>
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
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Save the skill first to use enhancement features.</p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Instruction (optional)</label>
                <textarea
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  className={`w-full ${roundedClass} border px-3 py-2 text-sm`}
                  rows={2}
                  placeholder="e.g. Make the summary more concise, add error handling steps..."
                  data-testid="ai-instruction"
                />
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
                  Improve
                </button>
                <button
                  onClick={() => handleAiPropose('fix-lint')}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 py-2 text-sm font-medium text-white disabled:opacity-50`}
                  style={{ background: 'var(--warning)' }}
                  data-testid="ai-fix-lint-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                  Fix Lint
                </button>
                <button
                  onClick={() => handleAiPropose('create-supporting-files')}
                  disabled={aiLoading}
                  className={`inline-flex items-center gap-1.5 ${roundedLgClass} px-4 py-2 text-sm font-medium text-white disabled:opacity-50`}
                  style={{ background: 'var(--success)' }}
                  data-testid="ai-gen-files-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
                  Generate Files
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
                      <h3 className="text-sm font-semibold mb-2">Proposed Skill Changes</h3>
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
                      <h3 className="text-sm font-semibold mb-2">Proposed File Changes</h3>
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
                            {aiChangeSet.fileOps.find((f) => f.path === aiPreviewFile)?.content_text || '(no content)'}
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
                        Lint Preview: {aiLintPreview.valid ? 'Passed' : 'Has Issues'}
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
                      {aiApplied ? 'Applied' : 'Apply Changes'}
                    </button>
                    <button
                      onClick={() => { setAiChangeSet(null); setAiLintPreview(null); setAiPreviewFile(null) }}
                      className={`${roundedLgClass} border px-4 py-2 text-sm font-medium transition-colors`}
                      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                    >
                      Discard
                    </button>
                  </div>

                  {aiApplied && (
                    <div className={`${roundedLgClass} p-3 text-sm flex items-center gap-2`} style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                      <CheckCircle className="h-4 w-4" /> Changes applied successfully. Reloading...
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
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Run lint check before exporting. All validations must pass.</p>
          <button
            onClick={handleLint}
            className={`${roundedLgClass} px-4 py-2 text-sm font-medium text-white transition-colors`}
            style={{ background: 'var(--foreground)' }}
          >
            Run Lint Check
          </button>
          {lintErrors.length > 0 && (
            <div className={`${roundedLgClass} p-4`} style={{ background: 'var(--danger-light)' }}>
              <p className="font-medium mb-2 flex items-center gap-2 text-sm" style={{ color: 'var(--danger)' }}><AlertCircle className="h-4 w-4" /> Lint Failed</p>
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
              <p className="font-medium flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}><CheckCircle className="h-4 w-4" /> Lint Passed</p>
              {isEdit && (
                <div className="mt-3 flex gap-2">
                  <a href={`/api/skills/${skillId}/export.zip`} className={`${roundedLgClass} px-4 py-2 text-sm font-medium text-white`} style={{ background: 'var(--accent)' }}>
                    Export ZIP
                  </a>
                  <a href={`/api/skills/${skillId}/export.md`} className={`${roundedLgClass} border px-4 py-2 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    Export MD
                  </a>
                  <a href={`/api/skills/${skillId}/export.json`} className={`${roundedLgClass} border px-4 py-2 text-sm font-medium`} style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    Export JSON
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
            {saving ? 'Saving...' : isEdit ? 'Update Skill' : 'Create Skill'}
          </button>
          <button
            onClick={() => router.back()}
            className={`${roundedLgClass} border px-6 py-2.5 text-sm font-medium transition-colors`}
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
