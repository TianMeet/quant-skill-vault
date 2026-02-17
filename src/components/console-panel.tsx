'use client'

import { useRef, useEffect, useState, useMemo, useCallback, type KeyboardEvent } from 'react'
import { Send, RotateCcw, Square, Terminal } from 'lucide-react'
import { useChat } from '@/lib/chat/use-chat'
import { useSkillStore } from '@/lib/stores/skill-store'
import { ChatMessage, StreamingMessage } from './chat-message'
import { ChatSkillPreview } from './chat-skill-preview'
import type { SkillDraft } from '@/lib/chat/types'

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
    pendingToolCall,
    sendMessage,
    createSkill,
    stopStreaming,
    reset,
  } = useChat({ onDraftUpdate: handleDraftUpdate })

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const progress = useMemo(() => {
    const s = store
    let filled = 0
    const total = 6
    if (s.title) filled++
    if (s.summary) filled++
    if (s.steps.filter(Boolean).length >= 3) filled++
    if (s.triggers.filter(Boolean).length >= 3) filled++
    if (
      s.guardrails.stop_conditions.filter(Boolean).length >= 1 &&
      s.guardrails.escalation
    ) filled++
    if (
      s.tests.length >= 1 &&
      s.tests[0]?.name &&
      s.tests[0]?.input &&
      s.tests[0]?.expected_output
    ) filled++
    return { filled, total }
  }, [store.title, store.summary, store.steps, store.triggers, store.guardrails, store.tests])

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

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReset = () => {
    reset()
  }

  return (
    <div className="console-panel flex flex-col h-full border-l" style={{ background: 'var(--console-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-mono font-semibold">CONSOLE</span>
          {progress.filled > 0 && (
            <span
              className="text-[10px] font-mono font-medium px-1.5 py-0.5"
              style={{
                background: progress.filled === progress.total ? 'var(--success)' : 'var(--accent)',
                color: '#fff',
              }}
            >
              {progress.filled}/{progress.total}
            </span>
          )}
        </div>
        <button
          onClick={handleReset}
          className="p-1 hover:opacity-70 transition-opacity"
          title="重置对话"
          aria-label="重置对话"
        >
          <RotateCcw className="h-3 w-3" style={{ color: 'var(--muted-foreground)' }} />
        </button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Terminal className="h-8 w-8 mb-3" style={{ color: 'var(--console-border)' }} />
            <p className="text-xs font-mono font-medium mb-1">用对话创建 Skill</p>
            <p className="text-[10px] font-mono mb-4" style={{ color: 'var(--muted-foreground)' }}>
              描述你想创建的 Skill，AI 会实时填充左侧表单
            </p>
            <div className="space-y-1.5 w-full max-w-[240px]">
              {['帮我创建一个代码审查 Skill', '创建一个数据分析流程 Skill', '我需要一个自动化测试 Skill'].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left text-[11px] font-mono px-3 py-2 border transition-colors hover:border-[var(--console-accent)]"
                  style={{ borderColor: 'var(--console-border)', color: 'var(--console-muted)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

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
          <div className="flex gap-2 items-center">
            <Terminal className="h-3 w-3" style={{ color: 'var(--accent)' }} />
            <div className="flex gap-1">
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'var(--muted-foreground)', animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'var(--muted-foreground)', animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: 'var(--muted-foreground)', animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* 输入区 — 跟随全局主题 */}
      <div className="console-input shrink-0 border-t px-3 py-2">
        <div
          className="flex items-end gap-2 border rounded-md px-2.5 py-1.5"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想创建的 Skill..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none"
            style={{ maxHeight: '80px', minHeight: '20px', color: 'var(--foreground)' }}
            disabled={isStreaming}
            aria-label="输入消息"
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="shrink-0 p-1 rounded-md transition-opacity hover:opacity-70"
              style={{ color: 'var(--danger)' }}
              aria-label="停止生成"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="shrink-0 p-1 rounded-md transition-opacity hover:opacity-90 disabled:opacity-30"
              style={{ color: 'var(--accent)' }}
              aria-label="发送消息"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-[9px] font-mono mt-1 text-center" style={{ color: 'var(--muted-foreground)' }}>
          Shift+Enter 换行 · Enter 发送
        </p>
      </div>
    </div>
  )
}
