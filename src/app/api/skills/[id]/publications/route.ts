import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hasSkillPublication,
  isVersioningSchemaNotReadyError,
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
 * GET /api/skills/:id/publications
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!hasSkillPublication(prisma)) {
    return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
  }

  const { id } = await params
  const skillId = parsePositiveId(id)
  if (!skillId) return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })

  const skill = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  let publications: Array<{
    id: number
    skillId: number
    skillVersionId: number
    note: string | null
    publishedAt: Date
    skillVersion: { version: number }
  }>
  try {
    publications = await prisma.skillPublication.findMany({
      where: { skillId },
      orderBy: { publishedAt: 'desc' },
      include: {
        skillVersion: {
          select: {
            id: true,
            version: true,
          },
        },
      },
      take: 50,
    })
  } catch (err) {
    if (isVersioningSchemaNotReadyError(err)) {
      return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
    }
    throw err
  }

  return NextResponse.json({
    items: publications.map((item) => ({
      id: item.id,
      skillId: item.skillId,
      versionId: item.skillVersionId,
      version: item.skillVersion.version,
      note: item.note,
      publishedAt: item.publishedAt.toISOString(),
    })),
    total: publications.length,
  })
}
