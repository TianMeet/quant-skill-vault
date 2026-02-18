/**
 * renderSkillMarkdown - 将 Skill 渲染为 SKILL.md（含 YAML frontmatter）
 * buildDescription - 生成 Claude Code Skills 合规的 description
 */
import * as yaml from 'js-yaml'
import type { SkillData } from './types'

const DESCRIPTION_MAX = 2048

function normalizeSentence(input: string): string {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return 'the user needs this capability'
  const stripped = text.replace(/[.。!?！?]+$/g, '')
  return stripped || 'the user needs this capability'
}

function normalizeTriggers(triggers: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const trigger of triggers) {
    const value = String(trigger || '').replace(/\s+/g, ' ').trim()
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

/**
 * 生成 description：以 "This skill should be used when" 开头，包含触发短语（双引号包裹）
 */
export function buildDescription(skill: SkillData): string {
  const summary = normalizeSentence(skill.summary)
  const triggers = normalizeTriggers(skill.triggers)
  const base = `This skill should be used when ${summary}.`

  if (triggers.length === 0) {
    return base.slice(0, DESCRIPTION_MAX)
  }

  let selected = [...triggers]
  let description = ''

  while (selected.length > 0) {
    const quoted = selected.map((t) => `"${t}"`).join(', ')
    description = `${base} Trigger phrases include: ${quoted}.`
    if (description.length <= DESCRIPTION_MAX) {
      return description
    }
    selected = selected.slice(0, -1)
  }

  return base.slice(0, DESCRIPTION_MAX)
}

/**
 * 从 markdown 文本中提取所有相对路径链接（忽略 http/https）
 */
export function extractRelativeLinks(markdown: string): string[] {
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(markdown)) !== null) {
    const href = match[2]
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
      if (!links.includes(href)) {
        links.push(href)
      }
    }
  }
  return links
}

/**
 * 渲染完整的 SKILL.md 文件内容
 * @param filesIndex - 可选的 supporting files 路径列表，用于生成 Supporting files 段落
 */
export function renderSkillMarkdown(skill: SkillData, filesIndex?: string[]): string {
  const description = buildDescription(skill)

  // 构建 frontmatter 对象
  const frontmatter: Record<string, unknown> = {
    name: skill.slug,
    description,
  }

  if (skill.guardrails?.allowed_tools?.length > 0) {
    frontmatter['allowed-tools'] = skill.guardrails.allowed_tools
  }

  frontmatter['disable-model-invocation'] = skill.guardrails?.disable_model_invocation ?? false
  frontmatter['user-invocable'] = skill.guardrails?.user_invocable ?? true

  const fm = yaml.dump(frontmatter, { lineWidth: -1, quotingType: '"' }).trim()

  // 构建 Markdown 正文
  const sections: string[] = []

  sections.push(`## Purpose\n\n${skill.summary}`)

  sections.push(`## Inputs\n\n${skill.inputs}`)

  sections.push(`## Outputs\n\n${skill.outputs}`)

  const triggerLines = normalizeTriggers(skill.triggers).map((t) => `- "${t}"`)
  if (triggerLines.length > 0) {
    sections.push(`## Trigger phrases\n\n${triggerLines.join('\n')}`)
  }

  const stepsText = skill.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
  sections.push(`## Workflow\n\n${stepsText}`)

  sections.push(`## Pitfalls\n\n${skill.risks}`)

  // Guardrails
  const guardrailLines: string[] = []
  guardrailLines.push(`- Escalation policy: ${skill.guardrails.escalation}`)
  guardrailLines.push(`- Allowed tools: ${skill.guardrails.allowed_tools.length > 0 ? skill.guardrails.allowed_tools.join(', ') : 'None'}`)
  guardrailLines.push(`- User invocable: ${skill.guardrails.user_invocable ? 'true' : 'false'}`)
  guardrailLines.push(`- Disable model invocation: ${skill.guardrails.disable_model_invocation ? 'true' : 'false'}`)
  guardrailLines.push('- Stop conditions:')
  skill.guardrails.stop_conditions.forEach((sc) => {
    guardrailLines.push(`  - ${sc}`)
  })
  sections.push(`## Guardrails\n\n${guardrailLines.join('\n')}`)

  // Tests
  const testLines = skill.tests.map(
    (t, i) => `### Case ${i + 1}: ${t.name}\n\n- Input: \`${t.input}\`\n- Expected: \`${t.expected_output}\``
  )
  sections.push(`## Tests\n\n${testLines.join('\n\n')}`)

  // Supporting files（按目录分组）
  if (filesIndex && filesIndex.length > 0) {
    const grouped: Record<string, string[]> = {}
    for (const f of filesIndex) {
      const dir = f.split('/')[0]
      if (!grouped[dir]) grouped[dir] = []
      grouped[dir].push(f)
    }
    const fileLines: string[] = []
    for (const dir of Object.keys(grouped).sort()) {
      fileLines.push(`### ${dir}`)
      fileLines.push('')
      for (const p of grouped[dir].sort()) {
        fileLines.push(`- [${p}](${p})`)
      }
      fileLines.push('')
    }
    sections.push(`## Supporting files\n\nThe following files are bundled with this skill:\n\n${fileLines.join('\n').trim()}`)
  }

  return `---\n${fm}\n---\n\n# ${skill.title}\n\n${sections.join('\n\n')}\n`
}
