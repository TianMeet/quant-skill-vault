'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, Download, ArrowRight, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toFriendlyLintSummary, toUserFriendlyErrorMessage } from '@/lib/friendly-validation'

interface Skill {
  id: number
  title: string
  slug: string
  summary: string
  tags: string[]
  updatedAt: string
}

interface Tag {
  id: number
  name: string
  count: number
}

export default function SkillsListPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      if (res.ok) {
        setTags(await res.json())
      } else {
        setTags([])
      }
    } catch {
      setTags([])
    }
  }, [])

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const params = new URLSearchParams()
    if (query) params.set('query', query)
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','))
    try {
      const res = await fetch(`/api/skills?${params}`)
      if (res.ok) {
        setSkills(await res.json())
      } else {
        const data = await res.json().catch(() => ({}))
        setSkills([])
        setLoadError(toUserFriendlyErrorMessage(data.error || `加载失败（${res.status}）`))
      }
    } catch {
      setSkills([])
      setLoadError('加载列表失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [query, selectedTags])

  useEffect(() => {
    void fetchTags()
  }, [fetchTags])

  useEffect(() => {
    void fetchSkills()
  }, [fetchSkills])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function handleExportZip(e: React.MouseEvent, id: number, slug: string) {
    e.preventDefault()
    e.stopPropagation()
    const res = await fetch(`/api/skills/${id}/export.zip`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const details =
        Array.isArray(data.errors) && data.errors.length > 0
          ? toFriendlyLintSummary(data.errors)
          : toUserFriendlyErrorMessage(data.error)
      alert(`导出失败：\n${details}`)
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">技能列表</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          管理和组织你的 Skill 协议
        </p>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <Input
            type="text"
            placeholder="搜索 Skill..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg py-2.5 pl-10 pr-4 text-sm"
          />
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                variant={selectedTags.includes(tag.name) ? 'default' : 'secondary'}
                className="h-auto rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                {tag.name}
                <span className="ml-1 opacity-60">{tag.count}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Skills Grid */}
      {loadError && (
        <div
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))',
            background: 'var(--danger-light)',
            color: 'var(--danger)',
          }}
        >
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-5 w-3/4 mb-3" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            <Package className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">暂无 Skill</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            创建你的第一个 Skill 协议开始使用
          </p>
          <Button asChild className="mt-4 rounded-lg">
            <Link href="/skills/new">
              创建 Skill
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="card group block p-5 animate-in"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-[15px] leading-snug group-hover:opacity-80 transition-opacity">
                  {skill.title}
                </h3>
                <Button
                  onClick={(e) => handleExportZip(e, skill.id, skill.slug)}
                  variant="ghost"
                  size="icon"
                  className="shrink-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  title="导出 ZIP"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p
                className="mt-2 text-sm leading-relaxed line-clamp-2"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {skill.summary}
              </p>
              {skill.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {skill.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  更新于 {new Date(skill.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
