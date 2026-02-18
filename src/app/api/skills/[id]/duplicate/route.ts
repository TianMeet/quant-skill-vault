import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { slugify } from '@/lib/slugify'
import { buildCreateTagConnect, isServiceError } from '@/lib/tag-service'
import { createSkillVersionIfAvailable, toSkillSnapshot } from '@/lib/skill-versioning'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function parseSkillId(rawId: string): number | null {
  const skillId = Number(rawId)
  if (!Number.isInteger(skillId) || skillId <= 0) return null
  return skillId
}

function normalizeDuplicateTitle(rawTitle: unknown, fallback: string): string {
  if (typeof rawTitle !== 'string') return fallback
  const trimmed = rawTitle.trim()
  return trimmed || fallback
}

function candidateSlug(base: string, index: number): string {
  const withSuffix = index <= 0 ? base : `${base}-${index}`
  const truncated = withSuffix.slice(0, 64).replace(/^-+/, '').replace(/-+$/, '')
  return truncated || 'skill-copy'
}

async function generateUniqueSlug(rawTitle: string, fallbackSlug: string): Promise<string | null> {
  const base = slugify(rawTitle) || slugify(`${fallbackSlug}-copy`)
  if (!base) return null

  for (let i = 0; i < 200; i++) {
    const candidate = candidateSlug(base, i)
    const exists = await prisma.skill.findUnique({ where: { slug: candidate } })
    if (!exists) return candidate
  }

  return null
}

function toInputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return (value === null ? Prisma.JsonNull : value) as Prisma.InputJsonValue
}

/**
 * POST /api/skills/:id/duplicate - 复制一个 Skill
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skillId = parseSkillId(id)
  if (!skillId) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })
  }

  let titleFromBody: unknown
  try {
    const body = await request.json()
    titleFromBody = body?.title
  } catch {
    titleFromBody = undefined
  }

  const source = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { tags: { include: { tag: true } } },
  })
  if (!source) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  const sourceFiles = await prisma.skillFile.findMany({ where: { skillId } })
  const nextTitle = normalizeDuplicateTitle(titleFromBody, `${source.title} 副本`)
  const nextSlug = await generateUniqueSlug(nextTitle, source.slug)
  if (!nextSlug) {
    return NextResponse.json({ error: 'Cannot generate valid slug from title' }, { status: 400 })
  }

  try {
    const tagNames = source.tags.map((item) => item.tag.name)
    const tagConnect = await buildCreateTagConnect(tagNames)

    const duplicated = await prisma.$transaction(async (tx) => {
      const skill = await tx.skill.create({
        data: {
          title: nextTitle,
          slug: nextSlug,
          status: 'draft',
          summary: source.summary,
          inputs: source.inputs,
          outputs: source.outputs,
          steps: toInputJson(source.steps),
          risks: source.risks,
          triggers: toInputJson(source.triggers),
          guardrails: toInputJson(source.guardrails),
          tests: toInputJson(source.tests),
          tags: tagConnect,
        },
        include: { tags: { include: { tag: true } } },
      })

      for (const file of sourceFiles) {
        await tx.skillFile.create({
          data: {
            skillId: skill.id,
            path: file.path,
            mime: file.mime,
            isBinary: file.isBinary,
            contentText: file.contentText,
            contentBytes: file.contentBytes,
          },
        })
      }

      return skill
    })

    const copied = await prisma.skill.findUnique({
      where: { id: duplicated.id },
      include: { tags: { include: { tag: true } } },
    })
    if (copied) {
      await createSkillVersionIfAvailable(prisma, copied.id, toSkillSnapshot(copied))
    }

    return NextResponse.json({
      ...copied,
      tags: copied?.tags.map((item) => item.tag.name) || [],
      duplicatedFromId: source.id,
    }, { status: 201 })
  } catch (err) {
    if (isServiceError(err, 'TAG_NAME_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    console.error('POST /api/skills/:id/duplicate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
