'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type NotifyType = 'success' | 'error' | 'info'

type NotifyItem = {
  id: number
  type: NotifyType
  message: string
}

type NotifyOptions = {
  durationMs?: number
}

type NotifyContextValue = {
  success: (message: string, options?: NotifyOptions) => void
  error: (message: string, options?: NotifyOptions) => void
  info: (message: string, options?: NotifyOptions) => void
}

const DEFAULT_DURATION = 2200

const NotifyContext = createContext<NotifyContextValue | null>(null)

function getTypeStyle(type: NotifyType) {
  if (type === 'success') {
    return {
      icon: <CheckCircle2 className="h-4 w-4 shrink-0" />,
      background: 'var(--success-light)',
      borderColor: 'color-mix(in srgb, var(--success) 40%, var(--border))',
      color: 'var(--success)',
    }
  }
  if (type === 'error') {
    return {
      icon: <AlertCircle className="h-4 w-4 shrink-0" />,
      background: 'var(--danger-light)',
      borderColor: 'color-mix(in srgb, var(--danger) 40%, var(--border))',
      color: 'var(--danger)',
    }
  }
  return {
    icon: <Info className="h-4 w-4 shrink-0" />,
    background: 'var(--accent-light)',
    borderColor: 'color-mix(in srgb, var(--accent) 38%, var(--border))',
    color: 'var(--accent)',
  }
}

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotifyItem[]>([])
  const nextIdRef = useRef(1)

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const push = useCallback((type: NotifyType, message: string, options?: NotifyOptions) => {
    const trimmed = message.trim()
    if (!trimmed) return

    const id = nextIdRef.current++
    setItems((prev) => [...prev, { id, type, message: trimmed }])

    const durationMs = options?.durationMs ?? DEFAULT_DURATION
    window.setTimeout(() => {
      remove(id)
    }, durationMs)
  }, [remove])

  const value = useMemo<NotifyContextValue>(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      info: (message, options) => push('info', message, options),
    }),
    [push]
  )

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-16 z-[70] flex w-[min(92vw,360px)] flex-col gap-2"
        aria-live="polite"
      >
        {items.map((item) => {
          const style = getTypeStyle(item.type)
          return (
            <div
              key={item.id}
              className="pointer-events-auto animate-in rounded-lg border px-3 py-2 shadow-[var(--shadow-md)]"
              style={{
                background: style.background,
                borderColor: style.borderColor,
                color: style.color,
              }}
              role={item.type === 'error' ? 'alert' : 'status'}
            >
              <div className="flex items-center gap-2">
                {style.icon}
                <p className="flex-1 text-sm leading-5">{item.message}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded p-0.5 opacity-60 hover:opacity-100"
                  onClick={() => remove(item.id)}
                  aria-label="关闭提示"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </NotifyContext.Provider>
  )
}

export function useNotify() {
  const context = useContext(NotifyContext)
  if (!context) {
    throw new Error('useNotify must be used within NotifyProvider')
  }
  return context
}
