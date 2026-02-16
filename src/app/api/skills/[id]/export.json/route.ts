import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { lintSkill } from '@/lib/lint'
import type { SkillData } from '@/lib/types'
import { buildDescription } from '@/lib/markdown'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * GET /api/skills/:id/export.json - 导出为结构化 JSON
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skill = await prisma.skill.findUnique({
    where: { id: Number(id) },
    include: { tags: { include: { tag: true } } },
  })

  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

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
    tags: skill.tags.map((st) => st.tag.name),
  }

  const lint = lintSkill(skillData)
  if (!lint.valid) {
    return NextResponse.json(
      { error: 'Lint failed', errors: lint.errors },
      { status: 400 }
    )
  }

  const description = buildDescription(skillData)

  return NextResponse.json({
    name: skill.slug,
    description,
    title: skill.title,
    summary: skill.summary,
    inputs: skill.inputs,
    outputs: skill.outputs,
    steps: skill.steps,
    risks: skill.risks,
    triggers: skill.triggers,
    guardrails: skill.guardrails,
    tests: skill.tests,
    tags: skillData.tags,
    allowed_tools: (skill.guardrails as unknown as SkillData['guardrails']).allowed_tools,
    disable_model_invocation: (skill.guardrails as unknown as SkillData['guardrails']).disable_model_invocation,
    user_invocable: (skill.guardrails as unknown as SkillData['guardrails']).user_invocable,
  })
}
