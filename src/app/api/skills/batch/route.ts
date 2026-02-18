import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeTagNames } from '@/lib/tag-normalize'
import { isServiceError, upsertTags } from '@/lib/tag-service'

export const runtime = 'nodejs'

type BatchAction = 'bulk-delete' | 'bulk-add-tags'

type BatchRequest = {
  action?: BatchAction
  skillIds?: number[]
  tags?: string[]
}

function parseSkillIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const ids = raw
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0)
  return Array.from(new Set(ids))
}

/**
 * POST /api/skills/batch
 * - action=bulk-delete
 * - action=bulk-add-tags
 */
export async function POST(request: NextRequest) {
  let body: BatchRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action
  const skillIds = parseSkillIds(body.skillIds)

  if (!action || !['bulk-delete', 'bulk-add-tags'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  if (skillIds.length === 0) {
    return NextResponse.json({ error: 'skillIds must contain at least one id' }, { status: 400 })
  }

  if (action === 'bulk-delete') {
    try {
      let deletedCount = 0
      await prisma.$transaction(async (tx) => {
        for (const id of skillIds) {
          const existing = await tx.skill.findUnique({ where: { id } })
          if (!existing) continue
          await tx.skill.delete({ where: { id } })
          deletedCount += 1
        }
      })
      return NextResponse.json({ ok: true, action, requested: skillIds.length, affected: deletedCount })
    } catch {
      return NextResponse.json({ error: 'Batch delete failed' }, { status: 500 })
    }
  }

  const normalizedTags = normalizeTagNames(Array.isArray(body.tags) ? body.tags : [])
  if (normalizedTags.length === 0) {
    return NextResponse.json({ error: 'tags must contain at least one valid tag' }, { status: 400 })
  }

  try {
    const tagRecords = await upsertTags(normalizedTags)
    let updatedCount = 0
    await prisma.$transaction(async (tx) => {
      for (const id of skillIds) {
        const current = await tx.skill.findUnique({
          where: { id },
          include: { tags: { include: { tag: true } } },
        })
        if (!current) continue

        const existingTagNames = new Set(current.tags.map((st) => st.tag.name))
        const toCreate = tagRecords
          .filter((tag) => !existingTagNames.has(tag.name))
          .map((tag) => ({ tagId: tag.id }))

        if (toCreate.length > 0) {
          await tx.skill.update({
            where: { id },
            data: {
              tags: {
                create: toCreate,
              },
            },
          })
        }
        updatedCount += 1
      }
    })

    return NextResponse.json({
      ok: true,
      action,
      requested: skillIds.length,
      affected: updatedCount,
      tags: normalizedTags,
    })
  } catch (err) {
    if (isServiceError(err, 'TAG_NAME_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Batch tag update failed' }, { status: 500 })
  }
}
