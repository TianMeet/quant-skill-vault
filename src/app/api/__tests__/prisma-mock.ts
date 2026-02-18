// @ts-nocheck
import { vi } from 'vitest'

/**
 * Prisma mock for API tests
 * 避免依赖真实数据库，使用内存模拟
 */
const mockSkills: Map<number, Record<string, unknown>> = new Map()
const mockTags: Map<number, Record<string, unknown>> = new Map()
const mockFiles: Map<number, Record<string, unknown>> = new Map()
const mockDrafts: Map<number, Record<string, unknown>> = new Map()
let skillIdCounter = 1
let tagIdCounter = 1
let fileIdCounter = 1
let draftIdCounter = 1

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

function findTagByName(name: string) {
  for (const [, tag] of mockTags) {
    if (tag.name === name) return tag
  }
  return null
}

function findOrCreateTag(name: string) {
  const existing = findTagByName(name)
  if (existing) return existing
  const id = tagIdCounter++
  const tag = {
    id,
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'SYS',
    updatedBy: 'SYS',
  }
  mockTags.set(id, tag)
  return tag
}

function getSkillTags(skill: Record<string, unknown>): string[] {
  return Array.isArray(skill._tags) ? [...(skill._tags as string[])] : []
}

function setSkillTags(skill: Record<string, unknown>, tags: string[]) {
  skill._tags = [...new Set(tags)]
}

function mapSkillForResponse(skill: Record<string, unknown>) {
  return {
    ...skill,
    tags: getSkillTags(skill).map((name) => ({ tag: { name } })),
  }
}

function countSkillsByTagName(tagName: string) {
  let count = 0
  for (const [, skill] of mockSkills) {
    if (getSkillTags(skill).includes(tagName)) count += 1
  }
  return count
}

function applyTagMutationOnSkill(skill: Record<string, unknown>, tagsData: Record<string, unknown>) {
  let nextTags = getSkillTags(skill)

  if ('deleteMany' in tagsData) {
    const deleteMany = tagsData.deleteMany as Record<string, unknown>
    if (deleteMany && typeof deleteMany === 'object' && 'tagId' in deleteMany) {
      const targetTag = mockTags.get(Number(deleteMany.tagId))
      if (targetTag) {
        nextTags = nextTags.filter((name) => name !== targetTag.name)
      }
    } else {
      nextTags = []
    }
  }

  if ('create' in tagsData) {
    const creates = (tagsData.create as Array<{ tagId: number }>) || []
    for (const item of creates) {
      const targetTag = mockTags.get(item.tagId)
      if (targetTag && !nextTags.includes(targetTag.name as string)) {
        nextTags.push(targetTag.name as string)
      }
    }
  }

  setSkillTags(skill, nextTags)
}

function filterSkillsByWhere(
  input: Array<Record<string, unknown>>,
  where?: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (!where) return input
  let results = [...input]

  if (where.OR) {
    const orConditions = where.OR as Array<Record<string, { contains?: string }>>
    results = results.filter((skill) =>
      orConditions.some((cond) => {
        for (const [key, val] of Object.entries(cond)) {
          if (val.contains && String(skill[key]).includes(val.contains)) return true
        }
        return false
      })
    )
  }

  if (where.tags && typeof where.tags === 'object') {
    const some = (where.tags as { some?: Record<string, unknown> }).some || {}
    if ('tag' in some) {
      const tagNames = (some as { tag: { name: { in: string[] } } }).tag.name.in
      results = results.filter((skill) =>
        tagNames.some((name) => getSkillTags(skill).includes(name))
      )
    } else if ('tagId' in some) {
      const tagId = Number((some as { tagId: number }).tagId)
      const tag = mockTags.get(tagId)
      const tagName = tag?.name as string | undefined
      results = results.filter((skill) =>
        !!tagName && getSkillTags(skill).includes(tagName)
      )
    }
  }

  return results
}

function sortSkills(
  input: Array<Record<string, unknown>>,
  orderBy?: Record<string, string> | Array<Record<string, string>>
): Array<Record<string, unknown>> {
  if (!orderBy) return input
  const orderList = Array.isArray(orderBy) ? orderBy : [orderBy]
  let results = [...input]

  for (let i = orderList.length - 1; i >= 0; i--) {
    const order = orderList[i] || {}
    const [field, direction] = Object.entries(order)[0] || []
    if (!field || !direction) continue

    results = results.sort((a, b) => {
      if (field === 'updatedAt' || field === 'createdAt') {
        const ta = new Date(String(a[field])).getTime()
        const tb = new Date(String(b[field])).getTime()
        return direction === 'desc' ? tb - ta : ta - tb
      }

      const va = String(a[field] ?? '')
      const vb = String(b[field] ?? '')
      return direction === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
    })
  }

  return results
}

export function resetMockDb() {
  mockSkills.clear()
  mockTags.clear()
  mockFiles.clear()
  mockDrafts.clear()
  skillIdCounter = 1
  tagIdCounter = 1
  fileIdCounter = 1
  draftIdCounter = 1
  vi.clearAllMocks()
}

export function seedMockSkill(data: Record<string, unknown>) {
  const id = skillIdCounter++
  const tags = Array.isArray(data._tags) ? data._tags.map((item) => String(item)) : []
  for (const name of tags) findOrCreateTag(name)
  const skill = {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'SYS',
    updatedBy: 'SYS',
    ...data,
    _tags: tags,
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

export function getMockDrafts() {
  return mockDrafts
}

export const prismaMock = {
  skill: {
    findMany: vi.fn(async (args?: {
      where?: Record<string, unknown>
      include?: unknown
      select?: Record<string, boolean>
      orderBy?: Record<string, string> | Array<Record<string, string>>
      skip?: number
      take?: number
    }) => {
      let results = Array.from(mockSkills.values())
      results = filterSkillsByWhere(results, args?.where)
      results = sortSkills(results, args?.orderBy)

      if (typeof args?.skip === 'number' || typeof args?.take === 'number') {
        const start = typeof args?.skip === 'number' ? args.skip : 0
        const end = typeof args?.take === 'number' ? start + args.take : undefined
        results = results.slice(start, end)
      }

      if (args?.select) {
        return results.map((skill) => {
          const out: Record<string, unknown> = {}
          for (const [key, enabled] of Object.entries(args.select || {})) {
            if (enabled) out[key] = skill[key]
          }
          return out
        })
      }

      return results.map((skill) => mapSkillForResponse(skill))
    }),

    findUnique: vi.fn(async (args: { where: { id?: number; slug?: string } }) => {
      if (args.where.id) {
        const skill = mockSkills.get(args.where.id)
        if (!skill) return null
        return mapSkillForResponse(skill)
      }

      if (args.where.slug) {
        for (const [, skill] of mockSkills) {
          if (skill.slug === args.where.slug) return mapSkillForResponse(skill)
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

      const skill = {
        id,
        ...rest,
        _tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'SYS',
        updatedBy: 'SYS',
      }

      if (tagsData && typeof tagsData === 'object') {
        applyTagMutationOnSkill(skill, tagsData as Record<string, unknown>)
      }

      mockSkills.set(id, skill)
      return mapSkillForResponse(skill)
    }),

    update: vi.fn(async (args: { where: { id: number }; data: Record<string, unknown>; include?: unknown }) => {
      const current = mockSkills.get(args.where.id)
      if (!current) throw new Error('Not found')

      const { tags: tagsData, ...rest } = args.data
      if (rest.slug) {
        for (const [sid, existing] of mockSkills) {
          if (sid !== args.where.id && existing.slug === rest.slug) {
            throw makePrismaError('P2002', 'Unique constraint failed on slug')
          }
        }
      }

      const updated = {
        ...current,
        ...rest,
        updatedAt: new Date(),
      }

      if (tagsData && typeof tagsData === 'object') {
        applyTagMutationOnSkill(updated, tagsData as Record<string, unknown>)
      }

      mockSkills.set(args.where.id, updated)
      return mapSkillForResponse(updated)
    }),

    delete: vi.fn(async (args: { where: { id: number } }) => {
      mockSkills.delete(args.where.id)
      return { id: args.where.id }
    }),

    count: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      const results = filterSkillsByWhere(Array.from(mockSkills.values()), args?.where)
      return results.length
    }),
  },

  tag: {
    findMany: vi.fn(async (args?: { where?: Record<string, unknown>; include?: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      let results = Array.from(mockTags.values())

      if (args?.where?.name && typeof args.where.name === 'object' && 'contains' in args.where.name) {
        const query = String((args.where.name as { contains: string }).contains || '')
        results = results.filter((tag) => String(tag.name).includes(query))
      }

      if (args?.orderBy?.name) {
        results = results.sort((a, b) =>
          args.orderBy?.name === 'asc'
            ? String(a.name).localeCompare(String(b.name))
            : String(b.name).localeCompare(String(a.name))
        )
      }

      return results.map((tag) => {
        const base = { ...tag }
        if (args?.include?._count) {
          base._count = { skills: countSkillsByTagName(String(tag.name)) }
        }
        return base
      })
    }),

    findUnique: vi.fn(async (args: { where: { id?: number; name?: string }; include?: Record<string, unknown> }) => {
      let tag: Record<string, unknown> | null = null
      if (args.where.id) {
        tag = mockTags.get(args.where.id) || null
      } else if (args.where.name) {
        tag = findTagByName(args.where.name)
      }
      if (!tag) return null

      const result: Record<string, unknown> = { ...tag }
      if (args.include?._count) {
        result._count = { skills: countSkillsByTagName(String(tag.name)) }
      }
      if (args.include?.skills) {
        const linked = Array.from(mockSkills.values())
          .filter((skill) => getSkillTags(skill).includes(String(tag.name)))
          .map((skill) => ({ skillId: skill.id }))
        result.skills = linked
      }
      return result
    }),

    count: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      let results = Array.from(mockTags.values())
      if (args?.where?.name && typeof args.where.name === 'object' && 'contains' in args.where.name) {
        const query = String((args.where.name as { contains: string }).contains || '')
        results = results.filter((tag) => String(tag.name).includes(query))
      }
      return results.length
    }),

    upsert: vi.fn(async (args: { where: { name: string }; update: Record<string, unknown>; create: { name: string } }) => {
      return findOrCreateTag(args.where.name || args.create.name)
    }),

    update: vi.fn(async (args: { where: { id: number }; data: { name?: string } }) => {
      const current = mockTags.get(args.where.id)
      if (!current) throw makePrismaError('P2025', 'Record not found')
      const nextName = String(args.data.name || current.name)

      const conflict = findTagByName(nextName)
      if (conflict && conflict.id !== args.where.id) {
        throw makePrismaError('P2002', 'Unique constraint failed on tag name')
      }

      const oldName = String(current.name)
      const updated = { ...current, name: nextName, updatedAt: new Date() }
      mockTags.set(args.where.id, updated)

      if (oldName !== nextName) {
        for (const [, skill] of mockSkills) {
          const tags = getSkillTags(skill)
          if (!tags.includes(oldName)) continue
          const replaced = tags.map((name) => (name === oldName ? nextName : name))
          setSkillTags(skill, replaced)
        }
      }

      return updated
    }),

    delete: vi.fn(async (args: { where: { id: number } }) => {
      const current = mockTags.get(args.where.id)
      if (!current) throw makePrismaError('P2025', 'Record not found')
      mockTags.delete(args.where.id)

      const tagName = String(current.name)
      for (const [, skill] of mockSkills) {
        const tags = getSkillTags(skill).filter((name) => name !== tagName)
        setSkillTags(skill, tags)
      }

      return current
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
        for (const [, file] of mockFiles) {
          if (file.skillId === args.where.skillId_path.skillId && file.path === args.where.skillId_path.path) return file
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
      for (const [fid, file] of mockFiles) {
        if (file.skillId === args.where.skillId_path.skillId && file.path === args.where.skillId_path.path) {
          if (typeof args.data.path === 'string' && args.data.path !== file.path) {
            for (const [, existing] of mockFiles) {
              if (
                existing.skillId === file.skillId &&
                existing.path === args.data.path
              ) {
                throw makePrismaError('P2002', 'Unique constraint failed on skillId_path')
              }
            }
          }
          const updated = { ...file, ...args.data, updatedAt: new Date() }
          mockFiles.set(fid, updated)
          return updated
        }
      }
      throw new Error('Not found')
    }),

    delete: vi.fn(async (args: { where: { skillId_path: { skillId: number; path: string } } }) => {
      for (const [fid, file] of mockFiles) {
        if (file.skillId === args.where.skillId_path.skillId && file.path === args.where.skillId_path.path) {
          mockFiles.delete(fid)
          return file
        }
      }
      throw makePrismaError('P2025', 'Record to delete does not exist')
    }),
  },

  skillDraft: {
    findMany: vi.fn(async (args?: {
      where?: Record<string, unknown>
      orderBy?: Record<string, string>
      take?: number
      select?: Record<string, boolean>
    }) => {
      let results = Array.from(mockDrafts.values())

      if (args?.where?.mode) {
        results = results.filter((draft) => draft.mode === args.where?.mode)
      }

      if (args?.orderBy?.updatedAt) {
        const direction = args.orderBy.updatedAt
        results = results.sort((a, b) => {
          const ta = new Date(String(a.updatedAt)).getTime()
          const tb = new Date(String(b.updatedAt)).getTime()
          return direction === 'desc' ? tb - ta : ta - tb
        })
      }

      if (typeof args?.take === 'number') {
        results = results.slice(0, args.take)
      }

      if (args?.select) {
        return results.map((draft) => {
          const out: Record<string, unknown> = {}
          for (const [key, enabled] of Object.entries(args.select || {})) {
            if (enabled) out[key] = draft[key]
          }
          return out
        })
      }

      return results.map((draft) => ({ ...draft }))
    }),

    findUnique: vi.fn(async (args: { where: { id?: number; draftKey?: string } }) => {
      if (args.where.id) {
        return mockDrafts.get(args.where.id) || null
      }
      if (args.where.draftKey) {
        for (const [, draft] of mockDrafts) {
          if (draft.draftKey === args.where.draftKey) return { ...draft }
        }
      }
      return null
    }),

    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      for (const [, draft] of mockDrafts) {
        if (draft.draftKey === args.data.draftKey) {
          throw makePrismaError('P2002', 'Unique constraint failed on draftKey')
        }
      }
      const id = draftIdCounter++
      const now = new Date()
      const draft = {
        id,
        createdAt: now,
        updatedAt: now,
        ...args.data,
      }
      mockDrafts.set(id, draft)
      return { ...draft }
    }),

    update: vi.fn(async (args: { where: { id?: number; draftKey?: string }; data: Record<string, unknown> }) => {
      let targetId: number | null = null

      if (args.where.id) {
        targetId = args.where.id
      } else if (args.where.draftKey) {
        for (const [id, draft] of mockDrafts) {
          if (draft.draftKey === args.where.draftKey) {
            targetId = id
            break
          }
        }
      }

      if (!targetId) throw makePrismaError('P2025', 'Record to update does not exist')
      const current = mockDrafts.get(targetId)
      if (!current) throw makePrismaError('P2025', 'Record to update does not exist')

      const updated = { ...current, ...args.data, updatedAt: new Date() }
      mockDrafts.set(targetId, updated)
      return { ...updated }
    }),

    delete: vi.fn(async (args: { where: { id?: number; draftKey?: string } }) => {
      if (args.where.id) {
        const current = mockDrafts.get(args.where.id)
        if (!current) throw makePrismaError('P2025', 'Record to delete does not exist')
        mockDrafts.delete(args.where.id)
        return current
      }

      if (args.where.draftKey) {
        for (const [id, draft] of mockDrafts) {
          if (draft.draftKey === args.where.draftKey) {
            mockDrafts.delete(id)
            return draft
          }
        }
      }

      throw makePrismaError('P2025', 'Record to delete does not exist')
    }),
  },

  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
    const skillSnap = cloneMap(mockSkills)
    const tagSnap = cloneMap(mockTags)
    const fileSnap = cloneMap(mockFiles)
    const draftSnap = cloneMap(mockDrafts)
    const counters = { skillIdCounter, tagIdCounter, fileIdCounter, draftIdCounter }

    try {
      return await fn(prismaMock as unknown as typeof prismaMock)
    } catch (err) {
      restoreMap(mockSkills, skillSnap)
      restoreMap(mockTags, tagSnap)
      restoreMap(mockFiles, fileSnap)
      restoreMap(mockDrafts, draftSnap)
      skillIdCounter = counters.skillIdCounter
      tagIdCounter = counters.tagIdCounter
      fileIdCounter = counters.fileIdCounter
      draftIdCounter = counters.draftIdCounter
      throw err
    }
  }),
}

// Mock the prisma module
vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))
