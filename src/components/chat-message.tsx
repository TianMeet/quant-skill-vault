'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '@/lib/chat/types'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
        style={{
          background: isUser ? 'var(--accent-light)' : 'var(--card)',
          borderColor: isUser ? 'transparent' : 'var(--border)',
          color: isUser ? 'var(--accent)' : 'var(--foreground)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className={cn('max-w-[85%] space-y-1', isUser && 'items-end')}>
        <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
          <Badge
            variant="secondary"
            className={cn(
              'h-5 rounded-md px-1.5 text-[10px] font-medium',
              isUser
                ? 'border-transparent bg-[var(--accent-light)] text-[var(--accent)]'
                : 'border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]',
            )}
          >
            {isUser ? '你' : 'AI'}
          </Badge>
        </div>
        <div
          className="rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            background: isUser ? 'var(--accent)' : 'var(--card)',
            color: isUser ? 'white' : 'var(--foreground)',
            borderColor: isUser ? 'transparent' : 'var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="chat-markdown break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 流式输出中的临时消息气泡 */
export function StreamingMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
          color: 'var(--foreground)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="max-w-[85%] space-y-1">
        <Badge
          variant="secondary"
          className="h-5 w-fit rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 text-[10px] text-[var(--muted-foreground)]"
        >
          AI 生成中
        </Badge>
        <div
          className="rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="chat-markdown break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm align-middle" style={{ background: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
