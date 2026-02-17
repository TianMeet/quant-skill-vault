import { NextRequest, NextResponse } from 'next/server'
import { getLinkedSkills, isServiceError, parseTagId } from '@/lib/tag-service'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * GET /api/tags/:id/skills - 查询标签关联技能
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const tagId = parseTagId(id)
  if (!tagId) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 })
  }

  try {
    const data = await getLinkedSkills(tagId)
    return NextResponse.json(data)
  } catch (err) {
    if (isServiceError(err, 'TAG_NOT_FOUND')) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    console.error('GET /api/tags/:id/skills error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
