import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { renderSkillMarkdown } from '@/lib/markdown'
import { lintSkill } from '@/lib/lint'
import type { SkillData } from '@/lib/types'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function toSkillData(dbSkill: Record<string, unknown>): SkillData {
  return {
    id: dbSkill.id as number,
    title: dbSkill.title as string,
    slug: dbSkill.slug as string,
    summary: dbSkill.summary as string,
    inputs: dbSkill.inputs as string,
    outputs: dbSkill.outputs as string,
    steps: dbSkill.steps as string[],
    risks: dbSkill.risks as string,
    triggers: dbSkill.triggers as string[],
    guardrails: dbSkill.guardrails as SkillData['guardrails'],
    tests: dbSkill.tests as SkillData['tests'],
  }
}

/**
 * GET /api/skills/:id/export.md - 导出为 Markdown
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({ where: { id: Number(id) } })

  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  const skillData = toSkillData(skill as unknown as Record<string, unknown>)
  const lint = lintSkill(skillData)

  if (!lint.valid) {
    return NextResponse.json(
      { error: 'Lint failed', errors: lint.errors },
      { status: 400 }
    )
  }

  const md = renderSkillMarkdown(skillData)

  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${skillData.slug}.md"`,
    },
  })
}
