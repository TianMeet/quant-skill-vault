'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Download, ArrowRight, Package } from 'lucide-react'

interface Skill {
  id: number
  title: string
  slug: string
  summary: string
  tags: string[]
  updatedAt: string
}

interface Tag {
  id: number
  name: string
  count: number
}

export default function SkillsListPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTags()
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [query, selectedTags])

  async function fetchTags() {
    const res = await fetch('/api/tags')
    if (res.ok) setTags(await res.json())
  }

  async function fetchSkills() {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('query', query)
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','))
    const res = await fetch(`/api/skills?${params}`)
    if (res.ok) setSkills(await res.json())
    setLoading(false)
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function handleExportZip(e: React.MouseEvent, id: number, slug: string) {
    e.preventDefault()
    e.stopPropagation()
    const res = await fetch(`/api/skills/${id}/export.zip`)
    if (!res.ok) {
      const data = await res.json()
      alert(`Export failed: ${data.errors?.map((e: { message: string }) => e.message).join(', ') || data.error}`)
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Manage and organize your skill protocols
        </p>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
          <input
            type="text"
            placeholder="Search skills..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm focus:outline-none"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          />
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.name)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: selectedTags.includes(tag.name) ? 'var(--accent)' : 'var(--muted)',
                  color: selectedTags.includes(tag.name) ? 'white' : 'var(--muted-foreground)',
                }}
              >
                {tag.name}
                <span className="ml-1 opacity-60">{tag.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Skills Grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-5 w-3/4 mb-3" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : skills.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16"
          style={{ borderColor: 'var(--border)' }}
        >
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            <Package className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">No skills found</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Get started by creating your first skill protocol
          </p>
          <Link
            href="/skills/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            Create Skill
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="card group block p-5 animate-in"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-[15px] leading-snug group-hover:opacity-80 transition-opacity">
                  {skill.title}
                </h3>
                <button
                  onClick={(e) => handleExportZip(e, skill.id, skill.slug)}
                  className="shrink-0 rounded-md p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--muted-foreground)' }}
                  title="Export ZIP"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
              <p
                className="mt-2 text-sm leading-relaxed line-clamp-2"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {skill.summary}
              </p>
              {skill.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {skill.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md px-2 py-0.5 text-xs font-medium"
                      style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  Updated {new Date(skill.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
