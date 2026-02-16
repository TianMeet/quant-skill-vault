'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { SkillData, SkillTestCase, SkillGuardrails } from '@/lib/types'
import { Plus, Trash2, AlertCircle, CheckCircle, Upload, File, Wand2, Loader2, Eye } from 'lucide-react'

interface SkillFormProps {
  initialData?: SkillData & { tags?: string[] }
  skillId?: number
}

interface SkillFileItem {
  path: string
  mime: string
  isBinary: boolean
  size?: number
  contentText?: string
}

const defaultGuardrails: SkillGuardrails = {
  allowed_tools: [],
  disable_model_invocation: false,
  user_invocable: true,
  stop_conditions: [''],
  escalation: 'ASK_HUMAN',
}

const defaultTest: SkillTestCase = { name: '', input: '', expected_output: '' }

export function SkillForm({ initialData, skillId }: SkillFormProps) {
  const router = useRouter()
  const isEdit = !!skillId

  const [title, setTitle] = useState(initialData?.title || '')
  const [summary, setSummary] = useState(initialData?.summary || '')
  const [inputs, setInputs] = useState(initialData?.inputs || '')
  const [outputs, setOutputs] = useState(initialData?.outputs || '')
  const [steps, setSteps] = useState<string[]>(initialData?.steps || ['', '', ''])
  const [risks, setRisks] = useState(initialData?.risks || '')
  const [triggers, setTriggers] = useState<string[]>(initialData?.triggers || ['', '', ''])
  const [guardrails, setGuardrails] = useState<SkillGuardrails>(initialData?.guardrails || defaultGuardrails)
  const [tests, setTests] = useState<SkillTestCase[]>(initialData?.tests || [{ ...defaultTest }])
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(initialData?.tags || [])
  const [activeTab, setActiveTab] = useState('author')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lintErrors, setLintErrors] = useState<Array<{ field: string; message: string }>>([])
  const [lintPassed, setLintPassed] = useState(false)

  // Files tab state
  const [files, setFiles] = useState<SkillFileItem[]>([])
  const [selectedFile, setSelectedFile] = useState<SkillFileItem | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [newFileDir, setNewFileDir] = useState('references')
  const [newFileName, setNewFileName] = useState('')
  const [fileSaving, setFileSaving] = useState(false)

  // AI tab state
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

  // Load files when in edit mode
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
    setError('')
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
        setError(data.error || `Failed to create file (${res.status})`)
      }
    } catch {
      setError('Network error creating file')
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

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const body = { title, summary, inputs, outputs, steps: steps.filter(Boolean), risks, triggers: triggers.filter(Boolean), guardrails: { ...guardrails, stop_conditions: guardrails.stop_conditions.filter(Boolean) }, tests: tests.filter((t) => t.name && t.input && t.expected_output), tags }
      const url = isEdit ? `/api/skills/${skillId}` : '/api/skills'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Save failed')
        return
      }
      const data = await res.json()
      router.push(`/skills/${data.id}`)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleLint() {
    setLintErrors([])
    setLintPassed(false)
    const body = { title, summary, inputs, outputs, steps: steps.filter(Boolean), risks, triggers: triggers.filter(Boolean), guardrails: { ...guardrails, stop_conditions: guardrails.stop_conditions.filter(Boolean) }, tests: tests.filter((t) => t.name && t.input && t.expected_output), tags }
    // Use export.json endpoint to trigger lint (if skill exists), or do client-side lint
    try {
      const res = await fetch('/api/lint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.valid) {
        setLintPassed(true)
      } else {
        setLintErrors(data.errors)
      }
    } catch {
      setError('Lint check failed')
    }
  }

  function addStep() { if (steps.length < 7) setSteps([...steps, '']) }
  function removeStep(i: number) { if (steps.length > 3) setSteps(steps.filter((_, idx) => idx !== i)) }
  function updateStep(i: number, v: string) { const s = [...steps]; s[i] = v; setSteps(s) }

  function addTrigger() { setTriggers([...triggers, '']) }
  function removeTrigger(i: number) { if (triggers.length > 3) setTriggers(triggers.filter((_, idx) => idx !== i)) }
  function updateTrigger(i: number, v: string) { const t = [...triggers]; t[i] = v; setTriggers(t) }

  function addTest() { setTests([...tests, { ...defaultTest }]) }
  function removeTest(i: number) { if (tests.length > 1) setTests(tests.filter((_, idx) => idx !== i)) }
  function updateTest(i: number, field: keyof SkillTestCase, v: string) { const t = [...tests]; t[i] = { ...t[i], [field]: v }; setTests(t) }

  function addStopCondition() { setGuardrails({ ...guardrails, stop_conditions: [...guardrails.stop_conditions, ''] }) }
  function removeStopCondition(i: number) { if (guardrails.stop_conditions.length > 1) setGuardrails({ ...guardrails, stop_conditions: guardrails.stop_conditions.filter((_, idx) => idx !== i) }) }
  function updateStopCondition(i: number, v: string) { const sc = [...guardrails.stop_conditions]; sc[i] = v; setGuardrails({ ...guardrails, stop_conditions: sc }) }

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) { setTags([...tags, t]); setTagInput('') }
  }
  function removeTag(tag: string) { setTags(tags.filter((t) => t !== tag)) }

  function addAllowedTool(tool: string) {
    if (tool && !guardrails.allowed_tools.includes(tool)) {
      setGuardrails({ ...guardrails, allowed_tools: [...guardrails.allowed_tools, tool] })
    }
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
      // Reload page after short delay
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      setAiError('Network error applying changes')
    } finally {
      setAiApplying(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">{isEdit ? 'Edit Skill' : 'New Skill'}</h1>

      {error && (
        <div className="mb-4 rounded-lg p-3 text-sm flex items-center gap-2" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-sm font-medium transition-colors relative"
            style={{
              color: activeTab === tab.id ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>

      {/* Author Tab */}
      {activeTab === 'author' && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Skill title" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" rows={2} placeholder="Brief description of what this skill does" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tags</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} className="opacity-50 hover:opacity-100">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} className="flex-1 rounded-md border px-3 py-1.5 text-sm" placeholder="Add tag..." />
              <button onClick={addTag} className="rounded-lg border px-3 py-1.5 text-sm font-medium" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>Add</button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Inputs (Markdown)</label>
            <textarea value={inputs} onChange={(e) => setInputs(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-mono" rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Outputs (Markdown)</label>
            <textarea value={outputs} onChange={(e) => setOutputs(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-mono" rows={3} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Steps (3-7)</label>
            {steps.map((step, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <span className="mt-2 text-xs w-5" style={{ color: 'var(--muted-foreground)' }}>{i + 1}.</span>
                <input value={step} onChange={(e) => updateStep(i, e.target.value)} className="flex-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} placeholder={`Step ${i + 1}`} />
                {steps.length > 3 && <button onClick={() => removeStep(i)} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {steps.length < 7 && <button onClick={addStep} className="inline-flex items-center gap-1 text-xs hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-3 w-3" /> Add step</button>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Risks (Markdown)</label>
            <textarea value={risks} onChange={(e) => setRisks(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm font-mono" rows={3} />
          </div>
        </div>
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Trigger phrases will be included in the exported description (wrapped in double quotes). Minimum 3 required.</p>
          {triggers.map((trigger, i) => (
            <div key={i} className="flex gap-2">
              <input value={trigger} onChange={(e) => updateTrigger(i, e.target.value)} className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--card)' }} placeholder={`Trigger phrase ${i + 1}`} />
              {triggers.length > 3 && <button onClick={() => removeTrigger(i)} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          <button onClick={addTrigger} className="inline-flex items-center gap-1 text-sm hover:opacity-70" style={{ color: 'var(--muted-foreground)' }}><Plus className="h-4 w-4" /> Add trigger</button>
          {triggers.filter(Boolean).length >= 3 && (
            <div className="mt-4 rounded-lg p-3 text-sm" style={{ background: 'var(--muted)' }}>
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
                  <button onClick={() => setGuardrails({ ...guardrails, allowed_tools: guardrails.allowed_tools.filter((t) => t !== tool) })} className="text-blue-400 hover:text-blue-600">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input id="tool-input" className="flex-1 rounded-md border px-3 py-1.5 text-sm" placeholder="e.g. Read, Write, Bash" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllowedTool((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = '' } }} />
              <button onClick={() => { const el = document.getElementById('tool-input') as HTMLInputElement; addAllowedTool(el.value); el.value = '' }} className="rounded-lg border px-3 py-1.5 text-sm font-medium" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>Add</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Disable Model Invocation</label>
            <button onClick={() => setGuardrails({ ...guardrails, disable_model_invocation: !guardrails.disable_model_invocation })} className="relative h-6 w-11 rounded-full transition-colors" style={{ background: guardrails.disable_model_invocation ? 'var(--accent)' : 'var(--border)' }}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${guardrails.disable_model_invocation ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ boxShadow: 'var(--shadow-sm)' }} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">User Invocable</label>
            <button onClick={() => setGuardrails({ ...guardrails, user_invocable: !guardrails.user_invocable })} className="relative h-6 w-11 rounded-full transition-colors" style={{ background: guardrails.user_invocable ? 'var(--accent)' : 'var(--border)' }}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${guardrails.user_invocable ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ boxShadow: 'var(--shadow-sm)' }} />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Escalation</label>
            <select value={guardrails.escalation} onChange={(e) => setGuardrails({ ...guardrails, escalation: e.target.value as SkillGuardrails['escalation'] })} className="rounded-md border px-3 py-2 text-sm">
              <option value="ASK_HUMAN">ASK_HUMAN</option>
              <option value="REVIEW">REVIEW</option>
              <option value="BLOCK">BLOCK</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Stop Conditions (min 1)</label>
            {guardrails.stop_conditions.map((sc, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input value={sc} onChange={(e) => updateStopCondition(i, e.target.value)} className="flex-1 rounded-md border px-3 py-1.5 text-sm" placeholder="Stop condition..." />
                {guardrails.stop_conditions.length > 1 && <button onClick={() => removeStopCondition(i)} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
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
            <div key={i} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Test {i + 1}</span>
                {tests.length > 1 && <button onClick={() => removeTest(i)} className="opacity-40 hover:opacity-100" style={{ color: 'var(--danger)' }}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <input value={test.name} onChange={(e) => updateTest(i, 'name', e.target.value)} className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="Test name" />
              <textarea value={test.input} onChange={(e) => updateTest(i, 'input', e.target.value)} className="w-full rounded-md border px-3 py-1.5 text-sm font-mono" rows={2} placeholder="Input" />
              <textarea value={test.expected_output} onChange={(e) => updateTest(i, 'expected_output', e.target.value)} className="w-full rounded-md border px-3 py-1.5 text-sm font-mono" rows={2} placeholder="Expected output" />
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
              {/* New file form */}
              <div className="flex gap-2 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Directory</label>
                  <select value={newFileDir} onChange={(e) => setNewFileDir(e.target.value)} className="rounded-md border px-2 py-1.5 text-sm">
                    {ALLOWED_DIRS.map((d) => <option key={d} value={d}>{d}/</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>Filename</label>
                  <input value={newFileName} onChange={(e) => setNewFileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreateFile())} className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="e.g. rules.md" />
                </div>
                <button onClick={handleCreateFile} disabled={fileSaving || !newFileName.trim()} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--foreground)' }}>
                  <Plus className="inline h-4 w-4 mr-1" />Create
                </button>
                <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                  <Upload className="inline h-4 w-4 mr-1" />Upload
                  <input type="file" className="hidden" onChange={handleUploadFile} />
                </label>
              </div>

              {/* File list + editor */}
              <div className="flex gap-4 min-h-[300px]">
                {/* Left: file tree */}
                <div className="w-1/3 rounded-md border p-2 overflow-auto">
                  {ALLOWED_DIRS.map((dir) => {
                    const dirFiles = files.filter((f) => f.path.startsWith(dir + '/'))
                    if (dirFiles.length === 0) return null
                    return (
                      <div key={dir} className="mb-3">
                        <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--muted-foreground)' }}>{dir}/</p>
                        {dirFiles.map((f) => (
                          <div key={f.path} className="flex items-center justify-between rounded-md px-2 py-1 text-sm cursor-pointer transition-colors" style={{ background: selectedFile?.path === f.path ? 'var(--muted)' : 'transparent' }}>
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

                {/* Right: editor */}
                <div className="flex-1 rounded-md border p-2">
                  {selectedFile ? (
                    selectedFile.isBinary ? (
                      <p className="text-sm p-4" style={{ color: 'var(--muted-foreground)' }}>Binary file: {selectedFile.path} ({selectedFile.mime})</p>
                    ) : (
                      <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{selectedFile.path}</span>
                          <button onClick={handleSaveFile} disabled={fileSaving} className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ background: 'var(--foreground)' }}>
                            {fileSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        <textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} className="flex-1 w-full rounded border px-3 py-2 text-sm font-mono resize-none min-h-[250px]" />
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
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={2}
                  placeholder="e.g. Make the summary more concise, add error handling steps..."
                  data-testid="ai-instruction"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleAiPropose('update-skill')}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                  data-testid="ai-improve-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Improve
                </button>
                <button
                  onClick={() => handleAiPropose('fix-lint')}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--warning)' }}
                  data-testid="ai-fix-lint-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                  Fix Lint
                </button>
                <button
                  onClick={() => handleAiPropose('create-supporting-files')}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--success)' }}
                  data-testid="ai-gen-files-btn"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
                  Generate Files
                </button>
              </div>

              {aiError && (
                <div className="rounded-lg p-3 text-sm flex items-center gap-2" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                  <AlertCircle className="h-4 w-4" /> {aiError}
                </div>
              )}

              {aiChangeSet && (
                <div className="space-y-4" data-testid="ai-preview">
                  {/* Skill Patch Preview */}
                  {Object.keys(aiChangeSet.skillPatch).length > 0 && (
                    <div className="rounded-md border p-4">
                      <h3 className="text-sm font-semibold mb-2">Proposed Skill Changes</h3>
                      <div className="space-y-2">
                        {Object.entries(aiChangeSet.skillPatch).map(([key, value]) => (
                          <div key={key} className="text-sm">
                            <span className="font-mono text-xs rounded px-1" style={{ background: 'var(--muted)' }}>{key}</span>
                            <pre className="mt-1 rounded p-2 text-xs overflow-auto max-h-32" style={{ background: 'var(--muted)' }}>
                              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* File Ops Preview */}
                  {aiChangeSet.fileOps.length > 0 && (
                    <div className="rounded-md border p-4">
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
                          <pre className="rounded p-3 text-xs overflow-auto max-h-64" style={{ background: 'var(--muted)' }} data-testid="ai-file-preview">
                            {aiChangeSet.fileOps.find((f) => f.path === aiPreviewFile)?.content_text || '(no content)'}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {aiChangeSet.notes && (
                    <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                      {aiChangeSet.notes}
                    </div>
                  )}

                  {/* Lint Preview */}
                  {aiLintPreview && (
                    <div className={`rounded-md p-3 ${aiLintPreview.valid ? 'bg-green-50' : 'bg-amber-50'}`}>
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

                  {/* Apply Button */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleAiApply}
                      disabled={aiApplying || aiApplied || (aiLintPreview !== null && !aiLintPreview.valid)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-6 py-2 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-[0.97]"
                      style={{ background: 'var(--foreground)' }}
                      data-testid="ai-apply-btn"
                    >
                      {aiApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      {aiApplied ? 'Applied' : 'Apply Changes'}
                    </button>
                    <button
                      onClick={() => { setAiChangeSet(null); setAiLintPreview(null); setAiPreviewFile(null) }}
                      className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                    >
                      Discard
                    </button>
                  </div>

                  {aiApplied && (
                    <div className="rounded-lg p-3 text-sm flex items-center gap-2" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
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
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--foreground)' }}
          >
            Run Lint Check
          </button>
          {lintErrors.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: 'var(--danger-light)' }}>
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
            <div className="rounded-lg p-4" style={{ background: 'var(--success-light)' }}>
              <p className="font-medium flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}><CheckCircle className="h-4 w-4" /> Lint Passed</p>
              {isEdit && (
                <div className="mt-3 flex gap-2">
                  <a href={`/api/skills/${skillId}/export.zip`} className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
                    Export ZIP
                  </a>
                  <a href={`/api/skills/${skillId}/export.md`} className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    Export MD
                  </a>
                  <a href={`/api/skills/${skillId}/export.json`} className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    Export JSON
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="mt-8 flex gap-3 border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-all active:scale-[0.97]"
          style={{ background: 'var(--accent)' }}
        >
          {saving ? 'Saving...' : isEdit ? 'Update Skill' : 'Create Skill'}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-lg border px-6 py-2.5 text-sm font-medium transition-colors"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
