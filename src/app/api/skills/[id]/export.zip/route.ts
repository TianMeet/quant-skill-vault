import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { renderSkillMarkdown } from '@/lib/markdown'
import { lintSkillPackage } from '@/lib/lint'
import type { SkillData } from '@/lib/types'
import archiver from 'archiver'
import { PassThrough } from 'stream'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * GET /api/skills/:id/export.zip - 导出为 Claude Code Skills 合规 zip 包（含 supporting files）
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({ where: { id: Number(id) } })

  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  // 获取 supporting files
  const files = await prisma.skillFile.findMany({ where: { skillId: skill.id } })
  const filePaths = files.map((f) => f.path)

  const skillData: SkillData = {
    id: skill.id,
    title: skill.title,
    slug: skill.slug,
    summary: skill.summary,
    inputs: skill.inputs,
    outputs: skill.outputs,
    steps: skill.steps as string[],
    risks: skill.risks,
    triggers: skill.triggers as string[],
    guardrails: skill.guardrails as unknown as SkillData['guardrails'],
    tests: skill.tests as unknown as SkillData['tests'],
  }

  // Lint gate（含 supporting files 校验）
  const lint = lintSkillPackage(skillData, filePaths)
  if (!lint.valid) {
    return NextResponse.json(
      { error: 'Lint failed. Fix errors before exporting.', errors: lint.errors },
      { status: 400 }
    )
  }

  const md = renderSkillMarkdown(skillData, filePaths)
  const slug = skill.slug

  // 使用 archiver 创建 zip 流
  const archive = archiver('zip', { zlib: { level: 9 } })
  const passthrough = new PassThrough()

  archive.pipe(passthrough)
  archive.append(md, { name: `${slug}/SKILL.md` })

  // 写入 supporting files
  for (const f of files) {
    if (f.isBinary && f.contentBytes) {
      archive.append(Buffer.from(f.contentBytes), { name: `${slug}/${f.path}` })
    } else if (f.contentText) {
      archive.append(f.contentText, { name: `${slug}/${f.path}` })
    }
  }

  archive.finalize()

  // 将 Node stream 转为 Web ReadableStream
  const readable = new ReadableStream({
    start(controller) {
      passthrough.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      passthrough.on('end', () => {
        controller.close()
      })
      passthrough.on('error', (err) => {
        controller.error(err)
      })
    },
  })

  return new NextResponse(readable, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${slug}.zip"`,
    },
  })
}
