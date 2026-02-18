import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSkillVersionIfAvailable,
  hasSkillPublication,
  hasSkillVersioning,
  isVersioningSchemaNotReadyError,
  toSkillSnapshot,
  VERSIONING_NOT_READY_MESSAGE,
} from '@/lib/skill-versioning'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function parsePositiveId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/**
 * POST /api/skills/:id/publish
 * body: { note?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!hasSkillVersioning(prisma) || !hasSkillPublication(prisma)) {
    return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
  }

  const { id } = await params
  const skillId = parsePositiveId(id)
  if (!skillId) return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })

  let body: { note?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const existing = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { tags: { include: { tag: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (note.length > 2000) {
    return NextResponse.json({ error: 'Publish note is too long' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let latestVersion = await tx.skillVersion.findFirst({
        where: { skillId },
        orderBy: { version: 'desc' },
      })

      if (!latestVersion) {
        await createSkillVersionIfAvailable(tx, existing.id, toSkillSnapshot(existing))
        latestVersion = await tx.skillVersion.findFirst({
          where: { skillId },
          orderBy: { version: 'desc' },
        })
      }

      if (!latestVersion) {
        throw new Error('LATEST_VERSION_NOT_FOUND')
      }

      const publication = await tx.skillPublication.create({
        data: {
          skillId,
          skillVersionId: latestVersion.id,
          note: note || null,
        },
      })

      await tx.skill.update({
        where: { id: skillId },
        data: { status: 'published' },
      })

      return { publication, version: latestVersion.version }
    })

    return NextResponse.json(
      {
        id: result.publication.id,
        skillId,
        version: result.version,
        note: result.publication.note,
        publishedAt: result.publication.publishedAt.toISOString(),
        skillStatus: 'published',
      },
      { status: 201 }
    )
  } catch (err) {
    if (isVersioningSchemaNotReadyError(err)) {
      return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
    }
    console.error('POST /api/skills/:id/publish error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
