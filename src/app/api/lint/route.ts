import { NextRequest, NextResponse } from 'next/server'
import { lintSkill } from '@/lib/lint'
import { slugify } from '@/lib/slugify'
import type { SkillData } from '@/lib/types'

export const runtime = 'nodejs'

/**
 * POST /api/lint - 客户端 lint 校验（不需要持久化）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const slug = slugify(body.title || '')

    const skillData: SkillData = {
      title: body.title || '',
      slug,
      summary: body.summary || '',
      inputs: body.inputs || '',
      outputs: body.outputs || '',
      steps: body.steps || [],
      risks: body.risks || '',
      triggers: body.triggers || [],
      guardrails: body.guardrails || {
        allowed_tools: [],
        disable_model_invocation: false,
        user_invocable: true,
        stop_conditions: [],
        escalation: 'ASK_HUMAN',
      },
      tests: body.tests || [],
    }

    const result = lintSkill(skillData)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ valid: false, errors: [{ field: 'body', message: 'Invalid request body' }] }, { status: 400 })
  }
}
