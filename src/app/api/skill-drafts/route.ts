import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/skill-drafts
 * 返回最近更新的草稿列表（用于管理视图）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = (searchParams.get('mode') || '').trim()
  const where = mode ? { mode } : undefined

  const drafts = await prisma.skillDraft.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      draftKey: true,
      mode: true,
      skillId: true,
      version: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    items: drafts.map((item) => ({
      id: item.id,
      key: item.draftKey,
      mode: item.mode,
      skillId: item.skillId,
      version: item.version,
      updatedAt: item.updatedAt.toISOString(),
    })),
    total: drafts.length,
  })
}
