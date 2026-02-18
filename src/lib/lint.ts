/**
 * lintSkill - Skill 合规性校验（Lint Gate）
 * 校验 Skill 是否满足 Claude Code Skills 导出要求
 */
import type { SkillData, LintResult, LintError } from './types'
import { buildDescription, renderSkillMarkdown, extractRelativeLinks } from './markdown'
import { validateSkillFilePath } from './skill-files'

const SLUG_REGEX = /^[a-z0-9-]{1,64}$/
const VALID_ESCALATIONS = ['REVIEW', 'BLOCK', 'ASK_HUMAN']
const DESCRIPTION_MAX = 2048

export function lintSkill(skill: SkillData): LintResult {
  const errors: LintError[] = []

  // slug 校验
  if (!skill.slug || !SLUG_REGEX.test(skill.slug)) {
    errors.push({
      field: 'slug',
      message: `name (slug) must match ^[a-z0-9-]{1,64}$, got: "${skill.slug || ''}"`,
    })
  }

  // triggers 校验
  if (!skill.triggers || skill.triggers.length < 3) {
    errors.push({
      field: 'triggers',
      message: `triggers must have >= 3 items, got: ${skill.triggers?.length ?? 0}`,
    })
  }

  // description 长度校验（由 summary + triggers 生成）
  if (skill.triggers && skill.triggers.length >= 3) {
    const desc = buildDescription(skill)
    if (desc.length > DESCRIPTION_MAX) {
      errors.push({
        field: 'description',
        message: `generated description exceeds ${DESCRIPTION_MAX} characters (${desc.length})`,
      })
    }
  }

  // steps 校验
  if (!skill.steps || skill.steps.length < 3 || skill.steps.length > 7) {
    errors.push({
      field: 'steps',
      message: `steps must have 3~7 items, got: ${skill.steps?.length ?? 0}`,
    })
  }

  // tests 校验
  if (!skill.tests || skill.tests.length < 1) {
    errors.push({
      field: 'tests',
      message: 'tests must have >= 1 test case',
    })
  }

  // guardrails 校验
  if (!skill.guardrails?.stop_conditions || skill.guardrails.stop_conditions.length < 1) {
    errors.push({
      field: 'guardrails.stop_conditions',
      message: 'stop_conditions must have >= 1 item',
    })
  }

  if (!VALID_ESCALATIONS.includes(skill.guardrails?.escalation)) {
    errors.push({
      field: 'guardrails.escalation',
      message: `escalation must be one of ${VALID_ESCALATIONS.join(', ')}, got: "${skill.guardrails?.escalation}"`,
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * lintSkillPackage - 校验 Skill + supporting files 整体合规性
 * 1) 先调用 lintSkill 校验基础字段
 * 2) 校验每个 file path 合法性
 * 3) 渲染 SKILL.md 并检查所有相对链接都有对应文件
 */
export function lintSkillPackage(skill: SkillData, filePaths: string[]): LintResult {
  const errors: LintError[] = []

  // 基础 lint
  const base = lintSkill(skill)
  errors.push(...base.errors)

  // 校验每个 file path
  for (const p of filePaths) {
    const v = validateSkillFilePath(p)
    if (!v.valid) {
      errors.push({ field: 'files', message: `invalid path: ${p} — ${v.errors.join('; ')}` })
    }
  }

  // 渲染 SKILL.md（含 supporting files 链接），提取所有相对链接并校验
  const md = renderSkillMarkdown(skill, filePaths)
  const links = extractRelativeLinks(md)
  for (const link of links) {
    if (!filePaths.includes(link)) {
      errors.push({ field: 'files', message: `missing file: ${link}` })
    }
  }

  return { valid: errors.length === 0, errors }
}
