import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildReplaceTagConnect, isServiceError } from '@/lib/tag-service'
import {
  createSkillVersionIfAvailable,
  hasSkillVersioning,
  isVersioningSchemaNotReadyError,
  parseSkillSnapshot,
  toSkillSnapshot,
  VERSIONING_NOT_READY_MESSAGE,
} from '@/lib/skill-versioning'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

function parsePositiveId(raw: string): number | null {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/**
 * POST /api/skills/:id/rollback
 * body: { versionId: number, reason?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!hasSkillVersioning(prisma)) {
    return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
  }

  const { id } = await params
  const skillId = parsePositiveId(id)
  if (!skillId) return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })

  let body: { versionId?: number; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const versionId = Number(body.versionId)
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return NextResponse.json({ error: 'Invalid version id' }, { status: 400 })
  }

  const existing = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { tags: { include: { tag: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const targetVersion = await prisma.skillVersion.findUnique({ where: { id: versionId } })
  if (!targetVersion || targetVersion.skillId !== skillId) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  }

  const snapshot = parseSkillSnapshot(targetVersion.snapshot)
  if (!snapshot) {
    return NextResponse.json({ error: 'Version snapshot is invalid' }, { status: 422 })
  }

  try {
    const tagConnect = await buildReplaceTagConnect(snapshot.tags)

    const updated = await prisma.$transaction(async (tx) => {
      const skill = await tx.skill.update({
        where: { id: skillId },
        data: {
          title: snapshot.title,
          slug: snapshot.slug,
          status: 'draft',
          summary: snapshot.summary,
          inputs: snapshot.inputs,
          outputs: snapshot.outputs,
          steps: snapshot.steps,
          risks: snapshot.risks,
          triggers: snapshot.triggers,
          guardrails: snapshot.guardrails,
          tests: snapshot.tests,
          tags: tagConnect,
        },
        include: { tags: { include: { tag: true } } },
      })
      const createdVersion = await createSkillVersionIfAvailable(tx, skill.id, toSkillSnapshot(skill))
      return { skill, createdVersion }
    })

    return NextResponse.json({
      ...updated.skill,
      tags: updated.skill.tags.map((item) => item.tag.name),
      rolledBackFromVersionId: targetVersion.id,
      createdVersion: updated.createdVersion?.version || null,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    })
  } catch (err) {
    if (isServiceError(err, 'TAG_NAME_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (isPrismaCode(err, 'P2002')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    if (isVersioningSchemaNotReadyError(err)) {
      return NextResponse.json({ error: VERSIONING_NOT_READY_MESSAGE }, { status: 503 })
    }
    console.error('POST /api/skills/:id/rollback error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
