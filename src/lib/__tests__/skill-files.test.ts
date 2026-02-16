import { describe, it, expect } from 'vitest'
import { validateSkillFilePath } from '../skill-files'

describe('validateSkillFilePath', () => {
  // 合法路径
  it('accepts references/rules.md', () => {
    expect(validateSkillFilePath('references/rules.md')).toEqual({ valid: true, errors: [] })
  })

  it('accepts examples/case1_input.json', () => {
    expect(validateSkillFilePath('examples/case1_input.json')).toEqual({ valid: true, errors: [] })
  })

  it('accepts scripts/cluster.sql', () => {
    expect(validateSkillFilePath('scripts/cluster.sql')).toEqual({ valid: true, errors: [] })
  })

  it('accepts assets/diagram.svg', () => {
    expect(validateSkillFilePath('assets/diagram.svg')).toEqual({ valid: true, errors: [] })
  })

  it('accepts templates/daily_brief.md', () => {
    expect(validateSkillFilePath('templates/daily_brief.md')).toEqual({ valid: true, errors: [] })
  })

  it('accepts nested paths like references/sub/deep.md', () => {
    expect(validateSkillFilePath('references/sub/deep.md')).toEqual({ valid: true, errors: [] })
  })

  // 非法路径
  it('rejects paths starting with /', () => {
    const r = validateSkillFilePath('/references/rules.md')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('must not start with /')
  })

  it('rejects paths containing ..', () => {
    const r = validateSkillFilePath('references/../etc/passwd')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('..')
  })

  it('rejects paths containing backslash', () => {
    const r = validateSkillFilePath('references\\rules.md')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('backslash')
  })

  it('rejects paths not starting with allowed directory', () => {
    const r = validateSkillFilePath('other/file.md')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('must start with')
  })

  it('rejects empty filename', () => {
    const r = validateSkillFilePath('references/')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('filename')
  })

  it('rejects SKILL.md path', () => {
    const r = validateSkillFilePath('SKILL.md')
    expect(r.valid).toBe(false)
  })

  it('rejects slug/SKILL.md path', () => {
    const r = validateSkillFilePath('my-skill/SKILL.md')
    expect(r.valid).toBe(false)
  })

  it('rejects empty string', () => {
    const r = validateSkillFilePath('')
    expect(r.valid).toBe(false)
  })
})
