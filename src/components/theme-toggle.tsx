'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      variant="outline"
      size="icon"
      className="rounded-lg"
      title={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
      aria-label={resolvedTheme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="h-3.5 w-3.5" />
      ) : (
        <Moon className="h-3.5 w-3.5" />
      )}
    </Button>
  )
}
