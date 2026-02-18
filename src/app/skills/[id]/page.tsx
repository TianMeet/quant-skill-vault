'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Download, Edit, Trash2, CheckCircle, File, ChevronLeft, ChevronRight, Shield, Zap, FlaskConical, Copy, AlertCircle, History, UploadCloud, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { SkillGuardrails, SkillTestCase } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useNotify } from '@/components/ui/notify-provider'
import { TagPill } from '@/components/tag-pill'
import { toFriendlyLintIssues, toUserFriendlyErrorMessage } from '@/lib/friendly-validation'
import { FilePreviewContent } from '@/components/file-preview-content'

interface SkillDetail {
  id: number
  title: string
  slug: string
  status: string
  summary: string
  inputs: string
  outputs: string
  steps: string[]
  risks: string
  triggers: string[]
  guardrails: SkillGuardrails
  tests: SkillTestCase[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface SkillFileItem {
  path: string
  mime: string
  isBinary: boolean
  size: number
  updatedAt: string
}

interface SkillFileDetail {
  id: number
  path: string
  mime: string
  isBinary: boolean
  contentText?: string
  contentBase64?: string
  updatedAt: string
}

interface LintError {
  field: string
  message: string
}

interface SkillVersionItem {
  id: number
  version: number
  title: string | null
  status: string | null
  createdAt: string
}

interface SkillPublicationItem {
  id: number
  versionId: number
  version: number
  note: string | null
  publishedAt: string
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function canRenderBinaryInWeb(mime: string): boolean {
  return String(mime || '').toLowerCase().startsWith('image/')
}

function MarkdownBlock({ content }: { content: string }) {
  const value = content?.trim() || ''
  if (!value) return <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无内容</p>
  return (
    <div className="chat-markdown text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {value}
      </ReactMarkdown>
    </div>
  )
}

export default function SkillDetailPage() {
  const params = useParams()
  const router = useRouter()
  const notify = useNotify()
  const skillId = Array.isArray(params.id) ? params.id[0] : params.id
  const [skill, setSkill] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [lintErrors, setLintErrors] = useState<LintError[]>([])
  const [lintPassed, setLintPassed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [rollingVersionId, setRollingVersionId] = useState<number | null>(null)
  const [files, setFiles] = useState<SkillFileItem[]>([])
  const [filePreviewOpen, setFilePreviewOpen] = useState(false)
  const [filePreviewLoading, setFilePreviewLoading] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number>(-1)
  const [previewFile, setPreviewFile] = useState<SkillFileDetail | null>(null)
  const previewCacheRef = useRef<Map<string, SkillFileDetail>>(new Map())
  const [versions, setVersions] = useState<SkillVersionItem[]>([])
  const [versionLoading, setVersionLoading] = useState(false)
  const [publications, setPublications] = useState<SkillPublicationItem[]>([])
  const friendlyLintIssues = useMemo(() => toFriendlyLintIssues(lintErrors), [lintErrors])

  const fetchSkill = useCallback(async () => {
    if (!skillId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/skills/${skillId}`)
      if (res.ok) {
        setSkill(await res.json())
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `加载失败（${res.status}）`)
        setSkill(null)
        notify.error(msg)
      }
    } catch {
      const msg = '加载 Skill 失败，请稍后重试。'
      setSkill(null)
      notify.error(msg)
    } finally {
      setLoading(false)
    }
  }, [skillId, notify])

  const fetchFiles = useCallback(async () => {
    if (!skillId) return
    try {
      const res = await fetch(`/api/skills/${skillId}/files`)
      if (res.ok) setFiles(await res.json())
    } catch {
      setFiles([])
    }
  }, [skillId])

  const fetchVersions = useCallback(async () => {
    if (!skillId) return
    setVersionLoading(true)
    try {
      const res = await fetch(`/api/skills/${skillId}/versions?limit=20`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notify.error(toUserFriendlyErrorMessage(data.error || `加载版本失败（${res.status}）`))
        setVersions([])
        return
      }
      const data = await res.json().catch(() => ({}))
      setVersions(Array.isArray(data.items) ? data.items : [])
    } catch {
      notify.error('加载版本失败，请稍后重试。')
      setVersions([])
    } finally {
      setVersionLoading(false)
    }
  }, [skillId, notify])

  const fetchPublications = useCallback(async () => {
    if (!skillId) return
    try {
      const res = await fetch(`/api/skills/${skillId}/publications`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notify.error(toUserFriendlyErrorMessage(data.error || `加载发布记录失败（${res.status}）`))
        setPublications([])
        return
      }
      const data = await res.json().catch(() => ({}))
      setPublications(Array.isArray(data.items) ? data.items : [])
    } catch {
      notify.error('加载发布记录失败，请稍后重试。')
      setPublications([])
    }
  }, [skillId, notify])

  useEffect(() => {
    void fetchSkill()
    void fetchFiles()
    void fetchVersions()
    void fetchPublications()
  }, [fetchSkill, fetchFiles, fetchVersions, fetchPublications])

  async function handleDelete() {
    setDeleteDialogOpen(true)
  }

  async function confirmDelete() {
    if (!skillId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/skills/${skillId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `删除失败（${res.status}）`)
        notify.error(msg)
        return
      }
      notify.success('Skill 已删除')
      router.push('/skills')
    } catch {
      const msg = '删除时网络异常，请重试。'
      notify.error(msg)
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  async function handleDuplicate() {
    if (!skillId) return
    setDuplicating(true)
    try {
      const res = await fetch(`/api/skills/${skillId}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `复制失败（${res.status}）`)
        notify.error(msg)
        return
      }
      const data = await res.json()
      notify.success('Skill 副本已创建')
      router.push(`/skills/${data.id}/edit`)
    } catch {
      const msg = '复制 Skill 失败，请稍后重试。'
      notify.error(msg)
    } finally {
      setDuplicating(false)
    }
  }

  async function handlePublish() {
    if (!skillId) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/skills/${skillId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `发布失败（${res.status}）`)
        notify.error(msg)
        return
      }
      notify.success('Skill 已发布')
      await Promise.all([fetchSkill(), fetchVersions(), fetchPublications()])
    } catch {
      notify.error('发布失败，请稍后重试。')
    } finally {
      setPublishing(false)
    }
  }

  async function handleRollback(versionId: number) {
    if (!skillId) return
    setRollingVersionId(versionId)
    try {
      const res = await fetch(`/api/skills/${skillId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `回滚失败（${res.status}）`)
        notify.error(msg)
        return
      }
      notify.success(`已回滚到版本 v${versions.find((item) => item.id === versionId)?.version || versionId}`)
      await Promise.all([fetchSkill(), fetchVersions(), fetchPublications()])
    } catch {
      notify.error('回滚失败，请稍后重试。')
    } finally {
      setRollingVersionId(null)
    }
  }

  async function handleLint() {
    setLintErrors([])
    setLintPassed(false)
    try {
      const res = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill),
      })
      const data = await res.json().catch(() => ({}))
      if (data.valid) {
        setLintPassed(true)
        notify.success('校验通过')
      } else {
        setLintErrors(Array.isArray(data.errors) ? data.errors : [{ field: 'body', message: 'Invalid request body' }])
        notify.error('校验未通过，请根据提示修复后重试。')
      }
    } catch {
      setLintErrors([{ field: 'body', message: 'Invalid request body' }])
      notify.error('运行校验失败，请稍后重试。')
    }
  }

  const openPreviewAtIndex = useCallback(async (index: number) => {
    if (!skillId) return
    if (index < 0 || index >= files.length) return
    const file = files[index]
    setPreviewIndex(index)
    setFilePreviewOpen(true)
    setFilePreviewLoading(true)

    if (file.isBinary && !canRenderBinaryInWeb(file.mime)) {
      setPreviewFile({
        id: 0,
        path: file.path,
        mime: file.mime,
        isBinary: true,
        contentText: '',
        contentBase64: '',
        updatedAt: file.updatedAt,
      })
      setFilePreviewLoading(false)
      return
    }

    const cached = previewCacheRef.current.get(file.path)
    if (cached) {
      setPreviewFile(cached)
      setFilePreviewLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/skills/${skillId}/files?path=${encodeURIComponent(file.path)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notify.error(toUserFriendlyErrorMessage(data.error || `加载文件失败（${res.status}）`))
        setPreviewFile(null)
        return
      }
      const data = (await res.json().catch(() => ({}))) as Partial<SkillFileDetail>
      const normalized: SkillFileDetail = {
        id: Number(data.id || 0),
        path: typeof data.path === 'string' ? data.path : file.path,
        mime: typeof data.mime === 'string' ? data.mime : file.mime,
        isBinary: Boolean(data.isBinary),
        contentText: typeof data.contentText === 'string' ? data.contentText : '',
        contentBase64: typeof data.contentBase64 === 'string' ? data.contentBase64 : '',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : file.updatedAt,
      }
      previewCacheRef.current.set(file.path, normalized)
      setPreviewFile(normalized)
    } catch {
      notify.error('加载文件失败，请稍后重试。')
      setPreviewFile(null)
    } finally {
      setFilePreviewLoading(false)
    }
  }, [skillId, files, notify])

  const handlePreviewFile = useCallback(async (file: SkillFileItem) => {
    const index = files.findIndex((item) => item.path === file.path)
    if (index < 0) return
    await openPreviewAtIndex(index)
  }, [files, openPreviewAtIndex])

  const hasPreviewPrev = previewIndex > 0
  const hasPreviewNext = previewIndex >= 0 && previewIndex < files.length - 1
  const previewListMeta = previewIndex >= 0 ? files[previewIndex] : null

  const handlePreviewPrev = useCallback(async () => {
    if (!hasPreviewPrev) return
    await openPreviewAtIndex(previewIndex - 1)
  }, [hasPreviewPrev, previewIndex, openPreviewAtIndex])

  const handlePreviewNext = useCallback(async () => {
    if (!hasPreviewNext) return
    await openPreviewAtIndex(previewIndex + 1)
  }, [hasPreviewNext, previewIndex, openPreviewAtIndex])

  useEffect(() => {
    if (!filePreviewOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && hasPreviewPrev) {
        event.preventDefault()
        void handlePreviewPrev()
      }
      if (event.key === 'ArrowRight' && hasPreviewNext) {
        event.preventDefault()
        void handlePreviewNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filePreviewOpen, hasPreviewPrev, hasPreviewNext, handlePreviewPrev, handlePreviewNext])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-4 w-96 mb-8" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-4 w-24 mb-3" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!skill) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm" style={{ color: 'var(--danger)' }}>Skill 未找到或加载失败</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 animate-in">
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="确认删除 Skill"
        description="删除后将无法恢复，相关支持文件也会一并移除。"
        confirmText="删除 Skill"
        confirmVariant="destructive"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
      <Dialog open={filePreviewOpen} onOpenChange={setFilePreviewOpen}>
        <DialogContent className="grid h-[82vh] max-h-[82vh] w-[96vw] max-w-6xl min-w-0 grid-rows-[auto_1fr] gap-0 overflow-hidden border-[var(--border)] bg-[var(--card)] p-0 text-[var(--foreground)] sm:max-w-6xl">
          <DialogHeader className="border-b px-5 py-4 pr-12 text-left" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <DialogTitle className="truncate text-sm font-mono">{previewFile?.path || '文件预览'}</DialogTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {previewFile?.mime && (
                <span className="rounded-md border px-2 py-0.5 font-medium" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                  {previewFile.mime}
                </span>
              )}
              <span>第 {previewIndex + 1 > 0 ? previewIndex + 1 : 0} / {files.length} 个</span>
              {previewListMeta?.size !== undefined && <span>{formatBytes(previewListMeta.size)}</span>}
              {previewFile?.updatedAt && <span>更新于 {new Date(previewFile.updatedAt).toLocaleString()}</span>}
              <span>快捷键: ← / →</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                disabled={!hasPreviewPrev || filePreviewLoading}
                onClick={() => void handlePreviewPrev()}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                上一条
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md px-2 text-xs"
                disabled={!hasPreviewNext || filePreviewLoading}
                onClick={() => void handlePreviewNext()}
              >
                下一条
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              {previewFile && (
                <Button asChild variant="ghost" size="sm" className="h-8 rounded-md px-2 text-xs">
                  <a
                    href={`/api/skills/${skill.id}/files?path=${encodeURIComponent(previewFile.path)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    查看原始数据
                  </a>
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="min-h-0 min-w-0 p-4" style={{ background: 'var(--card)' }}>
            {filePreviewLoading ? (
              <div className="skeleton h-full w-full rounded-md" />
            ) : previewFile ? (
              <div
                className="h-full min-w-0 overflow-hidden rounded-xl border p-2 shadow-[var(--shadow-sm)]"
                style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--muted) 45%, var(--card))' }}
              >
                <FilePreviewContent
                  path={previewFile.path}
                  mime={previewFile.mime}
                  isBinary={previewFile.isBinary}
                  contentText={previewFile.contentText}
                  contentBase64={previewFile.contentBase64}
                  className="h-full rounded-lg"
                  embedded
                />
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无可预览内容</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Breadcrumb */}
      <Link
        href="/skills"
        className="inline-flex items-center gap-1 text-sm mb-6 transition-opacity hover:opacity-70"
        style={{ color: 'var(--muted-foreground)' }}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        返回列表
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{skill.title}</h1>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm font-mono" style={{ color: 'var(--muted-foreground)' }}>{skill.slug}</p>
            <Badge
              variant={skill.status === 'published' ? 'default' : 'secondary'}
              className="rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide"
            >
              {skill.status === 'published' ? 'PUBLISHED' : 'DRAFT'}
            </Badge>
          </div>
          {skill.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <TagPill
                  key={tag}
                  label={tag}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          <Button asChild variant="outline" className="rounded-lg">
            <Link href={`/skills/${skill.id}/edit`}>
              <Edit className="h-3.5 w-3.5" /> 编辑
            </Link>
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={duplicating}
            variant="outline"
            className="rounded-lg"
          >
            <Copy className="h-3.5 w-3.5" /> {duplicating ? '复制中...' : '复制'}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishing}
            className="rounded-lg"
          >
            <UploadCloud className="h-3.5 w-3.5" /> {publishing ? '发布中...' : '发布'}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            variant="destructive"
            className="rounded-lg"
          >
            <Trash2 className="h-3.5 w-3.5" /> 删除
          </Button>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-4">
        {/* Purpose */}
        <section className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
            用途
          </h2>
          <MarkdownBlock content={skill.summary} />
        </section>

        {/* Inputs & Outputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
              输入
            </h2>
            <MarkdownBlock content={skill.inputs} />
          </section>
          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
              输出
            </h2>
            <MarkdownBlock content={skill.outputs} />
          </section>
        </div>

        {/* Workflow */}
        <section className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
            工作流程
          </h2>
          <ol className="space-y-2">
            {(skill.steps as string[]).map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Risks */}
        {skill.risks && (
          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
              风险
            </h2>
            <MarkdownBlock content={skill.risks} />
          </section>
        )}

        {/* Triggers */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-3.5 w-3.5" style={{ color: 'var(--warning)' }} />
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
              触发词
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(skill.triggers as string[]).map((t, i) => (
              <span
                key={i}
                className="rounded-lg px-3 py-1.5 text-xs font-mono"
                style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}
              >
                &quot;{t}&quot;
              </span>
            ))}
          </div>
        </section>

        {/* Guardrails */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
              安全护栏
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg p-3" style={{ background: 'var(--muted)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>升级策略</p>
              <p className="text-sm font-medium">{skill.guardrails.escalation}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--muted)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>用户可调用</p>
              <p className="text-sm font-medium">{skill.guardrails.user_invocable ? '是' : '否'}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--muted)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>模型调用</p>
              <p className="text-sm font-medium">{skill.guardrails.disable_model_invocation ? '已禁用' : '已启用'}</p>
            </div>
            {skill.guardrails.allowed_tools.length > 0 && (
              <div className="rounded-lg p-3" style={{ background: 'var(--muted)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)' }}>允许的工具</p>
                <p className="text-sm font-medium">{skill.guardrails.allowed_tools.join(', ')}</p>
              </div>
            )}
          </div>
          {skill.guardrails.stop_conditions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted-foreground)' }}>停止条件</p>
              <ul className="space-y-1">
                {skill.guardrails.stop_conditions.map((sc, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                    {sc}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Tests */}
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="h-3.5 w-3.5" style={{ color: 'var(--success)' }} />
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
              测试
            </h2>
          </div>
          <div className="space-y-3">
            {(skill.tests as Array<{ name: string; input: string; expected_output: string }>).map((t, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: 'var(--muted)' }}>
                <p className="text-sm font-medium mb-2">{t.name}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>输入</p>
                    <code className="text-xs font-mono rounded px-2 py-1 block" style={{ background: 'var(--card)' }}>{t.input}</code>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>预期输出</p>
                    <code className="text-xs font-mono rounded px-2 py-1 block" style={{ background: 'var(--card)' }}>{t.expected_output}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Supporting Files */}
        {files.length > 0 && (
          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
              支持文件
            </h2>
            <div className="space-y-1.5">
              {files.map((f) => (
                <div key={f.path} className="flex items-center justify-between rounded-lg p-2.5 transition-colors" style={{ background: 'var(--muted)' }}>
                  <div className="flex items-center gap-2.5">
                    <File className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
                    <button
                      type="button"
                      onClick={() => void handlePreviewFile(f)}
                      className="text-left text-sm font-mono hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                    >
                      {f.path}
                    </button>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{f.mime}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Version History */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                版本历史
              </h2>
            </div>
            <Button onClick={() => void fetchVersions()} variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs">
              刷新
            </Button>
          </div>
          {versionLoading ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>版本加载中...</p>
          ) : versions.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无版本记录</p>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between rounded-lg p-2.5" style={{ background: 'var(--muted)' }}>
                  <div>
                    <p className="text-sm font-medium">v{version.version} · {version.title || '未命名版本'}</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-md px-2 text-xs"
                    onClick={() => void handleRollback(version.id)}
                    disabled={rollingVersionId === version.id}
                  >
                    {rollingVersionId === version.id ? '回滚中...' : '回滚到此版本'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Publication History */}
        <section className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
            发布记录
          </h2>
          {publications.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>暂无发布记录</p>
          ) : (
            <div className="space-y-2">
              {publications.map((item) => (
                <div key={item.id} className="rounded-lg p-2.5" style={{ background: 'var(--muted)' }}>
                  <p className="text-sm font-medium">版本 v{item.version}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    发布于 {new Date(item.publishedAt).toLocaleString()}
                  </p>
                  {item.note && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      备注：{item.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Export Section */}
        <section className="card p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--muted-foreground)' }}>
            导出
          </h2>
          <Button
            onClick={handleLint}
            variant="secondary"
            className="rounded-lg text-sm font-medium"
          >
            运行校验
          </Button>

          {friendlyLintIssues.length > 0 && (
            <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--danger-light)' }}>
              <p className="font-medium text-sm flex items-center gap-2 mb-2" style={{ color: 'var(--danger)' }}>
                <AlertCircle className="h-4 w-4" /> 校验失败
              </p>
              <ul className="space-y-2">
                {friendlyLintIssues.map((e, i) => (
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
            <div className="mt-4 space-y-3">
              <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'var(--success-light)' }}>
                <CheckCircle className="h-4 w-4" style={{ color: 'var(--success)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>校验通过</p>
              </div>
              <div className="flex gap-2">
                <Button asChild className="rounded-lg">
                  <a href={`/api/skills/${skill.id}/export.zip`} data-testid="export-zip-btn">
                    <Download className="h-3.5 w-3.5" /> 导出 ZIP
                  </a>
                </Button>
                <Button asChild variant="outline" className="rounded-lg">
                  <a href={`/api/skills/${skill.id}/export.md`}>导出 MD</a>
                </Button>
                <Button asChild variant="outline" className="rounded-lg">
                  <a href={`/api/skills/${skill.id}/export.json`}>导出 JSON</a>
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Footer meta */}
      <div className="mt-6 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        创建于 {new Date(skill.createdAt).toLocaleString()} · 更新于 {new Date(skill.updatedAt).toLocaleString()}
      </div>
    </div>
  )
}
