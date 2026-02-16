'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, User } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '@/lib/chat/types'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isUser ? 'var(--muted)' : 'var(--accent)',
          color: isUser ? 'var(--foreground)' : 'white',
        }}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
        style={{
          background: isUser ? 'var(--accent)' : 'var(--muted)',
          color: isUser ? 'white' : 'var(--foreground)',
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
  )
}

/** 流式输出中的临时消息气泡 */
export function StreamingMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--accent)', color: 'white' }}
      >
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div
        className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
        style={{ background: 'var(--muted)' }}
      >
        <div className="chat-markdown break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          <span className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: 'var(--accent)' }} />
        </div>
      </div>
    </div>
  )
}
