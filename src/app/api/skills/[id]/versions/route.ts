import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hasSkillVersioning,
  isVersioningSchemaNotReadyError,
  parseSkillSnapshot,
  VERSIONING_NOT_READY_MESSAGE,
} from '@/lib/skill-versioning'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) return fallback
  return value
}

function parseSkillId(rawId: string): number | null {
  const skillId = Number(rawId)
  if (!Number.isInteger(skillId) || skillId <= 0) return null
  return skillId
}

/**
 * GET /api/skills/:id/versions
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!hasSkillVersioning(prisma)) {
    return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
  }

  const { id } = await params
  const skillId = parseSkillId(id)
  if (!skillId) return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })

  const skill = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const page = parsePositiveInt(searchParams.get('page'), DEFAULT_PAGE)
  const limit = Math.min(parsePositiveInt(searchParams.get('limit'), DEFAULT_LIMIT), MAX_LIMIT)

  let items: Array<{ id: number; version: number; snapshot: unknown; createdAt: Date }>
  let total: number
  try {
    ;[items, total] = await Promise.all([
      prisma.skillVersion.findMany({
        where: { skillId },
        orderBy: { version: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.skillVersion.count({ where: { skillId } }),
    ])
  } catch (err) {
    if (isVersioningSchemaNotReadyError(err)) {
      return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
    }
    throw err
  }

  const payload = items.map((item) => {
    const snapshot = parseSkillSnapshot(item.snapshot)
    return {
      id: item.id,
      version: item.version,
      title: snapshot?.title || null,
      status: snapshot?.status || null,
      createdAt: item.createdAt.toISOString(),
    }
  })

  return NextResponse.json({
    items: payload,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
}
