// @ts-nocheck
import { vi } from 'vitest'

/**
 * Prisma mock for API tests
 * 避免依赖真实数据库，使用内存模拟
 */
const mockSkills: Map<number, Record<string, unknown>> = new Map()
const mockTags: Map<number, Record<string, unknown>> = new Map()
const mockFiles: Map<number, Record<string, unknown>> = new Map()
let skillIdCounter = 1
let tagIdCounter = 1
let fileIdCounter = 1

function makePrismaError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

function cloneMap<T extends Record<string, unknown>>(source: Map<number, T>): Map<number, T> {
  return new Map(Array.from(source.entries()).map(([k, v]) => [k, structuredClone(v)]))
}

function restoreMap<T extends Record<string, unknown>>(target: Map<number, T>, snapshot: Map<number, T>) {
  target.clear()
  for (const [k, v] of snapshot) target.set(k, structuredClone(v))
}

export function resetMockDb() {
  mockSkills.clear()
  mockTags.clear()
  mockFiles.clear()
  skillIdCounter = 1
  tagIdCounter = 1
  fileIdCounter = 1
  // Reset all mock call counts
  vi.clearAllMocks()
}

export function seedMockSkill(data: Record<string, unknown>) {
  const id = skillIdCounter++
  const skill = {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'SYS',
    updatedBy: 'SYS',
    ...data,
  }
  mockSkills.set(id, skill)
  return skill
}

export function getMockSkills() {
  return mockSkills
}

export function getMockTags() {
  return mockTags
}

export function getMockFiles() {
  return mockFiles
}

function findOrCreateTag(name: string) {
  for (const [, tag] of mockTags) {
    if (tag.name === name) return tag
  }
  const id = tagIdCounter++
  const tag = { id, name, createdAt: new Date(), updatedAt: new Date(), createdBy: 'SYS', updatedBy: 'SYS' }
  mockTags.set(id, tag)
  return tag
}

export const prismaMock = {
  skill: {
    findMany: vi.fn(async (args?: { where?: Record<string, unknown>; include?: unknown; orderBy?: unknown }) => {
      let results = Array.from(mockSkills.values())

      if (args?.where) {
        const w = args.where
        if (w.OR) {
          const orConditions = w.OR as Array<Record<string, { contains?: string }>>
          results = results.filter((s) =>
            orConditions.some((cond) => {
              for (const [key, val] of Object.entries(cond)) {
                if (val.contains && String(s[key]).includes(val.contains)) return true
              }
              return false
            })
          )
        }
        if (w.tags) {
          // Filter by tag names
          const tagFilter = w.tags as { some: { tag: { name: { in: string[] } } } }
          const tagNames = tagFilter.some.tag.name.in
          results = results.filter((s) => {
            const skillTags = (s._tags as string[]) || []
            return tagNames.some((tn) => skillTags.includes(tn))
          })
        }
      }

      return results.map((s) => ({
        ...s,
        tags: ((s._tags as string[]) || []).map((name) => ({
          tag: { name },
        })),
      }))
    }),

    findUnique: vi.fn(async (args: { where: { id?: number; slug?: string } }) => {
      if (args.where.id) {
        const skill = mockSkills.get(args.where.id)
        if (!skill) return null
        return {
          ...skill,
          tags: ((skill._tags as string[]) || []).map((name) => ({
            tag: { name },
          })),
        }
      }
      if (args.where.slug) {
        for (const [, skill] of mockSkills) {
          if (skill.slug === args.where.slug) {
            return {
              ...skill,
              tags: ((skill._tags as string[]) || []).map((name) => ({
                tag: { name },
              })),
            }
          }
        }
      }
      return null
    }),

    create: vi.fn(async (args: { data: Record<string, unknown>; include?: unknown }) => {
      const id = skillIdCounter++
      const { tags: tagsData, ...rest } = args.data
      for (const [, existing] of mockSkills) {
        if (existing.slug === rest.slug) {
          throw makePrismaError('P2002', 'Unique constraint failed on slug')
        }
      }
      const tagNames: string[] = []
      if (tagsData && typeof tagsData === 'object' && 'create' in (tagsData as Record<string, unknown>)) {
        const creates = (tagsData as { create: Array<{ tagId: number }> }).create
        for (const c of creates) {
          const tag = mockTags.get(c.tagId)
          if (tag) tagNames.push(tag.name as string)
        }
      }
      const skill = {
        id,
        ...rest,
        _tags: tagNames,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'SYS',
        updatedBy: 'SYS',
      }
      mockSkills.set(id, skill)
      return {
        ...skill,
        tags: tagNames.map((name) => ({ tag: { name } })),
      }
    }),

    update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown>; include?: unknown }) => {
      const skill = mockSkills.get(args.where.id)
      if (!skill) throw new Error('Not found')
      const { tags: tagsData, ...rest } = args.data
      if (rest.slug) {
        for (const [sid, existing] of mockSkills) {
          if (sid !== args.where.id && existing.slug === rest.slug) {
            throw makePrismaError('P2002', 'Unique constraint failed on slug')
          }
        }
      }
      const updated = { ...skill, ...rest, updatedAt: new Date() }
      if (tagsData && typeof tagsData === 'object' && 'create' in (tagsData as Record<string, unknown>)) {
        const creates = (tagsData as { create: Array<{ tagId: number }> }).create
        const tagNames: string[] = []
        for (const c of creates) {
          const tag = mockTags.get(c.tagId)
          if (tag) tagNames.push(tag.name as string)
        }
        updated._tags = tagNames
      }
      mockSkills.set(args.where.id, updated)
      return {
        ...updated,
        tags: ((updated._tags as string[]) || []).map((name: string) => ({ tag: { name } })),
      }
    }),

    delete: vi.fn(async (args: { where: { id: number } }) => {
      mockSkills.delete(args.where.id)
      return { id: args.where.id }
    }),
  },

  tag: {
    findMany: vi.fn(async () => {
      return Array.from(mockTags.values()).map((t) => ({
        ...t,
        _count: { skills: 0 },
      }))
    }),

    upsert: vi.fn(async (args: { where: { name: string }; update: unknown; create: { name: string } }) => {
      return findOrCreateTag(args.where.name || args.create.name)
    }),
  },

  skillFile: {
    findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      let results = Array.from(mockFiles.values())
      if (args?.where?.skillId) {
        results = results.filter((f) => f.skillId === args.where.skillId)
      }
      return results
    }),

    findUnique: vi.fn(async (args: { where: { skillId_path?: { skillId: number; path: string }; id?: number } }) => {
      if (args.where.skillId_path) {
        for (const [, f] of mockFiles) {
          if (f.skillId === args.where.skillId_path.skillId && f.path === args.where.skillId_path.path) return f
        }
        return null
      }
      if (args.where.id) return mockFiles.get(args.where.id) || null
      return null
    }),

    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      for (const [, existing] of mockFiles) {
        if (existing.skillId === args.data.skillId && existing.path === args.data.path) {
          throw makePrismaError('P2002', 'Unique constraint failed on skillId_path')
        }
      }
      const id = fileIdCounter++
      const file = { id, createdAt: new Date(), updatedAt: new Date(), ...args.data }
      mockFiles.set(id, file)
      return file
    }),

    update: vi.fn(async (args: { where: { skillId_path: { skillId: number; path: string } }; data: Record<string, unknown> }) => {
      for (const [fid, f] of mockFiles) {
        if (f.skillId === args.where.skillId_path.skillId && f.path === args.where.skillId_path.path) {
          const updated = { ...f, ...args.data, updatedAt: new Date() }
          mockFiles.set(fid, updated)
          return updated
        }
      }
      throw new Error('Not found')
    }),

    delete: vi.fn(async (args: { where: { skillId_path: { skillId: number; path: string } } }) => {
      for (const [fid, f] of mockFiles) {
        if (f.skillId === args.where.skillId_path.skillId && f.path === args.where.skillId_path.path) {
          mockFiles.delete(fid)
          return f
        }
      }
      throw makePrismaError('P2025', 'Record to delete does not exist')
    }),
  },

  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
    const skillSnap = cloneMap(mockSkills)
    const tagSnap = cloneMap(mockTags)
    const fileSnap = cloneMap(mockFiles)
    const counters = { skillIdCounter, tagIdCounter, fileIdCounter }

    try {
      return await fn(prismaMock as unknown as typeof prismaMock)
    } catch (err) {
      restoreMap(mockSkills, skillSnap)
      restoreMap(mockTags, tagSnap)
      restoreMap(mockFiles, fileSnap)
      skillIdCounter = counters.skillIdCounter
      tagIdCounter = counters.tagIdCounter
      fileIdCounter = counters.fileIdCounter
      throw err
    }
  }),
}

// Mock the prisma module
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
