import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSkillSchema } from '@/lib/zod-schemas'
import { slugify } from '@/lib/slugify'
import { buildCreateTagConnect, isServiceError } from '@/lib/tag-service'
import { normalizeTagNames } from '@/lib/tag-normalize'

export const runtime = 'nodejs'

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

/**
 * GET /api/skills - 列表查询，支持 query 和 tags 过滤
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const tagsParam = searchParams.get('tags') || ''
  const tagNames = tagsParam ? normalizeTagNames(tagsParam.split(',')) : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (query) {
    where.OR = [
      { title: { contains: query } },
      { summary: { contains: query } },
    ]
  }

  if (tagNames.length > 0) {
    where.tags = {
      some: {
        tag: {
          name: { in: tagNames },
        },
      },
    }
  }

  const skills = await prisma.skill.findMany({
    where,
    include: {
      tags: {
        include: { tag: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const result = skills.map((s) => ({
    ...s,
    tags: s.tags.map((st) => st.tag.name),
  }))

  return NextResponse.json(result)
}

/**
 * POST /api/skills - 创建 Skill
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createSkillSchema.parse(body)
    const slug = slugify(parsed.title)

    if (!slug) {
      return NextResponse.json(
        { error: 'Cannot generate valid slug from title' },
        { status: 400 }
      )
    }

    const tagConnect = await buildCreateTagConnect(parsed.tags)

    const skill = await prisma.skill.create({
      data: {
        title: parsed.title,
        slug,
        summary: parsed.summary,
        inputs: parsed.inputs,
        outputs: parsed.outputs,
        steps: parsed.steps,
        risks: parsed.risks,
        triggers: parsed.triggers,
        guardrails: parsed.guardrails,
        tests: parsed.tests,
        tags: tagConnect,
      },
      include: {
        tags: { include: { tag: true } },
      },
    })

    return NextResponse.json(
      { ...skill, tags: skill.tags.map((st) => st.tag.name) },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: err }, { status: 400 })
    }
    if (isServiceError(err, 'TAG_NAME_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (isPrismaCode(err, 'P2002')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    console.error('POST /api/skills error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
