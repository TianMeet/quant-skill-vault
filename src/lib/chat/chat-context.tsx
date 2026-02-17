'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { SkillDraft } from './types'

interface ChatContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  skillDraft: SkillDraft
  updateDraft: (partial: SkillDraft) => void
  resetDraft: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [skillDraft, setSkillDraft] = useState<SkillDraft>({})

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const updateDraft = useCallback((partial: SkillDraft) => {
    setSkillDraft((prev) => ({
      ...prev,
      ...partial,
      // guardrails 需要深度合并
      guardrails: partial.guardrails
        ? { ...prev.guardrails, ...partial.guardrails }
        : prev.guardrails,
    }))
  }, [])

  const resetDraft = useCallback(() => setSkillDraft({}), [])

  return (
    <ChatContext.Provider value={{ isOpen, open, close, toggle, skillDraft, updateDraft, resetDraft }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatPanel() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatPanel must be used within ChatProvider')
  return ctx
}
