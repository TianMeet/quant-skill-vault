import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/tags - 获取所有标签
 */
export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { skills: true } },
    },
  })

  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      name: t.name,
      count: t._count.skills,
    }))
  )
}

/**
 * POST /api/tags - 创建标签
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
    }

    const tag = await prisma.tag.upsert({
      where: { name: name.trim() },
      update: {},
      create: { name: name.trim() },
    })

    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    console.error('POST /api/tags error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
