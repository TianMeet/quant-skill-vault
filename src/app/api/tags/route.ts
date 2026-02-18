import { NextRequest, NextResponse } from 'next/server'
import { createOrGetTag, isServiceError, listTags, listTagsPaged } from '@/lib/tag-service'

export const runtime = 'nodejs'

function parsePositiveInt(input: string | null, fallback: number): number {
  if (!input) return fallback
  const parsed = Number(input)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

/**
 * GET /api/tags - 获取所有标签
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const pageParam = searchParams.get('page')
  const limitParam = searchParams.get('limit')
  const hasPagination = pageParam !== null || limitParam !== null

  if (hasPagination) {
    const page = parsePositiveInt(pageParam, 1)
    const limit = Math.min(100, parsePositiveInt(limitParam, 20))
    const result = await listTagsPaged(query, page, limit)
    return NextResponse.json({
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      query,
    })
  }

  const items = await listTags(query)

  return NextResponse.json(
    {
      items,
      total: items.length,
      query,
    }
  )
}

/**
 * POST /api/tags - 创建标签
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name } = body

    if (typeof name !== 'string') {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
    }

    const tag = await createOrGetTag(name)

    return NextResponse.json({ tag }, { status: 201 })
  } catch (err) {
    if (isServiceError(err, 'TAG_NAME_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    console.error('POST /api/tags error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
