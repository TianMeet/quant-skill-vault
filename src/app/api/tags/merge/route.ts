import { NextRequest, NextResponse } from 'next/server'
import { isServiceError, mergeTags } from '@/lib/tag-service'

export const runtime = 'nodejs'

/**
 * POST /api/tags/merge - 合并标签 sourceTagId -> targetTagId
 */
export async function POST(request: NextRequest) {
  let body: { sourceTagId?: unknown; targetTagId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const sourceTagId = Number(body.sourceTagId)
  const targetTagId = Number(body.targetTagId)

  if (!Number.isInteger(sourceTagId) || sourceTagId <= 0) {
    return NextResponse.json({ error: 'Invalid source tag id' }, { status: 400 })
  }
  if (!Number.isInteger(targetTagId) || targetTagId <= 0) {
    return NextResponse.json({ error: 'Invalid target tag id' }, { status: 400 })
  }

  try {
    const result = await mergeTags(sourceTagId, targetTagId)
    return NextResponse.json({ success: true, merged: result })
  } catch (err) {
    if (isServiceError(err, 'TAG_MERGE_INVALID')) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
    if (isServiceError(err, 'TAG_SOURCE_NOT_FOUND')) {
      return NextResponse.json({ error: 'Source tag not found' }, { status: 404 })
    }
    if (isServiceError(err, 'TAG_TARGET_NOT_FOUND')) {
      return NextResponse.json({ error: 'Target tag not found' }, { status: 404 })
    }
    console.error('POST /api/tags/merge error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
