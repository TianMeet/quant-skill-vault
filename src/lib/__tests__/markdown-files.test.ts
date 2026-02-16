import { describe, it, expect } from 'vitest'
import { extractRelativeLinks } from '../markdown'
import { renderSkillMarkdown } from '../markdown'
import type { SkillData } from '../types'

const baseSkill: SkillData = {
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

describe('extractRelativeLinks', () => {
  it('extracts relative markdown links', () => {
    const md = 'See [rules](references/rules.md) and [script](scripts/run.sql)'
    expect(extractRelativeLinks(md)).toEqual(['references/rules.md', 'scripts/run.sql'])
  })

  it('ignores http links', () => {
    const md = 'See [docs](https://example.com) and [rules](references/rules.md)'
    expect(extractRelativeLinks(md)).toEqual(['references/rules.md'])
  })

  it('ignores http:// links', () => {
    const md = 'See [docs](http://example.com)'
    expect(extractRelativeLinks(md)).toEqual([])
  })

  it('returns empty array for no links', () => {
    expect(extractRelativeLinks('no links here')).toEqual([])
  })

  it('handles multiple links on same line', () => {
    const md = '[a](references/a.md) and [b](examples/b.json)'
    expect(extractRelativeLinks(md)).toEqual(['references/a.md', 'examples/b.json'])
  })

  it('deduplicates links', () => {
    const md = '[a](references/a.md) and [b](references/a.md)'
    expect(extractRelativeLinks(md)).toEqual(['references/a.md'])
  })
})

describe('renderSkillMarkdown with filesIndex', () => {
  it('includes Supporting files section when files provided', () => {
    const files = ['references/rules.md', 'scripts/dedup.sql']
    const md = renderSkillMarkdown(baseSkill, files)
    expect(md).toContain('## Supporting files')
    expect(md).toContain('- [references/rules.md](references/rules.md)')
    expect(md).toContain('- [scripts/dedup.sql](scripts/dedup.sql)')
  })

  it('groups files by directory', () => {
    const files = ['references/a.md', 'references/b.md', 'scripts/run.sql']
    const md = renderSkillMarkdown(baseSkill, files)
    expect(md).toContain('### references')
    expect(md).toContain('### scripts')
  })

  it('omits Supporting files section when no files', () => {
    const md = renderSkillMarkdown(baseSkill, [])
    expect(md).not.toContain('## Supporting files')
  })

  it('still works without filesIndex argument (backward compat)', () => {
    const md = renderSkillMarkdown(baseSkill)
    expect(md).toContain('## Purpose')
    expect(md).not.toContain('## Supporting files')
  })
})
