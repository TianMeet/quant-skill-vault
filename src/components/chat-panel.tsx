'use client'

import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { X, Send, RotateCcw, Square, MessageSquarePlus } from 'lucide-react'
import { useChatPanel } from '@/lib/chat/chat-context'
import { useChat } from '@/lib/chat/use-chat'
import { ChatMessage, StreamingMessage } from './chat-message'
import { ChatSkillPreview } from './chat-skill-preview'

export function ChatPanel() {
  const { isOpen, close } = useChatPanel()
  const {
    messages,
    isStreaming,
    streamingText,
    pendingToolCall,
    sendMessage,
    createSkill,
    stopStreaming,
    reset,
  } = useChat()

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  // 面板打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

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

  return (
    <>
      {/* 遮罩层 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* 面板 */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[420px] max-w-full flex flex-col border-l"
        style={{
          background: 'var(--background)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-lg)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        role="dialog"
        aria-label="AI 聊天面板"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold">AI 创建 Skill</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={reset}
              className="p-1.5 rounded-md hover:opacity-70 transition-opacity"
              title="重置对话"
              aria-label="重置对话"
            >
              <RotateCcw className="h-3.5 w-3.5" style={{ color: 'var(--muted-foreground)' }} />
            </button>
            <button
              onClick={close}
              className="p-1.5 rounded-md hover:opacity-70 transition-opacity"
              title="关闭"
              aria-label="关闭聊天面板"
            >
              <X className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <MessageSquarePlus className="h-10 w-10 mb-3" style={{ color: 'var(--border)' }} />
              <p className="text-sm font-medium mb-1">用对话创建 Skill</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                描述你想创建的 Skill，AI 会引导你完善所有细节
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3">
              {msg.content && <ChatMessage message={msg} />}
              {msg.toolCall && (
                <ChatSkillPreview
                  toolCall={msg.toolCall}
                  onConfirm={createSkill}
                  onEdit={close}
                  created={msg.toolResult ?? undefined}
                />
              )}
            </div>
          ))}

          {/* 流式输出 */}
          {isStreaming && streamingText && <StreamingMessage text={streamingText} />}

          {/* 加载指示器 */}
          {isStreaming && !streamingText && (
            <div className="flex gap-3">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </div>
              <div
                className="rounded-xl px-3.5 py-2.5"
                style={{ background: 'var(--muted)' }}
              >
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--muted-foreground)', animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--muted-foreground)', animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--muted-foreground)', animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div
          className="shrink-0 border-t px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="flex items-end gap-2 rounded-xl border px-3 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想创建的 Skill..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]"
              style={{ maxHeight: '120px', minHeight: '24px' }}
              disabled={isStreaming}
              aria-label="输入消息"
            />
            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="shrink-0 p-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: 'var(--danger)' }}
                aria-label="停止生成"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0 p-1.5 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-30"
                style={{ color: 'var(--accent)' }}
                aria-label="发送消息"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--muted-foreground)' }}>
            Shift+Enter 换行 · Enter 发送 · ESC 关闭
          </p>
        </div>
      </div>
    </>
  )
}
