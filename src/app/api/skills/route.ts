import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSkillSchema } from '@/lib/zod-schemas'
import { slugify } from '@/lib/slugify'
import { buildCreateTagConnect, isServiceError } from '@/lib/tag-service'
import { normalizeTagNames } from '@/lib/tag-normalize'
import { createSkillVersionIfAvailable, toSkillSnapshot } from '@/lib/skill-versioning'

export const runtime = 'nodejs'

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 9
const MAX_LIMIT = 60

const SORT_ORDERS: Record<string, { [key: string]: 'asc' | 'desc' }> = {
  updated_desc: { updatedAt: 'desc' },
  updated_asc: { updatedAt: 'asc' },
  created_desc: { createdAt: 'desc' },
  created_asc: { createdAt: 'asc' },
  title_asc: { title: 'asc' },
  title_desc: { title: 'desc' },
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) return fallback
  return value
}

/**
 * GET /api/skills - 列表查询，支持 query 和 tags 过滤
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const tagsParam = searchParams.get('tags') || ''
  const pageRaw = searchParams.get('page')
  const limitRaw = searchParams.get('limit')
  const sortRaw = searchParams.get('sort') || 'updated_desc'
  const shouldPaginate = !!(pageRaw || limitRaw || searchParams.get('sort'))

  const page = parsePositiveInt(pageRaw, DEFAULT_PAGE)
  const limit = Math.min(parsePositiveInt(limitRaw, DEFAULT_LIMIT), MAX_LIMIT)
  const sort = SORT_ORDERS[sortRaw] ? sortRaw : 'updated_desc'
  const orderBy = SORT_ORDERS[sort]
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
    orderBy,
    ...(shouldPaginate ? { skip: (page - 1) * limit, take: limit } : {}),
  })

  const result = skills.map((s) => ({
    ...s,
    tags: s.tags.map((st) => st.tag.name),
  }))

  if (shouldPaginate) {
    const total = await prisma.skill.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / limit))
    return NextResponse.json({
      items: result,
      total,
      page,
      limit,
      totalPages,
      sort,
    })
  }

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
        status: 'draft',
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
    await createSkillVersionIfAvailable(prisma, skill.id, toSkillSnapshot(skill))

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
