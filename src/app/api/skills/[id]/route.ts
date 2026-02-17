import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { updateSkillSchema } from '@/lib/zod-schemas'
import { slugify } from '@/lib/slugify'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

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
 * GET /api/skills/:id - 获取单个 Skill
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
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

  return NextResponse.json({
    ...skill,
    tags: skill.tags.map((st) => st.tag.name),
  })
}

/**
 * PUT /api/skills/:id - 更新 Skill
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skillId = parseSkillId(id)
  if (!skillId) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })
  }
  try {
    const body = await request.json()
    const parsed = updateSkillSchema.parse(body)

    const existing = await prisma.skill.findUnique({ where: { id: skillId } })
    if (!existing) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    const slug = parsed.title ? slugify(parsed.title) : existing.slug
    if (parsed.title && !slug) {
      return NextResponse.json(
        { error: 'Cannot generate valid slug from title' },
        { status: 400 }
      )
    }

    // Handle tags update
    let tagConnect
    if (parsed.tags) {
      const normalized = normalizeTags(parsed.tags)
      const tagRecords = await Promise.all(
        normalized.map((name) =>
          prisma.tag.upsert({
            where: { name },
            update: {},
            create: { name },
          })
        )
      )
      tagConnect = {
        deleteMany: {},
        create: tagRecords.map((t) => ({ tagId: t.id })),
      }
    }

    const skill = await prisma.skill.update({
      where: { id: skillId },
      data: {
        ...(parsed.title && { title: parsed.title }),
        ...(parsed.title && { slug }),
        ...(parsed.summary !== undefined && { summary: parsed.summary }),
        ...(parsed.inputs !== undefined && { inputs: parsed.inputs }),
        ...(parsed.outputs !== undefined && { outputs: parsed.outputs }),
        ...(parsed.steps && { steps: parsed.steps }),
        ...(parsed.risks !== undefined && { risks: parsed.risks }),
        ...(parsed.triggers && { triggers: parsed.triggers }),
        ...(parsed.guardrails && { guardrails: parsed.guardrails }),
        ...(parsed.tests && { tests: parsed.tests }),
        ...(tagConnect && { tags: tagConnect }),
      },
      include: { tags: { include: { tag: true } } },
    })

    return NextResponse.json({
      ...skill,
      tags: skill.tags.map((st) => st.tag.name),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: err }, { status: 400 })
    }
    if (isPrismaCode(err, 'P2002')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    console.error('PUT /api/skills/:id error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/skills/:id - 删除 Skill
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skillId = parseSkillId(id)
  if (!skillId) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })
  }
  const existing = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!existing) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  await prisma.skill.delete({ where: { id: skillId } })
  return NextResponse.json({ success: true })
}
