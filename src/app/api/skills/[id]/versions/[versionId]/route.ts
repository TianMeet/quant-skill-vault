import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hasSkillVersioning,
  isVersioningSchemaNotReadyError,
  parseSkillSnapshot,
  VERSIONING_NOT_READY_MESSAGE,
} from '@/lib/skill-versioning'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string; versionId: string }> }

function parsePositiveId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/**
 * GET /api/skills/:id/versions/:versionId
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  if (!hasSkillVersioning(prisma)) {
    return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
  }

  const { id, versionId } = await params
  const skillId = parsePositiveId(id)
  const currentVersionId = parsePositiveId(versionId)

  if (!skillId || !currentVersionId) {
    return NextResponse.json({ error: 'Invalid version id' }, { status: 400 })
  }

  let version: { id: number; skillId: number; version: number; snapshot: unknown; createdAt: Date } | null
  try {
    version = await prisma.skillVersion.findUnique({ where: { id: currentVersionId } })
  } catch (err) {
    if (isVersioningSchemaNotReadyError(err)) {
      return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
    }
    throw err
  }
  if (!version || version.skillId !== skillId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const snapshot = parseSkillSnapshot(version.snapshot)
  if (!snapshot) {
    return NextResponse.json({ error: 'Version snapshot is invalid' }, { status: 422 })
  }

  return NextResponse.json({
    id: version.id,
    skillId: version.skillId,
    version: version.version,
    snapshot,
    createdAt: version.createdAt.toISOString(),
  })
}
