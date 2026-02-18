import { prisma } from '@/lib/prisma'
import { normalizeTagName, normalizeTagNames, validateTagName } from '@/lib/tag-normalize'

type TagWithCount = {
  id: number
  name: string
  count: number
  updatedAt: string
}

type LinkedSkill = {
  id: number
  title: string
  slug: string
  updatedAt: string
}

type RenameTagResult = {
  id: number
  name: string
}

type DeleteTagResult = {
  id: number
  name: string
  detachedSkills: number
}

type MergeTagResult = {
  sourceId: number
  targetId: number
  sourceName: string
  targetName: string
  movedSkills: number
}

type TagListPage = {
  items: TagWithCount[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function makeError(code: string, message: string, extra?: Record<string, unknown>) {
  return Object.assign(new Error(message), { code, ...extra })
}

export function parseTagId(rawId: string): number | null {
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export function isServiceError(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

function buildTagWhere(queryRaw = '') {
  const query = normalizeTagName(queryRaw || '')
  return query
    ? {
        name: {
          contains: query,
        },
      }
    : undefined
}

function mapTagWithCount(tag: {
  id: number
  name: string
  updatedAt: Date
  _count: { skills: number }
}): TagWithCount {
  return {
    id: tag.id,
    name: tag.name,
    count: tag._count.skills,
    updatedAt: tag.updatedAt.toISOString(),
  }
}

export async function listTags(queryRaw = ''): Promise<TagWithCount[]> {
  const where = buildTagWhere(queryRaw)

  const tags = await prisma.tag.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    include: {
      _count: { select: { skills: true } },
    },
  })

  return tags.map(mapTagWithCount)
}

export async function listTagsPaged(queryRaw = '', pageRaw = 1, limitRaw = 20): Promise<TagListPage> {
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 20
  const where = buildTagWhere(queryRaw)

  const [tags, total] = await Promise.all([
    prisma.tag.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { skills: true } },
      },
    }),
    prisma.tag.count({ where }),
  ])

  return {
    items: tags.map(mapTagWithCount),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function createOrGetTag(nameRaw: string): Promise<RenameTagResult> {
  const normalizedName = normalizeTagName(nameRaw || '')
  const validationError = validateTagName(normalizedName)
  if (validationError) {
    throw makeError('TAG_NAME_INVALID', validationError)
  }

  const tag = await prisma.tag.upsert({
    where: { name: normalizedName },
    update: {},
    create: { name: normalizedName },
  })

  return { id: tag.id, name: tag.name }
}

export async function upsertTags(rawNames: string[]) {
  const names = normalizeTagNames(rawNames)
  if (names.length === 0) return []

  const invalid = names.find((name) => !!validateTagName(name))
  if (invalid) {
    throw makeError('TAG_NAME_INVALID', validateTagName(invalid) || 'Invalid tag name')
  }

  return Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  )
}

export async function buildCreateTagConnect(rawNames: string[]) {
  const records = await upsertTags(rawNames)
  return {
    create: records.map((tag) => ({ tagId: tag.id })),
  }
}

export async function buildReplaceTagConnect(rawNames: string[]) {
  const records = await upsertTags(rawNames)
  return {
    deleteMany: {},
    create: records.map((tag) => ({ tagId: tag.id })),
  }
}

export async function renameTag(tagId: number, nextNameRaw: string): Promise<RenameTagResult> {
  const current = await prisma.tag.findUnique({ where: { id: tagId } })
  if (!current) throw makeError('TAG_NOT_FOUND', 'Tag not found')

  const nextName = normalizeTagName(nextNameRaw || '')
  const validationError = validateTagName(nextName)
  if (validationError) throw makeError('TAG_NAME_INVALID', validationError)

  if (nextName === current.name) return { id: current.id, name: current.name }

  const conflict = await prisma.tag.findUnique({ where: { name: nextName } })
  if (conflict && conflict.id !== tagId) {
    throw makeError('TAG_NAME_CONFLICT', 'Tag name already exists', { conflictTagId: conflict.id })
  }

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: { name: nextName },
  })

  return { id: updated.id, name: updated.name }
}

export async function deleteTag(tagId: number): Promise<DeleteTagResult> {
  const current = await prisma.tag.findUnique({
    where: { id: tagId },
    include: {
      _count: { select: { skills: true } },
    },
  })
  if (!current) throw makeError('TAG_NOT_FOUND', 'Tag not found')

  await prisma.tag.delete({ where: { id: tagId } })

  return {
    id: current.id,
    name: current.name,
    detachedSkills: current._count.skills,
  }
}

export async function getLinkedSkills(tagId: number): Promise<{ tag: RenameTagResult; skills: LinkedSkill[] }> {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } })
  if (!tag) throw makeError('TAG_NOT_FOUND', 'Tag not found')

  const skills = await prisma.skill.findMany({
    where: {
      tags: {
        some: { tagId },
      },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return {
    tag: { id: tag.id, name: tag.name },
    skills: skills.map((skill) => ({
      id: skill.id,
      title: skill.title,
      slug: skill.slug,
      updatedAt: skill.updatedAt.toISOString(),
    })),
  }
}

export async function mergeTags(sourceTagId: number, targetTagId: number): Promise<MergeTagResult> {
  if (sourceTagId === targetTagId) {
    throw makeError('TAG_MERGE_INVALID', 'Source and target tags cannot be the same')
  }

  const [source, target] = await Promise.all([
    prisma.tag.findUnique({
      where: { id: sourceTagId },
      include: { skills: { select: { skillId: true } } },
    }),
    prisma.tag.findUnique({
      where: { id: targetTagId },
      include: { skills: { select: { skillId: true } } },
    }),
  ])

  if (!source) throw makeError('TAG_SOURCE_NOT_FOUND', 'Source tag not found')
  if (!target) throw makeError('TAG_TARGET_NOT_FOUND', 'Target tag not found')

  const sourceSkillIds = source.skills.map((item) => item.skillId)
  const targetSkillSet = new Set(target.skills.map((item) => item.skillId))

  await prisma.$transaction(async (tx) => {
    for (const skillId of sourceSkillIds) {
      const shouldAttachTarget = !targetSkillSet.has(skillId)
      await tx.skill.update({
        where: { id: skillId },
        data: {
          tags: {
            deleteMany: { tagId: sourceTagId },
            ...(shouldAttachTarget ? { create: [{ tagId: targetTagId }] } : {}),
          },
        },
      })
    }
    await tx.tag.delete({ where: { id: sourceTagId } })
  })

  return {
    sourceId: source.id,
    targetId: target.id,
    sourceName: source.name,
    targetName: target.name,
    movedSkills: sourceSkillIds.length,
  }
}
