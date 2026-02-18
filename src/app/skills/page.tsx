'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Search, Download, ArrowRight, Package, Tag, Trash2, LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotify } from '@/components/ui/notify-provider'
import { TagCountPill, TagPill } from '@/components/tag-pill'
import { toFriendlyLintSummary, toUserFriendlyErrorMessage } from '@/lib/friendly-validation'
import { guardedFetch } from '@/lib/guarded-fetch'
import { normalizeTagNames } from '@/lib/tag-normalize'

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

const VIEW_MODE_STORAGE_KEY = 'qsv:skills:view-mode:v1'
const PAGINATION_ELLIPSIS = 'ellipsis'
const SEARCH_DEBOUNCE_MS = 400
const SEARCH_THROTTLE_MS = 900

function getVisiblePages(currentPage: number, totalPages: number): Array<number | typeof PAGINATION_ELLIPSIS> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, PAGINATION_ELLIPSIS, totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [1, PAGINATION_ELLIPSIS, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, PAGINATION_ELLIPSIS, currentPage - 1, currentPage, currentPage + 1, PAGINATION_ELLIPSIS, totalPages]
}

export default function SkillsListPage() {
  const notify = useNotify()
  const [skills, setSkills] = useState<Skill[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(9)
  const [sort, setSort] = useState('updated_desc')
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [viewModeHydrated, setViewModeHydrated] = useState(false)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false)
  const [selectedSkillIds, setSelectedSkillIds] = useState<number[]>([])
  const [batchTagInput, setBatchTagInput] = useState('')
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const lastQueryCommitAtRef = useRef(0)
  const hasFetchedOnceRef = useRef(false)

  const fetchTags = useCallback(async () => {
    try {
      const res = await guardedFetch('/api/tags')
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []
        setTags(items)
      } else {
        setTags([])
      }
    } catch {
      setTags([])
    }
  }, [])

  const fetchSkills = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('query', query)
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','))
    params.set('page', String(page))
    params.set('limit', String(limit))
    params.set('sort', sort)
    try {
      const res = await guardedFetch(`/api/skills?${params}`, { signal }, { throttleMs: 0 })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (Array.isArray(data)) {
          setSkills(data)
          setTotal(data.length)
          setTotalPages(1)
        } else {
          const items = Array.isArray(data.items) ? data.items : []
          setSkills(items)
          setTotal(typeof data.total === 'number' ? data.total : items.length)
          setTotalPages(typeof data.totalPages === 'number' ? data.totalPages : 1)
        }
      } else {
        const data = await res.json().catch(() => ({}))
        if (!hasFetchedOnceRef.current) {
          setSkills([])
          setTotal(0)
          setTotalPages(1)
        }
        notify.error(toUserFriendlyErrorMessage(data.error || `加载失败（${res.status}）`))
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!hasFetchedOnceRef.current) {
        setSkills([])
        setTotal(0)
        setTotalPages(1)
      }
      notify.error('加载列表失败，请稍后重试。')
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
        if (!hasFetchedOnceRef.current) {
          hasFetchedOnceRef.current = true
          setHasFetchedOnce(true)
        }
      }
    }
  }, [query, selectedTags, page, limit, sort, notify])

  useEffect(() => {
    void fetchTags()
  }, [fetchTags])

  useEffect(() => {
    const controller = new AbortController()
    void fetchSkills(controller.signal)
    return () => controller.abort()
  }, [fetchSkills])

  useEffect(() => {
    if (queryInput === query) return
    const elapsed = Date.now() - lastQueryCommitAtRef.current
    const throttleDelay = Math.max(0, SEARCH_THROTTLE_MS - elapsed)
    const delay = Math.max(SEARCH_DEBOUNCE_MS, throttleDelay)
    const timer = window.setTimeout(() => {
      lastQueryCommitAtRef.current = Date.now()
      setQuery(queryInput)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [queryInput, query])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (saved === 'card' || saved === 'list') {
        setViewMode(saved)
      }
    } catch {
      // ignore localStorage read failure
    } finally {
      setViewModeHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!viewModeHydrated || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // ignore localStorage write failure
    }
  }, [viewMode, viewModeHydrated])

  useEffect(() => {
    setPage((prev) => (prev === 1 ? prev : 1))
  }, [query, selectedTags, limit, sort])

  useEffect(() => {
    setSelectedSkillIds((prev) => prev.filter((id) => skills.some((skill) => skill.id === id)))
  }, [skills])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  function toggleSkillSelected(id: number) {
    setSelectedSkillIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  function toggleSelectCurrentPage() {
    const pageIds = skills.map((skill) => skill.id)
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedSkillIds.includes(id))
    setSelectedSkillIds((prev) => {
      if (allSelected) return prev.filter((id) => !pageIds.includes(id))
      return Array.from(new Set([...prev, ...pageIds]))
    })
  }

  const selectedCount = selectedSkillIds.length
  const visiblePages = useMemo(() => getVisiblePages(page, Math.max(1, totalPages)), [page, totalPages])
  const allCurrentPageSelected = useMemo(() => {
    if (skills.length === 0) return false
    return skills.every((skill) => selectedSkillIds.includes(skill.id))
  }, [skills, selectedSkillIds])

  async function runBatchAction(payload: { action: 'bulk-delete' | 'bulk-add-tags'; tags?: string[] }) {
    if (selectedSkillIds.length === 0) return
    setBatchLoading(true)
    try {
      const res = await guardedFetch('/api/skills/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: payload.action,
          skillIds: selectedSkillIds,
          tags: payload.tags,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = toUserFriendlyErrorMessage(data.error || `批量操作失败（${res.status}）`)
        notify.error(msg)
        return
      }
      const affected = typeof data.affected === 'number' ? data.affected : selectedSkillIds.length
      notify.success(
        payload.action === 'bulk-delete'
          ? `已删除 ${affected} 个 Skill`
          : `已为 ${affected} 个 Skill 添加标签`
      )
      setSelectedSkillIds([])
      setBatchTagInput('')
      await Promise.all([fetchSkills(), fetchTags()])
    } catch {
      const msg = '批量操作时网络异常，请重试。'
      notify.error(msg)
    } finally {
      setBatchLoading(false)
    }
  }

  async function handleBatchDelete() {
    if (selectedSkillIds.length === 0) return
    setBatchDeleteDialogOpen(true)
  }

  async function confirmBatchDelete() {
    if (selectedSkillIds.length === 0) {
      setBatchDeleteDialogOpen(false)
      return
    }
    await runBatchAction({ action: 'bulk-delete' })
    setBatchDeleteDialogOpen(false)
  }

  async function handleBatchAddTags() {
    const parsedTags = normalizeTagNames(batchTagInput.split(','))
    if (parsedTags.length === 0) {
      const msg = '请输入至少一个有效标签（多个标签可用逗号分隔）。'
      notify.error(msg)
      return
    }
    await runBatchAction({ action: 'bulk-add-tags', tags: parsedTags })
  }

  async function handleExportZip(e: React.MouseEvent, id: number, slug: string) {
    e.preventDefault()
    e.stopPropagation()
    const res = await guardedFetch(`/api/skills/${id}/export.zip`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const details =
        Array.isArray(data.errors) && data.errors.length > 0
          ? toFriendlyLintSummary(data.errors)
          : toUserFriendlyErrorMessage(data.error)
      notify.error(`导出失败：${details}`)
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.zip`
    a.click()
    URL.revokeObjectURL(url)
    notify.success('ZIP 导出已开始下载')
  }

  function formatUpdateDate(dateRaw: string) {
    return new Date(dateRaw).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <ConfirmDialog
        open={batchDeleteDialogOpen}
        onOpenChange={setBatchDeleteDialogOpen}
        title="确认批量删除"
        description={`将删除当前选中的 ${selectedCount} 个 Skill。此操作不可撤销。`}
        confirmText="删除"
        confirmVariant="destructive"
        loading={batchLoading}
        onConfirm={() => void confirmBatchDelete()}
      />

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
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="w-full rounded-lg py-2.5 pl-10 pr-4 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>排序</span>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger
                className="h-8 w-[132px] rounded-md border-[var(--border)] bg-[var(--card)] px-2 text-xs"
              >
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_desc">最近更新</SelectItem>
                <SelectItem value="updated_asc">最早更新</SelectItem>
                <SelectItem value="created_desc">最近创建</SelectItem>
                <SelectItem value="created_asc">最早创建</SelectItem>
                <SelectItem value="title_asc">标题 A-Z</SelectItem>
                <SelectItem value="title_desc">标题 Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>每页</span>
            <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
              <SelectTrigger
                className="h-8 w-[78px] rounded-md border-[var(--border)] bg-[var(--card)] px-2 text-xs"
              >
                <SelectValue placeholder="每页" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6</SelectItem>
                <SelectItem value="9">9</SelectItem>
                <SelectItem value="12">12</SelectItem>
                <SelectItem value="18">18</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            共 {total} 条
          </span>
          <div className="ml-auto inline-flex items-center rounded-md border p-0.5" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              className="h-7 rounded px-2 text-xs"
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              卡片
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              className="h-7 rounded px-2 text-xs"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
              列表
            </Button>
          </div>
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

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
              已选中 {selectedCount} 项
            </span>
            <Input
              value={batchTagInput}
              onChange={(e) => setBatchTagInput(e.target.value)}
              placeholder="批量添加标签（如: alpha, beta）"
              className="h-8 min-w-[220px] flex-1 rounded-md text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-md px-3 text-xs"
              disabled={batchLoading || normalizeTagNames(batchTagInput.split(',')).length === 0}
              onClick={() => void handleBatchAddTags()}
            >
              <Tag className="mr-1 h-3.5 w-3.5" />
              批量加标签
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-md border-[var(--danger)] px-3 text-xs text-[var(--danger)]"
              disabled={batchLoading}
              onClick={() => void handleBatchDelete()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              批量删除
            </Button>
          </div>
        )}
      </div>

      {!hasFetchedOnce && loading ? (
        viewMode === 'card' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5">
                <div className="skeleton h-5 w-3/4 mb-3" />
                <div className="skeleton h-4 w-full mb-2" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-3">
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-14 w-full" />
              ))}
            </div>
          </div>
        )
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
        <div className="space-y-4">
          {loading && (
            <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              正在更新列表...
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={allCurrentPageSelected}
                onChange={toggleSelectCurrentPage}
              />
              <span style={{ color: 'var(--muted-foreground)' }}>选择当前页</span>
            </label>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              当前页 {skills.length} 条
            </span>
          </div>

          {viewMode === 'card' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill) => (
                <Link
                  key={skill.id}
                  href={`/skills/${skill.id}`}
                  className="card group flex h-full flex-col p-5 animate-in"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div
                        className="mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSkillIds.includes(skill.id)}
                          onChange={() => toggleSkillSelected(skill.id)}
                          className="h-4 w-4 rounded border"
                          aria-label={`选择 ${skill.title}`}
                        />
                      </div>
                      <h3 className="line-clamp-2 font-semibold text-[15px] leading-snug group-hover:opacity-80 transition-opacity">
                        {skill.title}
                      </h3>
                    </div>
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

                  <div className="mt-3 h-7">
                    {skill.tags.length > 0 ? (
                      <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
                        {skill.tags.slice(0, 3).map((tag) => (
                          <TagPill
                            key={tag}
                            className="max-w-[110px]"
                            title={tag}
                            label={tag}
                          />
                        ))}
                        {skill.tags.length > 3 && (
                          <TagCountPill
                            title={`${skill.tags.length - 3} 个额外标签`}
                            label={`+${skill.tags.length - 3}`}
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        暂无标签
                      </span>
                    )}
                  </div>

                  <div className="mt-auto border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      更新于 {formatUpdateDate(skill.updatedAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="hidden grid-cols-[44px_minmax(0,2fr)_minmax(0,1fr)_130px_44px] gap-3 border-b px-4 py-2 text-xs font-medium md:grid" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                <span>选择</span>
                <span>Skill</span>
                <span>标签</span>
                <span>更新日期</span>
                <span className="text-right">导出</span>
              </div>
              <div>
                {skills.map((skill) => (
                  <Link
                    key={skill.id}
                    href={`/skills/${skill.id}`}
                    className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 border-b px-3 py-3 transition-colors hover:bg-[var(--muted)] last:border-b-0 md:grid-cols-[44px_minmax(0,2fr)_minmax(0,1fr)_130px_44px] md:gap-3 md:px-4"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkillIds.includes(skill.id)}
                        onChange={() => toggleSkillSelected(skill.id)}
                        className="h-4 w-4 rounded border"
                        aria-label={`选择 ${skill.title}`}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{skill.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {skill.summary}
                      </p>
                      <p className="mt-1 text-[11px] md:hidden" style={{ color: 'var(--muted-foreground)' }}>
                        更新于 {formatUpdateDate(skill.updatedAt)}
                      </p>
                    </div>

                    <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden md:flex">
                      {skill.tags.length > 0 ? (
                        <>
                          {skill.tags.slice(0, 2).map((tag) => (
                            <TagPill
                              key={tag}
                              className="max-w-[120px]"
                              title={tag}
                              label={tag}
                            />
                          ))}
                          {skill.tags.length > 2 && (
                            <TagCountPill label={`+${skill.tags.length - 2}`} />
                          )}
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          暂无标签
                        </span>
                      )}
                    </div>

                    <span className="hidden text-xs md:block" style={{ color: 'var(--muted-foreground)' }}>
                      {formatUpdateDate(skill.updatedAt)}
                    </span>

                    <Button
                      onClick={(e) => handleExportZip(e, skill.id, skill.slug)}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 justify-self-end rounded-md"
                      title="导出 ZIP"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div
            className="flex flex-col items-start justify-between gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              第 {page}/{Math.max(1, totalPages)} 页
            </span>

            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (loading || page <= 1) return
                      setPage((prev) => Math.max(1, prev - 1))
                    }}
                    className={loading || page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                  />
                </PaginationItem>

                {visiblePages.map((item, idx) => (
                  <PaginationItem key={`${item}-${idx}`}>
                    {item === PAGINATION_ELLIPSIS ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href="#"
                        isActive={item === page}
                        onClick={(e) => {
                          e.preventDefault()
                          if (loading || item === page) return
                          setPage(item)
                        }}
                        className={loading ? 'pointer-events-none opacity-50' : undefined}
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      const max = Math.max(1, totalPages)
                      if (loading || page >= max) return
                      setPage((prev) => Math.min(max, prev + 1))
                    }}
                    className={
                      loading || page >= Math.max(1, totalPages) ? 'pointer-events-none opacity-50' : undefined
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}
    </div>
  )
}
