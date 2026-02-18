'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { SkillData } from '@/lib/types'
import { useSkillStore } from '@/lib/stores/skill-store'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNotify } from '@/components/ui/notify-provider'
import { SkillFormAuthorTab } from '@/components/skill-form/author-tab'
import { SkillFormEnhanceTab, type AiChangeSet, type AiLintPreview } from '@/components/skill-form/enhance-tab'
import { SkillFormExportTab } from '@/components/skill-form/export-tab'
import { SkillFormFilesTab, type SkillFileItem } from '@/components/skill-form/files-tab'
import { SkillFormGuardrailsTab } from '@/components/skill-form/guardrails-tab'
import { SkillFormTestsTab } from '@/components/skill-form/tests-tab'
import { SkillFormTriggersTab } from '@/components/skill-form/triggers-tab'
import { useSkillFormValidation } from '@/components/skill-form/use-skill-form-validation'
import { toUserFriendlyErrorMessage } from '@/lib/friendly-validation'
import { guardedFetch } from '@/lib/guarded-fetch'
import { normalizeTagName, normalizeTagNames } from '@/lib/tag-normalize'
import { AlertCircle } from 'lucide-react'

interface SkillFormProps {
  initialData?: SkillData & { tags?: string[] }
  skillId?: number
  variant?: 'default' | 'industrial'
}

type DraftPayload = Partial<SkillData & { tags: string[]; activeTab: string }>

type DraftEnvelope = {
  version?: number
  updatedAt?: number
  data?: DraftPayload
}

type RemoteDraftResponse = {
  payload?: DraftPayload
  version?: number
}

const LEGACY_NEW_DRAFT_STORAGE_KEY = 'qsv:new-skill-draft:v1'
const DRAFT_STORAGE_PREFIX = 'qsv:skill-draft:v2'
const DRAFT_CLIENT_ID_KEY = 'qsv:draft-client-id'
const AUTOSAVE_DEBOUNCE_MS = 450
const TAG_SEARCH_DEBOUNCE_MS = 300
const TAG_SEARCH_THROTTLE_MS = 700
const DRAFT_KEY_REGEX = /^[a-z0-9:_-]{1,120}$/i

function randomDraftClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeDraftPayload(raw: unknown): DraftPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as DraftPayload
}

function canRenderBinaryInWeb(mime: string): boolean {
  return String(mime || '').toLowerCase().startsWith('image/')
}

export function SkillForm({ initialData, skillId, variant = 'default' }: SkillFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const notify = useNotify()
  const isEdit = !!skillId
  const isIndustrial = variant === 'industrial'
  const restoredDraftRef = useRef(false)

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
  const [fileContentBase64, setFileContentBase64] = useState('')
  const [newFileDir, setNewFileDir] = useState('references')
  const [newFileName, setNewFileName] = useState('')
  const [fileSaving, setFileSaving] = useState(false)
  const [fileMoving, setFileMoving] = useState(false)
  const [fileDeleting, setFileDeleting] = useState(false)
  const [pendingDeleteFilePath, setPendingDeleteFilePath] = useState<string | null>(null)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [tagSuggestionsLoading, setTagSuggestionsLoading] = useState(false)
  const [tagExactExists, setTagExactExists] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null)
  const [draftVersion, setDraftVersion] = useState<number | null>(null)
  const [draftSource, setDraftSource] = useState<'server' | 'local' | null>(null)
  const [draftClientId, setDraftClientId] = useState<string | null>(null)
  const draftVersionRef = useRef<number | null>(null)
  const draftSaveInFlightRef = useRef(false)
  const draftSaveQueuedRef = useRef(false)
  const serverDraftWarnedRef = useRef(false)
  const lastTagSearchAtRef = useRef(0)
  const leaveBypassRef = useRef(false)

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
  const draftMode = isEdit ? 'edit' : 'new'
  const draftEntityId = isEdit ? String(skillId || 0) : 'new'
  const draftKeyParamRaw = (searchParams.get('draftKey') || '').trim()
  const forceFreshNew = !isEdit && searchParams.get('fresh') === '1'
  const explicitDraftKey = draftKeyParamRaw && DRAFT_KEY_REGEX.test(draftKeyParamRaw) ? draftKeyParamRaw : null
  const remoteDraftKey = explicitDraftKey || (draftClientId ? `${draftMode}:${draftEntityId}:${draftClientId}` : null)
  const localDraftStorageKey = remoteDraftKey ? `${DRAFT_STORAGE_PREFIX}:${remoteDraftKey}` : null

  useEffect(() => {
    draftVersionRef.current = draftVersion
  }, [draftVersion])

  const loadFiles = useCallback(async () => {
    if (!skillId) return
    const res = await guardedFetch(`/api/skills/${skillId}/files`)
    if (res.ok) setFiles(await res.json())
  }, [skillId])

  useEffect(() => {
    if (skillId) loadFiles()
  }, [skillId, loadFiles])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const existing = window.localStorage.getItem(DRAFT_CLIENT_ID_KEY)
      if (existing) {
        setDraftClientId(existing)
        return
      }
      const created = randomDraftClientId()
      window.localStorage.setItem(DRAFT_CLIENT_ID_KEY, created)
      setDraftClientId(created)
    } catch {
      setDraftClientId(`fallback-${randomDraftClientId()}`)
    }
  }, [])

  const applyDraftPayload = useCallback(
    (data: DraftPayload) => {
      initFromData({
        title: typeof data.title === 'string' ? data.title : '',
        summary: typeof data.summary === 'string' ? data.summary : '',
        inputs: typeof data.inputs === 'string' ? data.inputs : '',
        outputs: typeof data.outputs === 'string' ? data.outputs : '',
        steps: Array.isArray(data.steps) ? data.steps.map((item) => String(item)) : ['', '', ''],
        risks: typeof data.risks === 'string' ? data.risks : '',
        triggers: Array.isArray(data.triggers) ? data.triggers.map((item) => String(item)) : ['', '', ''],
        guardrails:
          data.guardrails && typeof data.guardrails === 'object'
            ? data.guardrails
            : {
                allowed_tools: [],
                disable_model_invocation: false,
                user_invocable: true,
                stop_conditions: [''],
                escalation: 'ASK_HUMAN',
              },
        tests:
          Array.isArray(data.tests) && data.tests.length > 0
            ? data.tests
            : [{ name: '', input: '', expected_output: '' }],
        tags: Array.isArray(data.tags) ? data.tags.map((item) => String(item)) : [],
      })

      if (typeof data.activeTab === 'string') {
        setUIField('activeTab', data.activeTab)
      }
    },
    [initFromData, setUIField]
  )

  const buildDraftPayload = useCallback(
    (): DraftPayload => ({
      title,
      summary,
      inputs,
      outputs,
      steps,
      risks,
      triggers,
      guardrails,
      tests,
      tags,
      activeTab,
    }),
    [title, summary, inputs, outputs, steps, risks, triggers, guardrails, tests, tags, activeTab]
  )

  const persistLocalDraft = useCallback(
    (markSavedAt = true) => {
      if (typeof window === 'undefined' || !localDraftStorageKey) return
      try {
        window.localStorage.setItem(
          localDraftStorageKey,
          JSON.stringify({
            version: draftVersionRef.current || 1,
            updatedAt: Date.now(),
            data: buildDraftPayload(),
          } satisfies DraftEnvelope)
        )
        if (!isEdit) {
          window.localStorage.removeItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
        }
        if (markSavedAt) setDraftSavedAt(Date.now())
      } catch {
        // ignore local draft write failures
      }
    },
    [localDraftStorageKey, buildDraftPayload, isEdit]
  )

  const persistServerDraft = useCallback(
    async (markSavedAt = true, silent = true) => {
      if (!draftHydrated || !remoteDraftKey) return
      if (draftSaveInFlightRef.current) {
        draftSaveQueuedRef.current = true
        return
      }

      draftSaveInFlightRef.current = true
      try {
        const expectedVersion = draftVersionRef.current
        const res = await guardedFetch(`/api/skill-drafts/${encodeURIComponent(remoteDraftKey)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: draftMode,
            skillId: isEdit ? skillId : null,
            payload: buildDraftPayload(),
            expectedVersion: expectedVersion ?? undefined,
          }),
        })

        if (res.status === 409) {
          const latestRes = await guardedFetch(`/api/skill-drafts/${encodeURIComponent(remoteDraftKey)}`)
          if (latestRes.ok) {
            const latest = (await latestRes.json().catch(() => ({}))) as RemoteDraftResponse
            const latestPayload = normalizeDraftPayload(latest.payload)
            if (latestPayload) {
              applyDraftPayload(latestPayload)
              setDraftRestoredAt(Date.now())
              setDraftSource('server')
              notify.info('检测到草稿冲突，已同步为最新版本。')
            }
            if (typeof latest.version === 'number') {
              setDraftVersion(latest.version)
            }
          }
          return
        }

        if (!res.ok) {
          if (!silent && !serverDraftWarnedRef.current) {
            notify.info('云端草稿暂不可用，当前改动已保存在本地。')
            serverDraftWarnedRef.current = true
          }
          return
        }

        const data = (await res.json().catch(() => ({}))) as RemoteDraftResponse
        if (typeof data.version === 'number') {
          setDraftVersion(data.version)
          draftVersionRef.current = data.version
        }
        setDraftSource('server')
        serverDraftWarnedRef.current = false
        if (markSavedAt) setDraftSavedAt(Date.now())
      } catch {
        if (!silent && !serverDraftWarnedRef.current) {
          notify.info('云端草稿保存失败，当前改动已保存在本地。')
          serverDraftWarnedRef.current = true
        }
      } finally {
        draftSaveInFlightRef.current = false
        if (draftSaveQueuedRef.current) {
          draftSaveQueuedRef.current = false
          void persistServerDraft(markSavedAt, true)
        }
      }
    },
    [draftHydrated, remoteDraftKey, draftMode, isEdit, skillId, buildDraftPayload, applyDraftPayload, notify]
  )

  useEffect(() => {
    if (restoredDraftRef.current || typeof window === 'undefined') return
    if (!draftClientId || !localDraftStorageKey || !remoteDraftKey) return
    if (isEdit && !initialData) return
    if (!isEdit && forceFreshNew) {
      restoredDraftRef.current = true
      window.localStorage.removeItem(localDraftStorageKey)
      window.localStorage.removeItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
      setDraftHydrated(true)
      setDraftSource(null)
      setDraftRestoredAt(null)
      setDraftVersion(null)
      draftVersionRef.current = null
      router.replace('/skills/new')
      return
    }

    let cancelled = false
    restoredDraftRef.current = true
    const hydrate = async () => {
      if (!isEdit && !explicitDraftKey) {
        const applyLocalRaw = (raw: string | null): boolean => {
          if (!raw) return false
          try {
            const parsed = JSON.parse(raw) as DraftEnvelope
            const payload = normalizeDraftPayload(parsed?.data)
            if (!payload || cancelled) return false
            applyDraftPayload(payload)
            setDraftRestoredAt(Date.now())
            setDraftSource('local')
            if (typeof parsed.version === 'number' && parsed.version > 0) {
              setDraftVersion(parsed.version)
              draftVersionRef.current = parsed.version
            }
            return true
          } catch {
            return false
          }
        }

        const localRaw = window.localStorage.getItem(localDraftStorageKey)
        const restoredFromLocal = applyLocalRaw(localRaw)
        if (!restoredFromLocal && !isEdit) {
          const legacyRaw = window.localStorage.getItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
          const restoredFromLegacy = applyLocalRaw(legacyRaw)
          if (restoredFromLegacy) {
            if (legacyRaw) window.localStorage.setItem(localDraftStorageKey, legacyRaw)
            window.localStorage.removeItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
          }
        }

        setDraftHydrated(true)
        return
      }

      try {
        const remoteRes = await guardedFetch(`/api/skill-drafts/${encodeURIComponent(remoteDraftKey)}`, {
          cache: 'no-store',
        })
        if (remoteRes.ok) {
          const remote = (await remoteRes.json().catch(() => ({}))) as RemoteDraftResponse
          const payload = normalizeDraftPayload(remote.payload)
          if (payload && !cancelled) {
            applyDraftPayload(payload)
            setDraftRestoredAt(Date.now())
            setDraftSource('server')
            if (typeof remote.version === 'number') {
              setDraftVersion(remote.version)
              draftVersionRef.current = remote.version
            }
            return
          }
        }
      } catch {
        // fallback to local draft
      }

      const applyLocalRaw = (raw: string | null): boolean => {
        if (!raw) return false
        try {
          const parsed = JSON.parse(raw) as DraftEnvelope
          const payload = normalizeDraftPayload(parsed?.data)
          if (!payload || cancelled) return false
          applyDraftPayload(payload)
          setDraftRestoredAt(Date.now())
          setDraftSource('local')
          if (typeof parsed.version === 'number' && parsed.version > 0) {
            setDraftVersion(parsed.version)
            draftVersionRef.current = parsed.version
          }
          return true
        } catch {
          return false
        }
      }

      const localRaw = window.localStorage.getItem(localDraftStorageKey)
      const restoredFromLocal = applyLocalRaw(localRaw)
      if (restoredFromLocal) return

      if (!isEdit) {
        const legacyRaw = window.localStorage.getItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
        const restoredFromLegacy = applyLocalRaw(legacyRaw)
        if (restoredFromLegacy) {
          if (legacyRaw) {
            window.localStorage.setItem(localDraftStorageKey, legacyRaw)
          }
          window.localStorage.removeItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
        }
      }
    }

    void hydrate().finally(() => {
      if (!cancelled) setDraftHydrated(true)
    })

    return () => {
      cancelled = true
    }
  }, [
    draftClientId,
    localDraftStorageKey,
    remoteDraftKey,
    isEdit,
    explicitDraftKey,
    forceFreshNew,
    router,
    initialData,
    applyDraftPayload,
  ])

  useEffect(() => {
    if (!draftHydrated || typeof window === 'undefined') return

    const timer = window.setTimeout(() => {
      persistLocalDraft(true)
      if (isEdit) {
        void persistServerDraft(true, true)
      }
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [draftHydrated, persistLocalDraft, persistServerDraft, isEdit])

  useEffect(() => {
    if (!draftHydrated || typeof window === 'undefined') return

    const flushDraft = () => {
      persistLocalDraft(false)
      if (isEdit) {
        void persistServerDraft(false, true)
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft()
    }

    window.addEventListener('pagehide', flushDraft)
    window.addEventListener('beforeunload', flushDraft)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flushDraft)
      window.removeEventListener('beforeunload', flushDraft)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [draftHydrated, persistLocalDraft, persistServerDraft, isEdit])

  const normalizedTagInput = normalizeTagName(tagInput)

  useEffect(() => {
    if (!normalizedTagInput || normalizedTagInput.length < 2) {
      setTagSuggestions([])
      setTagExactExists(false)
      setTagSuggestionsLoading(false)
      return
    }

    let active = true
    let controller: AbortController | null = null
    const elapsed = Date.now() - lastTagSearchAtRef.current
    const throttleDelay = Math.max(0, TAG_SEARCH_THROTTLE_MS - elapsed)
    const delay = Math.max(TAG_SEARCH_DEBOUNCE_MS, throttleDelay)

    const timer = window.setTimeout(async () => {
      controller = new AbortController()
      lastTagSearchAtRef.current = Date.now()
      setTagSuggestionsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('query', normalizedTagInput)
        params.set('page', '1')
        params.set('limit', '50')
        const res = await guardedFetch(`/api/tags?${params}`, { signal: controller.signal })
        if (!res.ok) {
          if (!active) return
          setTagSuggestions([])
          setTagExactExists(false)
          return
        }

        const data = await res.json().catch(() => ({}))
        const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []
        const names = normalizeTagNames(
          items
            .map((item: unknown) =>
              typeof item === 'object' && item && 'name' in item
                ? String((item as { name: unknown }).name)
                : ''
            )
            .filter(Boolean)
        )
        const exactExists = names.includes(normalizedTagInput)
        const nextSuggestions = names.filter((name) => !tags.includes(name)).slice(0, 8)

        if (!active) return
        setTagExactExists(exactExists)
        setTagSuggestions(nextSuggestions)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!active) return
        setTagSuggestions([])
        setTagExactExists(false)
      } finally {
        if (active) setTagSuggestionsLoading(false)
      }
    }, delay)

    return () => {
      active = false
      window.clearTimeout(timer)
      controller?.abort()
    }
  }, [normalizedTagInput, tags])

  async function handleCreateFile() {
    if (!skillId || !newFileName.trim()) return
    const filePath = `${newFileDir}/${newFileName.trim()}`
    setFileSaving(true)
    setUIField('error', '')
    try {
      const res = await guardedFetch(`/api/skills/${skillId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '', mime: guessMime(newFileName), isBinary: false }),
      })
      if (res.ok) {
        setNewFileName('')
        notify.success('文件已创建')
        await loadFiles()
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `创建文件失败（${res.status}）`)
        setUIField('error', msg)
        notify.error(msg)
      }
    } catch {
      const msg = '创建文件时网络异常，请重试。'
      setUIField('error', msg)
      notify.error(msg)
    }
    setFileSaving(false)
  }

  async function handleSelectFile(f: SkillFileItem) {
    if (!skillId) return
    setSelectedFile(f)
    setFileContent('')
    setFileContentBase64('')

    if (f.isBinary && !canRenderBinaryInWeb(f.mime)) {
      return
    }

    const res = await guardedFetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(f.path)}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const msg = toUserFriendlyErrorMessage(data.error || `加载文件失败（${res.status}）`)
      setUIField('error', msg)
      notify.error(msg)
      return
    }

    const data = await res.json().catch(() => ({}))
    if (f.isBinary) {
      setFileContentBase64(typeof data.contentBase64 === 'string' ? data.contentBase64 : '')
      return
    }
    setFileContent(typeof data.contentText === 'string' ? data.contentText : '')
  }

  async function handleSaveFile() {
    if (!skillId || !selectedFile) return
    setFileSaving(true)
    setUIField('error', '')
    try {
      const res = await guardedFetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(selectedFile.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fileContent }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || '保存文件失败')
        setUIField('error', msg)
        notify.error(msg)
      } else {
        notify.success('文件已保存')
      }
    } catch {
      const msg = '保存文件时网络异常，请重试。'
      setUIField('error', msg)
      notify.error(msg)
    }
    setFileSaving(false)
    await loadFiles()
  }

  async function handleDeleteFile(path: string) {
    if (!skillId) return
    setPendingDeleteFilePath(path)
  }

  async function confirmDeleteFile() {
    if (!skillId || !pendingDeleteFilePath) return
    const path = pendingDeleteFilePath
    setUIField('error', '')
    setFileDeleting(true)
    try {
      const res = await guardedFetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || '删除文件失败')
        setUIField('error', msg)
        notify.error(msg)
        return
      }
    } catch {
      const msg = '删除文件时网络异常，请重试。'
      setUIField('error', msg)
      notify.error(msg)
      return
    } finally {
      setFileDeleting(false)
      setPendingDeleteFilePath(null)
    }
    if (selectedFile?.path === path) { setSelectedFile(null); setFileContent('') }
    if (selectedFile?.path === path) { setFileContentBase64('') }
    await loadFiles()
    notify.success('文件已删除')
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('FILE_READ_FAILED'))
      reader.onload = () => resolve(String(reader.result || ''))
      reader.readAsDataURL(file)
    })
  }

  async function handleUploadFiles(inputFiles: File[]) {
    if (!skillId || inputFiles.length === 0) return
    setFileSaving(true)
    setUIField('error', '')

    try {
      let uploadedCount = 0
      for (const file of inputFiles) {
        const dataUrl = await readFileAsDataUrl(file)
        const base64 = dataUrl.split(',')[1] || ''
        const path = `assets/${file.name}`
        const res = await guardedFetch(`/api/skills/${skillId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: base64, mime: file.type || 'application/octet-stream', isBinary: true }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = toUserFriendlyErrorMessage(data.error || `上传文件失败（${res.status}）`)
          setUIField('error', msg)
          notify.error(msg)
          break
        }
        uploadedCount += 1
      }
      await loadFiles()
      if (uploadedCount > 0) {
        notify.success(`已上传 ${uploadedCount} 个文件`)
      }
    } catch {
      const msg = '上传文件时网络异常，请重试。'
      setUIField('error', msg)
      notify.error(msg)
    } finally {
      setFileSaving(false)
    }
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    if (selected.length > 0) await handleUploadFiles(selected)
    e.target.value = ''
  }

  async function handleMoveFile(fromPath: string, toPath: string) {
    if (!skillId || !fromPath || !toPath) return
    setFileMoving(true)
    setUIField('error', '')
    try {
      const res = await guardedFetch(`/api/skills/${skillId}/files`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPath, toPath }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `移动文件失败（${res.status}）`)
        setUIField('error', msg)
        notify.error(msg)
        return
      }

      if (selectedFile?.path === fromPath) {
        setSelectedFile({ ...selectedFile, path: toPath })
      }
      await loadFiles()
      notify.success('文件路径已更新')
    } catch {
      const msg = '移动文件时网络异常，请重试。'
      setUIField('error', msg)
      notify.error(msg)
    } finally {
      setFileMoving(false)
    }
  }

  async function loadAiCurrentFile(path: string): Promise<{ exists: boolean; isBinary: boolean; contentText: string | null }> {
    if (!skillId) return { exists: false, isBinary: false, contentText: null }
    const res = await guardedFetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(path)}`)
    if (res.status === 404) return { exists: false, isBinary: false, contentText: null }
    if (!res.ok) throw new Error(`LOAD_FILE_FAILED_${res.status}`)
    const data = await res.json().catch(() => ({}))
    if (data.isBinary) return { exists: true, isBinary: true, contentText: null }
    return { exists: true, isBinary: false, contentText: typeof data.contentText === 'string' ? data.contentText : '' }
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

  async function clearPersistedDraft(showNotice = false) {
    if (typeof window === 'undefined') return
    if (localDraftStorageKey) {
      window.localStorage.removeItem(localDraftStorageKey)
    }
    if (!isEdit) {
      window.localStorage.removeItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
    }
    if (remoteDraftKey) {
      try {
        await guardedFetch(`/api/skill-drafts/${encodeURIComponent(remoteDraftKey)}`, { method: 'DELETE' })
      } catch {
        // ignore cloud draft clear failures
      }
    }
    draftVersionRef.current = null
    setDraftVersion(null)
    setDraftSource(null)
    setDraftRestoredAt(null)
    setDraftSavedAt(null)
    if (showNotice) {
      notify.success('草稿已清空')
    }
  }

  function clearLocalDraftSnapshot() {
    if (typeof window === 'undefined') return
    if (localDraftStorageKey) {
      window.localStorage.removeItem(localDraftStorageKey)
    }
    if (!isEdit) {
      window.localStorage.removeItem(LEGACY_NEW_DRAFT_STORAGE_KEY)
    }
    setDraftSavedAt(null)
  }

  async function handleLeaveSaveAndGo() {
    if (!pendingLeaveHref) return
    setLeaveSaving(true)
    try {
      persistLocalDraft(true)
      if (remoteDraftKey) {
        await persistServerDraft(true, false)
      }
      notify.success('草稿已保存')
      leaveBypassRef.current = true
      router.push(pendingLeaveHref)
    } finally {
      setLeaveSaving(false)
      setLeaveDialogOpen(false)
      setPendingLeaveHref(null)
    }
  }

  function handleLeaveDiscardAndGo() {
    if (!pendingLeaveHref) return
    clearLocalDraftSnapshot()
    leaveBypassRef.current = true
    setLeaveDialogOpen(false)
    const next = pendingLeaveHref
    setPendingLeaveHref(null)
    router.push(next)
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
      const res = await guardedFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || '保存失败')
        setUIField('error', msg)
        notify.error(msg)
        return
      }
      const data = await res.json()
      notify.success(isEdit ? 'Skill 已更新' : 'Skill 已创建')
      await clearPersistedDraft(false)
      router.push(`/skills/${data.id}`)
    } catch {
      const msg = '保存时网络异常，请重试。'
      setUIField('error', msg)
      notify.error(msg)
    } finally {
      setUIField('saving', false)
    }
  }

  async function handleLint() {
    setUIField('lintErrors', [])
    setUIField('lintPassed', false)
    const body = { title, summary, inputs, outputs, steps: steps.filter(Boolean), risks, triggers: triggers.filter(Boolean), guardrails: { ...guardrails, stop_conditions: guardrails.stop_conditions.filter(Boolean) }, tests: tests.filter((t) => t.name && t.input && t.expected_output), tags }
    try {
      const res = await guardedFetch('/api/lint', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.valid) {
        setUIField('lintPassed', true)
        notify.success('校验通过')
      } else {
        setUIField('lintErrors', Array.isArray(data.errors) ? data.errors : [])
        notify.error('校验未通过，请根据提示修复后重试。')
      }
    } catch {
      const msg = '运行校验失败，请稍后重试。'
      setUIField('error', msg)
      notify.error(msg)
    }
  }

  function handleAddTag() {
    const nextTag = normalizeTagName(tagInput)
    if (!nextTag) return
    markUserEdited('tags')
    addTag(nextTag)
    setTagInput('')
  }

  function handleSelectSuggestedTag(tag: string) {
    markUserEdited('tags')
    addTag(tag)
    setTagInput('')
  }

  const canCreateTag =
    !!normalizedTagInput &&
    !tags.includes(normalizedTagInput) &&
    !tagExactExists

  const hasDraftContent = useMemo(() => {
    if (title.trim()) return true
    if (summary.trim()) return true
    if (inputs.trim()) return true
    if (outputs.trim()) return true
    if (risks.trim()) return true
    if (tags.length > 0) return true
    if (steps.some((item) => item.trim().length > 0)) return true
    if (triggers.some((item) => item.trim().length > 0)) return true
    if (tests.some((item) => item.name.trim() || item.input.trim() || item.expected_output.trim())) return true
    if (guardrails.allowed_tools.length > 0) return true
    if (guardrails.stop_conditions.some((item) => item.trim().length > 0)) return true
    if (guardrails.disable_model_invocation) return true
    if (!guardrails.user_invocable) return true
    if (guardrails.escalation !== 'ASK_HUMAN') return true
    return false
  }, [title, summary, inputs, outputs, risks, tags, steps, triggers, tests, guardrails])

  const handleCancel = useCallback(() => {
    if (isEdit) {
      router.back()
      return
    }
    if (!hasDraftContent) {
      router.push('/skills')
      return
    }
    setPendingLeaveHref('/skills')
    setLeaveDialogOpen(true)
  }, [isEdit, hasDraftContent, router])

  useEffect(() => {
    if (isEdit || !draftHydrated || typeof window === 'undefined') return

    const onDocumentClick = (event: MouseEvent) => {
      if (!hasDraftContent || leaveBypassRef.current) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      const href = anchor.getAttribute('href') || ''
      if (!href || href.startsWith('#')) return

      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.origin !== window.location.origin) return

      const currentUrl = new URL(window.location.href)
      if (
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search &&
        nextUrl.hash === currentUrl.hash
      ) {
        return
      }

      event.preventDefault()
      setPendingLeaveHref(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)
      setLeaveDialogOpen(true)
    }

    document.addEventListener('click', onDocumentClick, true)
    return () => {
      document.removeEventListener('click', onDocumentClick, true)
    }
  }, [isEdit, draftHydrated, hasDraftContent])

  const draftTip = draftRestoredAt
    ? `已恢复${draftSource === 'server' ? '云端' : '本地'}草稿（${new Date(draftRestoredAt).toLocaleTimeString()}）`
    : draftHydrated
      ? isEdit
        ? draftSource === 'server'
          ? '已开启云端自动草稿（本地兜底）'
          : '已开启本地自动草稿（云端同步中）'
        : '已开启本地自动草稿（离开页面时可选择是否保存到草稿库）'
      : '正在检查草稿...'
  const draftSaveTimeLabel = draftSavedAt ? `最近保存 ${new Date(draftSavedAt).toLocaleTimeString()}` : ''
  const aiCurrentSkill = useMemo(
    () => ({
      title,
      summary,
      inputs,
      outputs,
      steps,
      risks,
      triggers,
      guardrails,
      tests,
      tags,
    }),
    [title, summary, inputs, outputs, steps, risks, triggers, guardrails, tests, tags]
  )

  async function handleClearLocalDraft() {
    await clearPersistedDraft(true)
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
      const res = await guardedFetch(`/api/skills/${skillId}/ai/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instruction: aiInstruction || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        const baseError = toUserFriendlyErrorMessage(data.error || `AI 建议失败（${res.status}）`)
        const details = Array.isArray(data.details)
          ? data.details.filter((d: unknown): d is string => typeof d === 'string' && d.trim().length > 0)
          : []
        const msg = details.length > 0 ? `${baseError}（${details.slice(0, 2).join('；')}）` : baseError
        setAiError(msg)
        notify.error(msg)
        return
      }
      setAiChangeSet(data.changeSet)
      setAiLintPreview(data.lintPreview)
      notify.success('已生成 AI 变更建议')
    } catch {
      const msg = '调用 AI 时网络异常，请重试。'
      setAiError(msg)
      notify.error(msg)
    } finally {
      setAiLoading(false)
    }
  }

  async function handleAiApply() {
    if (!skillId || !aiChangeSet) return
    setAiApplying(true)
    setAiError('')
    try {
      const res = await guardedFetch(`/api/skills/${skillId}/ai/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeSet: aiChangeSet }),
      })
      const data = await res.json()
      if (!res.ok) {
        const baseError = toUserFriendlyErrorMessage(data.error || `AI 应用失败（${res.status}）`)
        const details = Array.isArray(data.errors)
          ? data.errors.filter((d: unknown): d is string => typeof d === 'string' && d.trim().length > 0)
          : []
        const msg = details.length > 0 ? `${baseError}（${details.slice(0, 2).join('；')}）` : baseError
        setAiError(msg)
        notify.error(msg)
        return
      }
      setAiApplied(true)
      notify.success('AI 变更已应用')
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      const msg = '应用变更时网络异常，请重试。'
      setAiError(msg)
      notify.error(msg)
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
      <ConfirmDialog
        open={!!pendingDeleteFilePath}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteFilePath(null)
        }}
        title="确认删除文件"
        description={pendingDeleteFilePath ? `将删除文件 ${pendingDeleteFilePath}，此操作不可撤销。` : undefined}
        confirmText="删除文件"
        confirmVariant="destructive"
        loading={fileDeleting}
        onConfirm={() => void confirmDeleteFile()}
      />
      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLeaveDialogOpen(false)
            setPendingLeaveHref(null)
          }
        }}
      >
        <DialogContent className={`${roundedLgClass} max-w-md`}>
          <DialogHeader>
            <DialogTitle>离开当前新建页面</DialogTitle>
            <DialogDescription>
              当前内容有未提交变更。是否保存为草稿后再离开？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLeaveDialogOpen(false)
                setPendingLeaveHref(null)
              }}
              disabled={leaveSaving}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleLeaveDiscardAndGo}
              disabled={leaveSaving}
            >
              不保存离开
            </Button>
            <Button
              type="button"
              onClick={() => void handleLeaveSaveAndGo()}
              disabled={leaveSaving}
            >
              {leaveSaving ? '保存中...' : '保存并离开'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono" style={{ color: requiredStatus.filled === requiredStatus.total ? 'var(--success)' : 'var(--muted-foreground)' }}>
                {requiredStatus.filled}/{requiredStatus.total} {requiredStatus.filled === requiredStatus.total ? '就绪' : '必填'}
              </span>
              <Button
                onClick={() => void handleClearLocalDraft()}
                type="button"
                variant="ghost"
                size="sm"
                className={`${roundedLgClass} h-6 px-2 text-[10px]`}
              >
                清空草稿
              </Button>
              <Button
                asChild
                type="button"
                variant="ghost"
                size="sm"
                className={`${roundedLgClass} h-6 px-2 text-[10px]`}
              >
                <Link href="/drafts">草稿管理</Link>
              </Button>
            </div>
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
        {!isEdit && (
          <p className="mb-3 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
            {draftTip}{draftSaveTimeLabel ? ` · ${draftSaveTimeLabel}` : ''}
          </p>
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
          tagSuggestions={tagSuggestions}
          tagSuggestionsLoading={tagSuggestionsLoading}
          canCreateTag={canCreateTag}
          createTagPreview={normalizedTagInput}
          inputs={inputs}
          outputs={outputs}
          steps={steps}
          risks={risks}
          filledSteps={filledSteps}
          setTagInput={setTagInput}
          handleAddTag={handleAddTag}
          handleSelectSuggestedTag={handleSelectSuggestedTag}
          removeTag={(tag) => { markUserEdited('tags'); removeTag(tag) }}
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
            fileContentBase64={fileContentBase64}
            newFileDir={newFileDir}
            setNewFileDir={setNewFileDir}
            newFileName={newFileName}
            setNewFileName={setNewFileName}
            fileSaving={fileSaving}
            fileMoving={fileMoving}
            handleCreateFile={handleCreateFile}
            handleUploadFile={handleUploadFile}
            handleUploadFiles={handleUploadFiles}
            handleSelectFile={handleSelectFile}
            handleDeleteFile={handleDeleteFile}
            handleMoveFile={handleMoveFile}
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
            currentSkill={aiCurrentSkill}
            loadCurrentFile={loadAiCurrentFile}
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
          requiredStatus={requiredStatus}
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
            onClick={handleCancel}
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
