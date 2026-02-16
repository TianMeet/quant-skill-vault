import { describe, it, expect } from 'vitest'
import { renderSkillMarkdown, buildDescription } from '../markdown'
import type { SkillData } from '../types'
import * as yaml from 'js-yaml'

function makeValidSkill(): SkillData {
  return {
    title: 'Test Skill',
    slug: 'test-skill',
    summary: 'A test skill for validation',
    inputs: 'Query string',
    outputs: 'Cleaned result',
    steps: ['Parse input', 'Process data', 'Return output'],
    risks: 'May timeout on large inputs',
    triggers: ['deduplicate news', 'clean data', 'parse logs'],
    guardrails: {
      allowed_tools: ['Read', 'Write'],
      disable_model_invocation: false,
      user_invocable: true,
      stop_conditions: ['Stop when output is empty'],
      escalation: 'ASK_HUMAN',
    },
    tests: [
      { name: 'basic test', input: 'hello', expected_output: 'world' },
    ],
  }
}

describe('buildDescription', () => {
  it('should start with "This skill should be used when"', () => {
    const skill = makeValidSkill()
    const desc = buildDescription(skill)
    expect(desc).toMatch(/^This skill should be used when/)
  })

  it('should include all triggers wrapped in double quotes', () => {
    const skill = makeValidSkill()
    const desc = buildDescription(skill)
    expect(desc).toContain('"deduplicate news"')
    expect(desc).toContain('"clean data"')
    expect(desc).toContain('"parse logs"')
  })

  it('should be <= 1024 characters', () => {
    const skill = makeValidSkill()
    const desc = buildDescription(skill)
    expect(desc.length).toBeLessThanOrEqual(1024)
  })
})

describe('renderSkillMarkdown', () => {
  it('should contain YAML frontmatter', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toMatch(/^---\n/)
    expect(md).toMatch(/\n---\n/)
  })

  it('should have correct frontmatter fields', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
    expect(fmMatch).not.toBeNull()
    const fm = yaml.load(fmMatch![1]) as Record<string, unknown>
    expect(fm.name).toBe('test-skill')
    expect(typeof fm.description).toBe('string')
    expect((fm.description as string).startsWith('This skill should be used when')).toBe(true)
  })

  it('should include allowed-tools in frontmatter when present', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
    const fm = yaml.load(fmMatch![1]) as Record<string, unknown>
    expect(fm['allowed-tools']).toEqual(['Read', 'Write'])
  })

  it('should include disable-model-invocation in frontmatter', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
    const fm = yaml.load(fmMatch![1]) as Record<string, unknown>
    expect(fm['disable-model-invocation']).toBe(false)
  })

  it('should include user-invocable in frontmatter', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    const fmMatch = md.match(/^---\n([\s\S]*?)\n---/)
    const fm = yaml.load(fmMatch![1]) as Record<string, unknown>
    expect(fm['user-invocable']).toBe(true)
  })

  it('should contain Purpose section', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Purpose')
  })

  it('should contain Workflow section with steps', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Workflow')
    expect(md).toContain('Parse input')
    expect(md).toContain('Process data')
    expect(md).toContain('Return output')
  })

  it('should contain Inputs section', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Inputs')
  })

  it('should contain Outputs section', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Outputs')
  })

  it('should contain Pitfalls section', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Pitfalls')
  })

  it('should contain Guardrails section', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Guardrails')
    expect(md).toContain('Stop when output is empty')
  })

  it('should contain Tests section', () => {
    const skill = makeValidSkill()
    const md = renderSkillMarkdown(skill)
    expect(md).toContain('## Tests')
    expect(md).toContain('basic test')
  })
})
