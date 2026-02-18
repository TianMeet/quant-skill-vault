'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Layers, Plus, MessageSquarePlus } from 'lucide-react'
import { useChatPanel } from '@/lib/chat/chat-context'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'

export function Nav() {
  const pathname = usePathname()
  const { toggle } = useChatPanel()
  const isCreatePage = pathname === '/skills/new'

  const links = [
    {
      href: '/skills',
      label: '技能列表',
      match: (p: string) => p === '/skills' || (p.startsWith('/skills/') && p !== '/skills/new'),
    },
    { href: '/drafts', label: '草稿管理', match: (p: string) => p === '/drafts' },
    { href: '/tags', label: '标签管理', match: (p: string) => p === '/tags' },
  ]

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b"
      style={{
        background: 'color-mix(in srgb, var(--background) 80%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/skills" className="flex items-center gap-2.5 group">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Layers className="h-4 w-4" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Skill 管理平台</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  link.match(pathname)
                    ? 'font-medium'
                    : 'opacity-60 hover:opacity-100'
                )}
                style={link.match(pathname) ? { background: 'var(--muted)' } : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            onClick={toggle}
            variant="outline"
            className="rounded-lg px-3"
            title="AI 创建 Skill"
            aria-label="打开 AI 聊天面板"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
            <span className="hidden sm:inline">AI 对话</span>
          </Button>
          {isCreatePage ? (
            <Button asChild variant="outline" className="rounded-lg px-3.5">
              <Link href="/skills">
                <Home className="h-3.5 w-3.5" />
                返回主页
              </Link>
            </Button>
          ) : (
            <Button asChild className="rounded-lg px-3.5">
              <Link href="/skills/new">
                <Plus className="h-3.5 w-3.5" />
                新建 Skill
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
