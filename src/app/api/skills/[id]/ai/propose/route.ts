import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { runClaude } from '@/lib/ai/claudeRunner'
import { changeSetJsonSchema } from '@/lib/ai/schema'
import { lintSkill } from '@/lib/lint'
import type { SkillData } from '@/lib/types'
import type { AiAction } from '@/lib/ai/types'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

const VALID_ACTIONS: AiAction[] = ['update-skill', 'fix-lint', 'create-supporting-files']
const PROMPT_SOFT_LIMIT = 7600

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function truncateList(items: string[], maxItems: number, maxItemLength: number): string[] {
  return items.slice(0, maxItems).map((item) => truncateText(item, maxItemLength))
}

function buildPromptSkillSnapshot(skillData: SkillData, compact = false): Record<string, unknown> {
  const base: Record<string, unknown> = {
    title: truncateText(skillData.title, 200),
    slug: skillData.slug,
    summary: truncateText(skillData.summary, compact ? 320 : 900),
    steps: truncateList(skillData.steps, 7, compact ? 140 : 280),
    triggers: truncateList(skillData.triggers, 8, compact ? 100 : 180),
    guardrails: skillData.guardrails,
    tests: (skillData.tests || []).slice(0, compact ? 2 : 5).map((t) => ({
      name: truncateText(t.name, compact ? 100 : 180),
      input: truncateText(t.input, compact ? 180 : 320),
      expected_output: truncateText(t.expected_output, compact ? 180 : 320),
    })),
    tags: (skillData.tags || []).slice(0, 12),
  }

  if (!compact) {
    base.inputs = truncateText(skillData.inputs, 1000)
    base.outputs = truncateText(skillData.outputs, 1000)
    base.risks = truncateText(skillData.risks, 1000)
  }

  return base
}

function buildPrompt(
  action: AiAction,
  skillSnapshot: Record<string, unknown>,
  filesIndex: Array<{ path: string; mime: string; size: number }>,
  lintErrors: string[],
  instruction?: string,
): string {
  const promptParts: string[] = [
    `Action: ${action}`,
    `Current skill (JSON): ${JSON.stringify(skillSnapshot)}`,
    `Supporting files index: ${JSON.stringify(filesIndex)}`,
  ]

  if (lintErrors.length > 0) {
    promptParts.push(`Current lint errors:\n${lintErrors.slice(0, 20).map((e) => truncateText(e, 220)).join('\n')}`)
  }

  if (instruction) {
    promptParts.push(`User instruction: ${truncateText(instruction, 1200)}`)
  }

  return promptParts.join('\n\n')
}

/**
 * POST /api/skills/:id/ai/propose
 * 调用 Claude CLI 生成变更提案
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const skillId = Number(id)
  if (!Number.isInteger(skillId) || skillId <= 0) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 })
  }

  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    include: { tags: { include: { tag: true } } },
  })
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  let body: { action?: string; instruction?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as AiAction
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(', ')}` },
      { status: 400 }
    )
  }

  // 获取 supporting files 索引
  const files = await prisma.skillFile.findMany({ where: { skillId: skill.id } })
  const filesIndex = files.map((f) => ({
    path: f.path,
    mime: f.mime,
    size: f.isBinary
      ? (f.contentBytes ? Buffer.from(f.contentBytes).length : 0)
      : (f.contentText ? Buffer.byteLength(f.contentText, 'utf-8') : 0),
  }))

  // 构建 skill 数据
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
    tags: skill.tags.map((st: { tag: { name: string } }) => st.tag.name),
  }

  // 构建 lint errors（fix-lint 时使用）
  let lintErrors: string[] = []
  if (action === 'fix-lint') {
    const lint = lintSkill(skillData)
    lintErrors = lint.errors.map((e) => `${e.field}: ${e.message}`)
  }

  // 组装 user prompt
  const fullPrompt = buildPrompt(
    action,
    buildPromptSkillSnapshot(skillData, false),
    filesIndex.slice(0, 80),
    lintErrors,
    typeof body.instruction === 'string' ? body.instruction : undefined,
  )

  const prompt = fullPrompt.length > PROMPT_SOFT_LIMIT
    ? buildPrompt(
        action,
        buildPromptSkillSnapshot(skillData, true),
        filesIndex.slice(0, 24),
        lintErrors,
        typeof body.instruction === 'string' ? body.instruction : undefined,
      )
    : fullPrompt

  // 调用 Claude CLI
  const result = await runClaude({
    prompt,
    jsonSchema: changeSetJsonSchema,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: 'Claude CLI failed', details: result.errors },
      { status: 502 }
    )
  }

  const changeSet = result.structuredOutput!

  // 生成 path preview
  const pathPreview = changeSet.fileOps.map((fop) => ({
    op: fop.op,
    path: fop.path,
    size: fop.content_text ? Buffer.byteLength(fop.content_text, 'utf-8') : 0,
  }))

  // 生成 lint preview（模拟 apply 后的 skill 状态）
  const mergedSkill: SkillData = {
    ...skillData,
    ...changeSet.skillPatch,
    guardrails: changeSet.skillPatch.guardrails
      ? { ...skillData.guardrails, ...changeSet.skillPatch.guardrails } as SkillData['guardrails']
      : skillData.guardrails,
  }
  const lintPreview = lintSkill(mergedSkill)

  return NextResponse.json({
    changeSet,
    lintPreview,
    pathPreview,
    usage: result.usage,
  })
}
