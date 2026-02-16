import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateSkillFilePath } from '@/lib/skill-files'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const TEXT_MAX = 200 * 1024   // 200KB
const BINARY_MAX = 2 * 1024 * 1024 // 2MB

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

/**
 * GET /api/skills/:id/files
 * - 无 path query: 返回文件列表
 * - 有 path query: 返回指定文件内容
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({ where: { id: Number(id) } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')

  if (filePath) {
    const file = await prisma.skillFile.findUnique({
      where: { skillId_path: { skillId: skill.id, path: filePath } },
    })
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    return NextResponse.json({
      id: file.id,
      path: file.path,
      mime: file.mime,
      isBinary: file.isBinary,
      contentText: file.isBinary ? undefined : file.contentText,
      contentBase64: file.isBinary && file.contentBytes
        ? Buffer.from(file.contentBytes).toString('base64')
        : undefined,
      updatedAt: file.updatedAt,
    })
  }

  const files = await prisma.skillFile.findMany({ where: { skillId: skill.id } })
  return NextResponse.json(
    files.map((f) => ({
      path: f.path,
      mime: f.mime,
      isBinary: f.isBinary,
      size: f.isBinary
        ? (f.contentBytes ? Buffer.from(f.contentBytes).length : 0)
        : (f.contentText ? Buffer.byteLength(f.contentText, 'utf-8') : 0),
      updatedAt: f.updatedAt,
    }))
  )
}

/**
 * POST /api/skills/:id/files - 创建文件
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({ where: { id: Number(id) } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const body = await request.json()
  const { path: filePath, content, mime, isBinary } = body as {
    path: string
    content: string
    mime: string
    isBinary: boolean
  }

  // 路径校验
  const validation = validateSkillFilePath(filePath)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join('; ') }, { status: 400 })
  }

  // 大小校验
  if (isBinary) {
    const bytes = Buffer.from(content, 'base64')
    if (bytes.length > BINARY_MAX) {
      return NextResponse.json({ error: 'Binary file exceeds 2MB limit' }, { status: 413 })
    }
  } else {
    if (Buffer.byteLength(content, 'utf-8') > TEXT_MAX) {
      return NextResponse.json({ error: 'Text file exceeds 200KB limit' }, { status: 413 })
    }
  }

  let file
  try {
    file = await prisma.skillFile.create({
      data: {
        skillId: skill.id,
        path: filePath,
        mime: mime || 'application/octet-stream',
        isBinary: !!isBinary,
        contentText: isBinary ? null : content,
        contentBytes: isBinary ? Buffer.from(content, 'base64') : null,
      },
    })
  } catch (err) {
    if (isPrismaCode(err, 'P2002')) {
      return NextResponse.json({ error: 'File path already exists' }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json(
    { id: file.id, path: file.path, mime: file.mime, isBinary: file.isBinary, updatedAt: file.updatedAt },
    { status: 201 }
  )
}

/**
 * PUT /api/skills/:id/files?path=... - 更新文件内容
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({ where: { id: Number(id) } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'path query required' }, { status: 400 })

  const body = await request.json()
  const { content } = body as { content: string }

  const existing = await prisma.skillFile.findUnique({
    where: { skillId_path: { skillId: skill.id, path: filePath } },
  })
  if (!existing) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (existing.isBinary) {
    const bytes = Buffer.from(content, 'base64')
    if (bytes.length > BINARY_MAX) {
      return NextResponse.json({ error: 'Binary file exceeds 2MB limit' }, { status: 413 })
    }
    updateData.contentBytes = bytes
  } else {
    if (Buffer.byteLength(content, 'utf-8') > TEXT_MAX) {
      return NextResponse.json({ error: 'Text file exceeds 200KB limit' }, { status: 413 })
    }
    updateData.contentText = content
  }

  const updated = await prisma.skillFile.update({
    where: { skillId_path: { skillId: skill.id, path: filePath } },
    data: updateData,
  })

  return NextResponse.json({
    id: updated.id,
    path: updated.path,
    mime: updated.mime,
    isBinary: updated.isBinary,
    contentText: updated.isBinary ? undefined : updated.contentText,
    updatedAt: updated.updatedAt,
  })
}

/**
 * DELETE /api/skills/:id/files?path=... - 删除文件
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({ where: { id: Number(id) } })
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'path query required' }, { status: 400 })

  try {
    await prisma.skillFile.delete({
      where: { skillId_path: { skillId: skill.id, path: filePath } },
    })
  } catch (err) {
    if (isPrismaCode(err, 'P2025')) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
