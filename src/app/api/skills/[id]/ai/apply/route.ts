import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateChangeSet } from '@/lib/ai/claudeRunner'
import { slugify } from '@/lib/slugify'
import type { ChangeSet } from '@/lib/ai/types'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/skills/:id/ai/apply
 * 应用变更提案到数据库
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

  const skill = await prisma.skill.findUnique({
    where: { id: Number(id) },
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
      updateData.title = patch.title
      updateData.slug = slugify(patch.title)
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
      const tagRecords = await Promise.all(
        patch.tags.map((name) =>
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

    if (Object.keys(updateData).length > 0) {
      await prisma.skill.update({
        where: { id: Number(id) },
        data: updateData,
      })
    }

    // 2) Apply fileOps
    for (const fop of cs.fileOps) {
      if (fop.op === 'upsert') {
        const isBinary = !!fop.content_base64
        const existing = await prisma.skillFile.findUnique({
          where: { skillId_path: { skillId: Number(id), path: fop.path } },
        })

        if (existing) {
          await prisma.skillFile.update({
            where: { skillId_path: { skillId: Number(id), path: fop.path } },
            data: {
              mime: fop.mime || existing.mime,
              isBinary,
              contentText: isBinary ? null : (fop.content_text || null),
              contentBytes: isBinary ? Buffer.from(fop.content_base64!, 'base64') : null,
            },
          })
        } else {
          await prisma.skillFile.create({
            data: {
              skillId: Number(id),
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
          await prisma.skillFile.delete({
            where: { skillId_path: { skillId: Number(id), path: fop.path } },
          })
        } catch {
          // File may not exist, ignore
        }
      }
    }

    // 3) Return updated skill
    const updated = await prisma.skill.findUnique({
      where: { id: Number(id) },
      include: { tags: { include: { tag: true } } },
    })

    return NextResponse.json({
      skill: {
        ...updated,
        tags: updated!.tags.map((st: { tag: { name: string } }) => st.tag.name),
      },
    })
  } catch (err) {
    console.error('POST /api/skills/:id/ai/apply error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
