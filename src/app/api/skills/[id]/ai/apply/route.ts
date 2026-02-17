import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateChangeSet } from '@/lib/ai/claudeRunner'
import { slugify } from '@/lib/slugify'
import type { ChangeSet } from '@/lib/ai/types'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }
const BINARY_MAX = 2 * 1024 * 1024 // 2MB

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
}

function parseSkillId(rawId: string): number | null {
  const skillId = Number(rawId)
  if (!Number.isInteger(skillId) || skillId <= 0) return null
  return skillId
}

/**
 * POST /api/skills/:id/ai/apply
 * 应用变更提案到数据库
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skillId = parseSkillId(id)
  if (!skillId) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })
  }

  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { tags: { include: { tag: true } } },
  })
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  let body: { changeSet?: ChangeSet }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.changeSet) {
    return NextResponse.json({ error: 'changeSet is required' }, { status: 400 })
  }

  const cs = body.changeSet

  // 校验 changeSet（schema + path gate + size gate）
  const validation = validateChangeSet(cs)
  if (!validation.valid) {
    return NextResponse.json({ error: 'Invalid changeSet', errors: validation.errors }, { status: 400 })
  }

  try {
    // 1) Apply skillPatch to DB
    const patch = cs.skillPatch
    const updateData: Record<string, unknown> = {}

    if (patch.title !== undefined) {
      const nextSlug = slugify(patch.title)
      if (!nextSlug) {
        return NextResponse.json(
          { error: 'Cannot generate valid slug from title' },
          { status: 400 }
        )
      }
      updateData.title = patch.title
      updateData.slug = nextSlug
    }
    if (patch.summary !== undefined) updateData.summary = patch.summary
    if (patch.inputs !== undefined) updateData.inputs = patch.inputs
    if (patch.outputs !== undefined) updateData.outputs = patch.outputs
    if (patch.steps !== undefined) updateData.steps = patch.steps
    if (patch.risks !== undefined) updateData.risks = patch.risks
    if (patch.triggers !== undefined) updateData.triggers = patch.triggers
    if (patch.guardrails !== undefined) {
      // Merge with existing guardrails
      const existing = skill.guardrails as Record<string, unknown>
      updateData.guardrails = { ...existing, ...patch.guardrails }
    }
    if (patch.tests !== undefined) updateData.tests = patch.tests

    // Handle tags
    if (patch.tags) {
      const normalized = normalizeTags(patch.tags)
      const tagRecords = await Promise.all(
        normalized.map((name) =>
          prisma.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          })
        )
      )
      updateData.tags = {
        deleteMany: {},
        create: tagRecords.map((t) => ({ tagId: t.id })),
      }
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.skill.update({
          where: { id: skillId },
          data: updateData,
        })
      }

      // 2) Apply fileOps
      for (const fop of cs.fileOps) {
        if (fop.op === 'upsert') {
          const isBinary = !!fop.content_base64
          const existing = await tx.skillFile.findUnique({
            where: { skillId_path: { skillId, path: fop.path } },
          })

          if (isBinary) {
            const bytes = Buffer.from(fop.content_base64!, 'base64')
            if (bytes.length > BINARY_MAX) {
              throw Object.assign(new Error('Binary file exceeds 2MB limit'), { code: 'PAYLOAD_TOO_LARGE' })
            }
          }

          if (existing) {
            await tx.skillFile.update({
              where: { skillId_path: { skillId, path: fop.path } },
              data: {
                mime: fop.mime || existing.mime,
                isBinary,
                contentText: isBinary ? null : (fop.content_text || null),
                contentBytes: isBinary ? Buffer.from(fop.content_base64!, 'base64') : null,
              },
            })
          } else {
            await tx.skillFile.create({
              data: {
                skillId,
                path: fop.path,
                mime: fop.mime || 'text/plain',
                isBinary,
                contentText: isBinary ? null : (fop.content_text || ''),
                contentBytes: isBinary ? Buffer.from(fop.content_base64!, 'base64') : null,
              },
            })
          }
        } else if (fop.op === 'delete') {
          try {
            await tx.skillFile.delete({
              where: { skillId_path: { skillId, path: fop.path } },
            })
          } catch {
            // File may not exist, ignore
          }
        }
      }
    })

    // 3) Return updated skill
    const updated = await prisma.skill.findUnique({
      where: { id: skillId },
      include: { tags: { include: { tag: true } } },
    })

    return NextResponse.json({
      skill: {
        ...updated,
        tags: updated!.tags.map((st: { tag: { name: string } }) => st.tag.name),
      },
    })
  } catch (err) {
    if (isPrismaCode(err, 'P2002')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    if (isPrismaCode(err, 'PAYLOAD_TOO_LARGE')) {
      return NextResponse.json({ error: 'Binary file exceeds 2MB limit' }, { status: 413 })
    }
    console.error('POST /api/skills/:id/ai/apply error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
