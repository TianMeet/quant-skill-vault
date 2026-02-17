import { NextRequest, NextResponse } from 'next/server'
import { deleteTag, isServiceError, parseTagId, renameTag } from '@/lib/tag-service'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * PATCH /api/tags/:id - 重命名标签
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const tagId = parseTagId(id)
  if (!tagId) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 })
  }

  let body: { name?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  }

  try {
    const tag = await renameTag(tagId, body.name)
    return NextResponse.json({ tag })
  } catch (err) {
    if (isServiceError(err, 'TAG_NOT_FOUND')) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    if (isServiceError(err, 'TAG_NAME_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (isServiceError(err, 'TAG_NAME_CONFLICT')) {
      return NextResponse.json(
        {
          error: 'Tag name already exists',
          conflictTagId: (err as { conflictTagId?: number }).conflictTagId,
        },
        { status: 409 }
      )
    }
    console.error('PATCH /api/tags/:id error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/tags/:id - 删除标签（解除所有技能关联）
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const tagId = parseTagId(id)
  if (!tagId) {
    return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 })
  }

  try {
    const result = await deleteTag(tagId)
    return NextResponse.json({
      success: true,
      deleted: result,
    })
  } catch (err) {
    if (isServiceError(err, 'TAG_NOT_FOUND')) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    console.error('DELETE /api/tags/:id error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
