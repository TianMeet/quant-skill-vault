'use client'

import { useRef, useEffect, useState, useMemo, useCallback, type KeyboardEvent } from 'react'
import { Send, RotateCcw, Square, Terminal, Sparkles, Loader2 } from 'lucide-react'
import { useChat } from '@/lib/chat/use-chat'
import { useSkillStore } from '@/lib/stores/skill-store'
import { ChatMessage, StreamingMessage } from './chat-message'
import { ChatSkillPreview } from './chat-skill-preview'
import type { SkillDraft } from '@/lib/chat/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const QUICK_PROMPTS = [
  '帮我创建一个代码审查 Skill',
  '创建一个数据分析流程 Skill',
  '我需要一个自动化测试 Skill',
]

export function ConsolePanel() {
  const store = useSkillStore()

  const handleDraftUpdate = useCallback(
    (draft: SkillDraft) => {
      const fields = Object.keys(draft) as Array<keyof SkillDraft>
      if (fields.length > 0) {
        store.setActiveField(fields[0])
      }
      store.applyDraft(draft)
      setTimeout(() => store.setActiveField(null), 600)
    },
    [store],
  )

  const {
    messages,
    isStreaming,
    streamingText,
    sendMessage,
    createSkill,
    stopStreaming,
    reset,
  } = useChat({ onDraftUpdate: handleDraftUpdate })

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const progress = useMemo(() => {
    let filled = 0
    const total = 6
    if (store.title) filled++
    if (store.summary) filled++
    if (store.steps.filter(Boolean).length >= 3) filled++
    if (store.triggers.filter(Boolean).length >= 3) filled++
    if (
      store.guardrails.stop_conditions.filter(Boolean).length >= 1 &&
      store.guardrails.escalation
    ) filled++
    if (
      store.tests.length >= 1 &&
      store.tests[0]?.name &&
      store.tests[0]?.input &&
      store.tests[0]?.expected_output
    ) filled++
    return { filled, total }
  }, [store])

  const creationGuide = useMemo(() => {
    const checklist = [
      {
        key: 'title',
        label: '标题',
        done: !!store.title.trim(),
        prompt: '请先帮我确定一个清晰可复用的 Skill 标题，并解释为什么这样命名。',
      },
      {
        key: 'summary',
        label: '摘要',
        done: !!store.summary.trim(),
        prompt: '请根据当前目标写一句精炼摘要，说明这个 Skill 解决什么问题。',
      },
      {
        key: 'steps',
        label: '步骤',
        done: store.steps.filter((s) => s.trim()).length >= 3,
        prompt: '请补齐至少 3 条可执行步骤，使用祈使语气，并避免抽象描述。',
      },
      {
        key: 'triggers',
        label: '触发词',
        done: store.triggers.filter((t) => t.trim()).length >= 3,
        prompt: '请补齐至少 3 条真实用户会说的触发短语。',
      },
      {
        key: 'guardrails',
        label: '护栏',
        done:
          store.guardrails.stop_conditions.filter((s) => s.trim()).length >= 1 &&
          ['REVIEW', 'BLOCK', 'ASK_HUMAN'].includes(store.guardrails.escalation),
        prompt: '请为我补齐安全护栏：至少 1 条 stop condition，并给出合适的 escalation。',
      },
      {
        key: 'tests',
        label: '测试',
        done:
          store.tests.some(
            (t) => t.name.trim() && t.input.trim() && t.expected_output.trim(),
          ),
        prompt: '请补齐至少 1 条完整测试用例（名称、输入、预期输出）。',
      },
    ]
    const missing = checklist.filter((item) => !item.done)
    return { checklist, missing, next: missing[0] }
  }, [
    store.title,
    store.summary,
    store.steps,
    store.triggers,
    store.guardrails.stop_conditions,
    store.guardrails.escalation,
    store.tests,
  ])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300)
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
  }

  const handleSendPreset = (text: string) => {
    if (!text || isStreaming) return
    setInput('')
    sendMessage(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReset = () => {
    reset()
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative flex h-full flex-col bg-[var(--background)]">
      {/* Header */}
      <div
        className="shrink-0 border-b bg-[var(--card)] px-3 py-2.5"
        style={{ borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="truncate text-xs font-semibold">AI 对话建 Skill</span>
            </div>
            <p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              实时填充左侧表单字段
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="h-5 rounded-md border border-[var(--border)] px-1.5 font-mono text-[10px]"
            >
              {progress.filled}/{progress.total}
            </Badge>
            {isStreaming && (
              <Badge
                variant="outline"
                className="h-5 gap-1 rounded-md border-[var(--accent)] px-1.5 text-[10px] text-[var(--accent)]"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                生成中
              </Badge>
            )}
            <Button
              onClick={handleReset}
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 text-[var(--muted-foreground)]"
              title="重置对话"
              aria-label="重置对话"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      {creationGuide.missing.length > 0 && (
        <div
          className="shrink-0 border-b bg-[var(--card)]/70 px-3 py-2"
          style={{ borderColor: 'color-mix(in srgb, var(--border) 68%, transparent)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              待补齐：{creationGuide.missing.slice(0, 3).map((item) => item.label).join('、')}
              {creationGuide.missing.length > 3 ? ` 等${creationGuide.missing.length}项` : ''}
            </p>
            {!isStreaming && creationGuide.next && (
              <Button
                onClick={() => handleSendPreset(creationGuide.next.prompt)}
                type="button"
                size="sm"
                variant="secondary"
                className="h-6 rounded-md px-2 text-[10px]"
              >
                引导下一步
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <div
              className="w-full max-w-[320px] rounded-xl border border-dashed p-4"
              style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
            >
              <div className="mb-3 flex items-center justify-center">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ background: 'var(--card)', color: 'var(--accent)' }}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              <p className="text-sm font-medium">从一句需求开始</p>
              <p className="mb-3 mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                AI 会边对话边补齐标题、步骤、触发词与测试
              </p>
              <div className="space-y-1.5">
                {QUICK_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    onClick={() => handleSendPreset(prompt)}
                    variant="secondary"
                    className="h-auto w-full justify-start rounded-md px-3 py-2 text-left text-xs font-medium text-[var(--foreground)]"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-2">
              {msg.content && <ChatMessage message={msg} />}
              {msg.toolCall && (
                <ChatSkillPreview
                  toolCall={msg.toolCall}
                  onConfirm={createSkill}
                  created={msg.toolResult ?? undefined}
                />
              )}
            </div>
          ))}

          {isStreaming && streamingText && <StreamingMessage text={streamingText} />}

          {isStreaming && !streamingText && (
            <div className="flex items-center gap-2 pl-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
              AI 正在思考并生成回答...
            </div>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <div
        className="shrink-0 border-t bg-[var(--card)] px-3 py-2.5"
        style={{ borderColor: 'color-mix(in srgb, var(--border) 78%, transparent)' }}
      >
        <div
          className="rounded-lg border px-2.5 py-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-[var(--input-ring)]"
          style={{ background: 'var(--background)', borderColor: 'var(--input-border)' }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想创建的 Skill，例如：帮我做一个用于量化策略复盘的分析 Skill..."
            rows={2}
            className="min-h-[42px] max-h-[120px] resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
            disabled={isStreaming}
            aria-label="输入消息"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              Shift+Enter 换行 · Enter 发送
            </p>
            <div className="flex items-center gap-1.5">
              {!isStreaming && messages.length > 0 && (
                <Button
                  onClick={handleReset}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                >
                  <RotateCcw className="h-3 w-3" />
                  重置
                </Button>
              )}
              {isStreaming ? (
                <Button
                  onClick={stopStreaming}
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  aria-label="停止生成"
                >
                  <Square className="h-3.5 w-3.5" />
                  停止
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  type="button"
                  disabled={!input.trim()}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  aria-label="发送消息"
                >
                  <Send className="h-3.5 w-3.5" />
                  发送
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
