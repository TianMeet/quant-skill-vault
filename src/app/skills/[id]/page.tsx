'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Download, Edit, Trash2, AlertCircle, CheckCircle, File, ChevronLeft, Shield, Zap, FlaskConical } from 'lucide-react'
import type { SkillGuardrails, SkillTestCase } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface SkillDetail {
  id: number
  title: string
  slug: string
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

interface LintError {
  field: string
  message: string
}

export default function SkillDetailPage() {
  const params = useParams()
  const router = useRouter()
  const skillId = Array.isArray(params.id) ? params.id[0] : params.id
  const [skill, setSkill] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [lintErrors, setLintErrors] = useState<LintError[]>([])
  const [lintPassed, setLintPassed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [files, setFiles] = useState<SkillFileItem[]>([])

  const fetchSkill = useCallback(async () => {
    if (!skillId) return
    setLoading(true)
    const res = await fetch(`/api/skills/${skillId}`)
    if (res.ok) {
      setSkill(await res.json())
    }
    setLoading(false)
  }, [skillId])

  const fetchFiles = useCallback(async () => {
    if (!skillId) return
    const res = await fetch(`/api/skills/${skillId}/files`)
    if (res.ok) setFiles(await res.json())
  }, [skillId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSkill()
    void fetchFiles()
  }, [fetchSkill, fetchFiles])

  async function handleDelete() {
    if (!skillId) return
    if (!confirm('确定删除该 Skill？')) return
    setDeleting(true)
    await fetch(`/api/skills/${skillId}`, { method: 'DELETE' })
    router.push('/skills')
  }

  async function handleLint() {
    setLintErrors([])
    setLintPassed(false)
    const res = await fetch('/api/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(skill),
    })
    const data = await res.json()
    if (data.valid) {
      setLintPassed(true)
    } else {
      setLintErrors(data.errors)
    }
  }

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
        <p className="text-sm" style={{ color: 'var(--danger)' }}>Skill 未找到</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 animate-in">
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
          <p className="mt-1 text-sm font-mono" style={{ color: 'var(--muted-foreground)' }}>{skill.slug}</p>
          {skill.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skill.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="rounded-md px-2.5 py-0.5 text-xs font-medium"
                >
                  {tag}
                </Badge>
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
          <p className="text-sm leading-relaxed">{skill.summary}</p>
        </section>

        {/* Inputs & Outputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
              输入
            </h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{skill.inputs}</p>
          </section>
          <section className="card p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted-foreground)' }}>
              输出
            </h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{skill.outputs}</p>
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
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{skill.risks}</p>
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
                    <a
                      href={`/api/skills/${skill.id}/files?path=${encodeURIComponent(f.path)}`}
                      className="text-sm font-mono hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--accent)' }}
                    >
                      {f.path}
                    </a>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{f.mime}</span>
                </div>
              ))}
            </div>
          </section>
        )}

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

          {lintErrors.length > 0 && (
            <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--danger-light)' }}>
              <p className="font-medium text-sm flex items-center gap-2 mb-2" style={{ color: 'var(--danger)' }}>
                <AlertCircle className="h-4 w-4" /> 校验失败
              </p>
              <ul className="space-y-1">
                {lintErrors.map((e, i) => (
                  <li key={i} className="text-sm" style={{ color: 'var(--danger)' }}>
                    <span className="font-mono text-xs rounded px-1.5 py-0.5" style={{ background: 'var(--danger-light)' }}>{e.field}</span>{' '}
                    {e.message}
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
