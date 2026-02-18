'use client'

import Image from 'next/image'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'

type FilePreviewKind = 'markdown' | 'code' | 'text' | 'image' | 'binary'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])
const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'php', 'cs',
  'c', 'h', 'cpp', 'hpp',
  'sh', 'bash', 'zsh', 'ps1', 'sql',
  'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'xml', 'xsd', 'html', 'css', 'scss', 'less',
])

const CODE_MIME_HINTS = [
  'application/json',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'application/sql',
  'text/x-python',
  'text/x-shellscript',
]

function getExt(filePath: string): string {
  const seg = filePath.split('/').pop() || ''
  const idx = seg.lastIndexOf('.')
  if (idx < 0) return ''
  return seg.slice(idx + 1).toLowerCase()
}

function resolveFilePreviewKind(params: {
  path: string
  mime: string
  isBinary: boolean
}): FilePreviewKind {
  const mime = String(params.mime || '').toLowerCase()
  const ext = getExt(params.path)

  if (params.isBinary) {
    if (mime.startsWith('image/')) return 'image'
    return 'binary'
  }

  if (MARKDOWN_EXTENSIONS.has(ext) || mime.includes('markdown')) {
    return 'markdown'
  }

  if (CODE_EXTENSIONS.has(ext) || CODE_MIME_HINTS.some((hint) => mime.includes(hint))) {
    return 'code'
  }

  return 'text'
}

interface FilePreviewContentProps {
  path: string
  mime: string
  isBinary: boolean
  contentText?: string
  contentBase64?: string
  className?: string
  embedded?: boolean
}

export function FilePreviewContent({
  path,
  mime,
  isBinary,
  contentText,
  contentBase64,
  className = '',
  embedded = false,
}: FilePreviewContentProps) {
  const kind = resolveFilePreviewKind({ path, mime, isBinary })
  const text = contentText || ''
  const codeLines = kind === 'code' ? text.replace(/\r\n/g, '\n').split('\n') : []
  const [copied, setCopied] = useState(false)
  const surfaceClass = embedded ? '' : 'rounded-xl border'
  const surfaceStyle = {
    borderColor: embedded ? undefined : 'var(--border)',
    background: embedded ? 'transparent' : 'color-mix(in srgb, var(--muted) 45%, var(--card))',
  }

  async function copyToClipboard(value: string) {
    if (!value) return
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  if (kind === 'image' && contentBase64) {
    return (
      <div className={`overflow-auto p-3 ${surfaceClass} ${className}`} style={surfaceStyle}>
        <Image
          src={`data:${mime || 'application/octet-stream'};base64,${contentBase64}`}
          alt={path}
          width={1200}
          height={800}
          unoptimized
          className="mx-auto h-auto max-h-[60vh] w-auto max-w-full rounded-lg"
        />
      </div>
    )
  }

  if (kind === 'markdown') {
    return (
      <div
        className={`chat-markdown overflow-auto p-4 text-sm leading-relaxed ${surfaceClass} ${className}`}
        style={surfaceStyle}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {text}
        </ReactMarkdown>
      </div>
    )
  }

  if (kind === 'code') {
    return (
      <div
        className={`min-w-0 max-w-full ${surfaceClass} ${className}`}
        style={surfaceStyle}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="flex items-center justify-end border-b px-2 py-1.5"
            style={{ borderColor: 'color-mix(in srgb, var(--border) 82%, transparent)', background: 'color-mix(in srgb, var(--muted) 72%, var(--card))' }}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={() => void copyToClipboard(text)}
            >
              {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              {copied ? '已复制' : '复制代码'}
            </Button>
          </div>
          <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-auto overflow-y-auto">
            <div className="inline-block min-w-full align-top font-mono text-[12px] leading-6">
              {codeLines.map((line, i) => (
                <div
                  key={`${i}:${line.length}`}
                  className="grid grid-cols-[72px_max-content]"
                >
                  <div
                    className="sticky left-0 z-[1] select-none border-r px-3 text-right tabular-nums"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)', background: 'color-mix(in srgb, var(--muted) 82%, var(--card))' }}
                  >
                    {i + 1}
                  </div>
                  <div className="whitespace-pre px-3 pr-5 text-[var(--foreground)]">{line || ' '}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (kind === 'text') {
    return (
      <pre
        className={`overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-6 ${surfaceClass} ${className}`}
        style={surfaceStyle}
      >
        {text}
      </pre>
    )
  }

  return (
    <div
      className={`p-4 text-sm ${surfaceClass} ${className}`}
      style={{ ...surfaceStyle, color: 'var(--muted-foreground)' }}
    >
      当前文件为二进制类型（{mime || 'application/octet-stream'}），暂不支持直接文本预览。
    </div>
  )
}
