import { describe, it, expect } from 'vitest'
import { lintSkillPackage } from '../lint'
import type { SkillData } from '../types'

const validSkill: SkillData = {
  title: 'Test Skill',
  slug: 'test-skill',
  summary: 'a test skill for unit testing',
  inputs: 'test input',
  outputs: 'test output',
  steps: ['step one', 'step two', 'step three'],
  risks: 'no risks',
  triggers: ['trigger one', 'trigger two', 'trigger three'],
  guardrails: {
    allowed_tools: ['Read'],
    disable_model_invocation: false,
    user_invocable: true,
    stop_conditions: ['stop if error'],
    escalation: 'ASK_HUMAN',
  },
  tests: [{ name: 'basic', input: 'hello', expected_output: 'world' }],
}

describe('lintSkillPackage', () => {
  it('passes when skill is valid and all linked files exist', () => {
    const files = ['references/rules.md']
    const result = lintSkillPackage(validSkill, files)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('includes base lintSkill errors', () => {
    const badSkill = { ...validSkill, slug: 'INVALID SLUG!!' }
    const result = lintSkillPackage(badSkill, [])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === 'slug')).toBe(true)
  })

  it('reports invalid file paths', () => {
    const files = ['other/bad.md']
    const result = lintSkillPackage(validSkill, files)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('invalid path'))).toBe(true)
  })

  it('reports missing linked files from SKILL.md', () => {
    // Skill with a manual reference in inputs that will become a relative link
    const skill = {
      ...validSkill,
      inputs: 'See [config](references/config.yaml) for details',
    }
    // No files provided, but SKILL.md will contain the link
    const result = lintSkillPackage(skill, [])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes('missing file'))).toBe(true)
  })

  it('passes when all relative links in SKILL.md have matching files', () => {
    const skill = {
      ...validSkill,
      inputs: 'See [config](references/config.yaml) for details',
    }
    const files = ['references/config.yaml']
    const result = lintSkillPackage(skill, files)
    expect(result.valid).toBe(true)
  })

  it('reports SKILL.md as forbidden file path', () => {
    const files = ['SKILL.md']
    const result = lintSkillPackage(validSkill, files)
    expect(result.valid).toBe(false)
  })

  it('auto-generated supporting files links are validated', () => {
    // Files exist, so the auto-generated links should all resolve
    const files = ['references/rules.md', 'scripts/run.sql']
    const result = lintSkillPackage(validSkill, files)
    expect(result.valid).toBe(true)
  })
})
