'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ChatContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  return (
    <ChatContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatPanel() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatPanel must be used within ChatProvider')
  return ctx
}
