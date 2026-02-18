'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock3, RefreshCw, Trash2, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useNotify } from '@/components/ui/notify-provider'
import { toUserFriendlyErrorMessage } from '@/lib/friendly-validation'
import { guardedFetch } from '@/lib/guarded-fetch'

type DraftMode = 'new' | 'edit'

interface DraftItem {
  id: number
  key: string
  mode: DraftMode
  skillId: number | null
  version: number
  updatedAt: string
}

function getDraftContinueUrl(item: DraftItem): string {
  if (item.mode === 'edit' && item.skillId) {
    return `/skills/${item.skillId}/edit?draftKey=${encodeURIComponent(item.key)}`
  }
  return `/skills/new?draftKey=${encodeURIComponent(item.key)}`
}

export default function DraftsPage() {
  const notify = useNotify()
  const [items, setItems] = useState<DraftItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'all' | DraftMode>('all')
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchDrafts = useCallback(async () => {
    setLoading(true)
    try {
      const query = mode === 'all' ? '' : `?mode=${mode}`
      const res = await guardedFetch(`/api/skill-drafts${query}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notify.error(toUserFriendlyErrorMessage(data.error || `加载草稿失败（${res.status}）`))
        setItems([])
        return
      }
      const data = await res.json().catch(() => ({}))
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      notify.error('加载草稿失败，请稍后重试。')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [mode, notify])

  useEffect(() => {
    void fetchDrafts()
  }, [fetchDrafts])

  const groupedLabel = useMemo(() => {
    if (mode === 'all') return '全部草稿'
    return mode === 'new' ? '新建草稿' : '编辑草稿'
  }, [mode])

  async function confirmDelete() {
    if (!pendingDeleteKey) return
    setDeleting(true)
    try {
      const res = await guardedFetch(`/api/skill-drafts/${encodeURIComponent(pendingDeleteKey)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notify.error(toUserFriendlyErrorMessage(data.error || `删除草稿失败（${res.status}）`))
        return
      }
      notify.success('草稿已删除')
      setItems((prev) => prev.filter((item) => item.key !== pendingDeleteKey))
    } catch {
      notify.error('删除草稿失败，请稍后重试。')
    } finally {
      setDeleting(false)
      setPendingDeleteKey(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <ConfirmDialog
        open={!!pendingDeleteKey}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteKey(null)
        }}
        title="确认删除草稿"
        description={pendingDeleteKey ? `将删除草稿 ${pendingDeleteKey}，此操作不可撤销。` : undefined}
        confirmText="删除草稿"
        confirmVariant="destructive"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />

      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">草稿管理</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            管理服务端自动保存的 Skill 草稿
          </p>
        </div>
        <Button onClick={() => void fetchDrafts()} variant="outline" className="rounded-lg">
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === 'all' ? 'default' : 'outline'}
          className="rounded-lg"
          onClick={() => setMode('all')}
        >
          全部
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'new' ? 'default' : 'outline'}
          className="rounded-lg"
          onClick={() => setMode('new')}
        >
          新建草稿
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'edit' ? 'default' : 'outline'}
          className="rounded-lg"
          onClick={() => setMode('edit')}
        >
          编辑草稿
        </Button>
        <span className="ml-auto text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {groupedLabel} · {items.length} 条
        </span>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="card p-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            草稿加载中...
          </div>
        ) : items.length === 0 ? (
          <div className="card p-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            暂无草稿记录
          </div>
        ) : (
          items.map((item) => (
            <div key={item.key} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={item.mode === 'edit' ? 'default' : 'secondary'} className="rounded-md px-2 py-0.5 text-[10px] uppercase">
                    {item.mode}
                  </Badge>
                  <span className="truncate text-sm font-medium">{item.key}</span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  <Clock3 className="h-3 w-3" />
                  最近更新：{new Date(item.updatedAt).toLocaleString()} · 版本 v{item.version}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild size="sm" className="rounded-lg">
                  <Link href={getDraftContinueUrl(item)}>
                    <PencilLine className="h-3.5 w-3.5" /> 继续编辑
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setPendingDeleteKey(item.key)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
