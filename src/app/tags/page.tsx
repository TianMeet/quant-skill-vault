'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Tag, FolderTree, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { useNotify } from '@/components/ui/notify-provider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toUserFriendlyErrorMessage } from '@/lib/friendly-validation'

interface TagItem {
  id: number
  name: string
  count: number
  updatedAt: string
}

interface LinkedSkillItem {
  id: number
  title: string
  slug: string
  updatedAt: string
}

export default function TagsPage() {
  const notify = useNotify()
  const [tags, setTags] = useState<TagItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const [editingTagId, setEditingTagId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [mergingTagId, setMergingTagId] = useState<number | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string>('')
  const [busyTagId, setBusyTagId] = useState<number | null>(null)
  const [pendingDeleteTag, setPendingDeleteTag] = useState<TagItem | null>(null)

  const [expandedTagId, setExpandedTagId] = useState<number | null>(null)
  const [linkedSkillsByTag, setLinkedSkillsByTag] = useState<Record<number, LinkedSkillItem[]>>({})
  const [loadingSkillsTagId, setLoadingSkillsTagId] = useState<number | null>(null)

  const fetchTags = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tags?query=${encodeURIComponent(query)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setTags([])
        notify.error(toUserFriendlyErrorMessage(data.error || `加载标签失败（${res.status}）`))
        return
      }
      const data = await res.json().catch(() => ({}))
      const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []
      setTags(items)
    } catch {
      setTags([])
      notify.error('加载标签失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [query, notify])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchTags()
    }, 220)
    return () => clearTimeout(timer)
  }, [fetchTags])

  const mergeOptions = useMemo(
    () => tags.filter((item) => item.id !== mergingTagId),
    [tags, mergingTagId]
  )

  async function loadLinkedSkills(tagId: number) {
    setLoadingSkillsTagId(tagId)
    try {
      const res = await fetch(`/api/tags/${tagId}/skills`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notify.error(toUserFriendlyErrorMessage(data.error || `加载关联技能失败（${res.status}）`))
        return
      }
      const data = await res.json().catch(() => ({}))
      const skills = Array.isArray(data.skills) ? data.skills : []
      setLinkedSkillsByTag((prev) => ({ ...prev, [tagId]: skills }))
    } catch {
      notify.error('加载关联技能失败，请稍后重试。')
    } finally {
      setLoadingSkillsTagId(null)
    }
  }

  async function handleRename(tagId: number) {
    setBusyTagId(tagId)
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `重命名失败（${res.status}）`)
        notify.error(msg)
        return
      }
      notify.success('标签已更新')
      setEditingTagId(null)
      setEditingName('')
      await fetchTags()
    } catch {
      const msg = '重命名失败，请稍后重试。'
      notify.error(msg)
    } finally {
      setBusyTagId(null)
    }
  }

  async function handleDelete(tag: TagItem) {
    setPendingDeleteTag(tag)
  }

  async function confirmDeleteTag() {
    if (!pendingDeleteTag) return
    const tag = pendingDeleteTag
    setBusyTagId(tag.id)
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `删除失败（${res.status}）`)
        notify.error(msg)
        return
      }
      notify.success(`标签 "${tag.name}" 已删除`)
      if (expandedTagId === tag.id) setExpandedTagId(null)
      await fetchTags()
    } catch {
      const msg = '删除标签失败，请稍后重试。'
      notify.error(msg)
    } finally {
      setBusyTagId(null)
      setPendingDeleteTag(null)
    }
  }

  async function handleMerge(sourceTagId: number) {
    if (!mergeTargetId) {
      const msg = '请先选择合并目标标签。'
      notify.error(msg)
      return
    }
    setBusyTagId(sourceTagId)
    try {
      const res = await fetch('/api/tags/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTagId, targetTagId: Number(mergeTargetId) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = toUserFriendlyErrorMessage(data.error || `合并失败（${res.status}）`)
        notify.error(msg)
        return
      }
      notify.success('标签已完成合并')
      setMergingTagId(null)
      setMergeTargetId('')
      if (expandedTagId === sourceTagId) setExpandedTagId(null)
      await fetchTags()
    } catch {
      const msg = '合并标签失败，请稍后重试。'
      notify.error(msg)
    } finally {
      setBusyTagId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <ConfirmDialog
        open={!!pendingDeleteTag}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTag(null)
        }}
        title="确认删除标签"
        description={
          pendingDeleteTag
            ? `将删除标签 "${pendingDeleteTag.name}"，并解除它与技能的关联。`
            : undefined
        }
        confirmText="删除标签"
        confirmVariant="destructive"
        loading={busyTagId === pendingDeleteTag?.id}
        onConfirm={() => void confirmDeleteTag()}
      />

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">标签管理</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            统一维护标签命名，查看关联技能，执行标签合并与清理
          </p>
        </div>
        <Button type="button" variant="outline" className="rounded-lg" onClick={() => void fetchTags()}>
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索标签..."
          className="w-full rounded-lg py-2.5 pl-10 pr-4 text-sm"
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Tag className="mx-auto mb-2 h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
            <p className="text-sm">没有匹配的标签</p>
          </div>
        ) : (
          <div>
            {tags.map((tag) => (
              <div key={tag.id} className="border-b px-4 py-3 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-md px-2.5 py-0.5 text-xs">
                        {tag.name}
                      </Badge>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {tag.count} 个技能
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>
                        更新于 {new Date(tag.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        if (expandedTagId === tag.id) {
                          setExpandedTagId(null)
                          return
                        }
                        setExpandedTagId(tag.id)
                        if (!linkedSkillsByTag[tag.id]) void loadLinkedSkills(tag.id)
                      }}
                    >
                      <FolderTree className="h-3.5 w-3.5" />
                      关联技能
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        setEditingTagId(tag.id)
                        setEditingName(tag.name)
                        setMergingTagId(null)
                        setMergeTargetId('')
                      }}
                    >
                      重命名
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        setMergingTagId(tag.id)
                        setMergeTargetId('')
                        setEditingTagId(null)
                        setEditingName('')
                      }}
                    >
                      合并
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="rounded-md"
                      disabled={busyTagId === tag.id}
                      onClick={() => void handleDelete(tag)}
                    >
                      删除
                    </Button>
                  </div>
                </div>

                {editingTagId === tag.id && (
                  <div className="mt-3 flex flex-col gap-2 rounded-md border p-3 sm:flex-row" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="sm:flex-1" />
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-md"
                      disabled={busyTagId === tag.id}
                      onClick={() => void handleRename(tag.id)}
                    >
                      保存
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        setEditingTagId(null)
                        setEditingName('')
                      }}
                    >
                      取消
                    </Button>
                  </div>
                )}

                {mergingTagId === tag.id && (
                  <div className="mt-3 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                    <div className="sm:flex-1">
                      <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择目标标签" />
                        </SelectTrigger>
                        <SelectContent>
                          {mergeOptions.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.name} ({item.count})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-md"
                      disabled={busyTagId === tag.id || !mergeTargetId}
                      onClick={() => void handleMerge(tag.id)}
                    >
                      确认合并
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-md"
                      onClick={() => {
                        setMergingTagId(null)
                        setMergeTargetId('')
                      }}
                    >
                      取消
                    </Button>
                  </div>
                )}

                {expandedTagId === tag.id && (
                  <div className="mt-3 rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                    {loadingSkillsTagId === tag.id ? (
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>加载中...</div>
                    ) : (linkedSkillsByTag[tag.id] || []).length === 0 ? (
                      <div className="text-xs" style={{ color: 'var(--muted-foreground)' }}>该标签当前未关联技能</div>
                    ) : (
                      <div className="space-y-1.5">
                        {(linkedSkillsByTag[tag.id] || []).map((skill) => (
                          <Link key={skill.id} href={`/skills/${skill.id}`} className="block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[var(--muted)]">
                            <div className="font-medium">{skill.title}</div>
                            <div className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>
                              {skill.slug} · {new Date(skill.updatedAt).toLocaleDateString()}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
