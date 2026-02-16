'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="inline-flex items-center justify-center rounded-lg p-2 transition-all hover:opacity-80 active:scale-[0.97] border"
      style={{ borderColor: 'var(--border)' }}
      title={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
      aria-label={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
