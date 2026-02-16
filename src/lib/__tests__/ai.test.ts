import { describe, it, expect } from 'vitest'
import {
  parseClaudeHeadlessJson,
  validateChangeSet,
  buildClaudeArgs,
} from '@/lib/ai/claudeRunner'
import type { ChangeSet } from '@/lib/ai/types'

/* ------------------------------------------------------------------ */
/*  parseClaudeHeadlessJson                                           */
/* ------------------------------------------------------------------ */
describe('parseClaudeHeadlessJson', () => {
  it('should extract structured_output from valid headless JSON', () => {
    const raw = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'some text',
      structured_output: {
        skillPatch: { summary: 'updated summary' },
        fileOps: [],
      },
    })
    const result = parseClaudeHeadlessJson(raw)
    expect(result.ok).toBe(true)
    expect(result.structuredOutput).toEqual({
      skillPatch: { summary: 'updated summary' },
      fileOps: [],
    })
  })

  it('should return error when structured_output is missing', () => {
    const raw = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'some text',
    })
    const result = parseClaudeHeadlessJson(raw)
    expect(result.ok).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
    expect(result.errors![0]).toContain('structured_output')
  })

  it('should return error when input is not valid JSON', () => {
    const result = parseClaudeHeadlessJson('not json at all')
    expect(result.ok).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('should return error when structured_output is not an object', () => {
    const raw = JSON.stringify({
      type: 'result',
      structured_output: 'just a string',
    })
    const result = parseClaudeHeadlessJson(raw)
    expect(result.ok).toBe(false)
    expect(result.errors![0]).toContain('structured_output')
  })

  it('should extract usage info when present', () => {
    const raw = JSON.stringify({
      type: 'result',
      structured_output: {
        skillPatch: {},
        fileOps: [],
      },
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    const result = parseClaudeHeadlessJson(raw)
    expect(result.ok).toBe(true)
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 })
  })
})

/* ------------------------------------------------------------------ */
/*  validateChangeSet                                                 */
/* ------------------------------------------------------------------ */
describe('validateChangeSet', () => {
  const validChangeSet: ChangeSet = {
    skillPatch: { summary: 'updated' },
    fileOps: [
      { op: 'upsert', path: 'references/rules.md', content_text: '# Rules' },
    ],
  }

  it('should pass for a valid changeSet', () => {
    const result = validateChangeSet(validChangeSet)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject path with ..', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'references/../etc/passwd', content_text: 'x' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('..'))).toBe(true)
  })

  it('should reject absolute path', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: '/etc/passwd', content_text: 'x' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('/'))).toBe(true)
  })

  it('should reject path not in allowed directories', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'src/hack.ts', content_text: 'x' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
  })

  it('should reject SKILL.md path', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'SKILL.md', content_text: 'x' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('SKILL.md'))).toBe(true)
  })

  it('should reject backslash in path', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'references\\rules.md', content_text: 'x' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
  })

  it('should reject empty filename', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'references/', content_text: 'x' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
  })

  it('should reject content_text exceeding 200KB', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'references/big.md', content_text: 'x'.repeat(201 * 1024) }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('200KB'))).toBe(true)
  })

  it('should reject content_base64 exceeding 2MB', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'assets/big.bin', content_base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('2MB'))).toBe(true)
  })

  it('should reject upsert without content', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'references/empty.md' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('requires content_text or content_base64'))).toBe(true)
  })

  it('should reject upsert with both content_text and content_base64', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'upsert', path: 'references/conflict.md', content_text: 'x', content_base64: Buffer.from('x').toString('base64') }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('only one of content_text or content_base64'))).toBe(true)
  })

  it('should allow delete op without content', () => {
    const cs: ChangeSet = {
      skillPatch: {},
      fileOps: [{ op: 'delete', path: 'references/old.md' }],
    }
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(true)
  })

  it('should reject missing skillPatch', () => {
    const cs = { fileOps: [] } as unknown as ChangeSet
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
  })

  it('should reject missing fileOps', () => {
    const cs = { skillPatch: {} } as unknown as ChangeSet
    const result = validateChangeSet(cs)
    expect(result.valid).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  buildClaudeArgs                                                   */
/* ------------------------------------------------------------------ */
describe('buildClaudeArgs', () => {
  it('should include required flags', () => {
    const args = buildClaudeArgs({
      prompt: 'test prompt',
      jsonSchema: '{}',
    })

    expect(args).toContain('-p')
    expect(args).toContain('test prompt')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args).toContain('--json-schema')
    expect(args).toContain('{}')
    expect(args).toContain('--no-session-persistence')
    expect(args).toContain('--max-turns')
    expect(args).toContain('--max-budget-usd')
  })

  it('should never include dangerously-skip-permissions flags', () => {
    const args = buildClaudeArgs({
      prompt: 'test',
      jsonSchema: '{}',
      maxTurns: 5,
      maxBudgetUsd: 2,
    })

    const joined = args.join(' ')
    expect(joined).not.toContain('dangerously-skip-permissions')
    expect(joined).not.toContain('allow-dangerously')
  })

  it('should include --tools "" to disable all tools', () => {
    const args = buildClaudeArgs({ prompt: 'test', jsonSchema: '{}' })
    const toolsIdx = args.indexOf('--tools')
    expect(toolsIdx).toBeGreaterThan(-1)
    expect(args[toolsIdx + 1]).toBe('')
  })

  it('should use custom maxTurns and maxBudgetUsd', () => {
    const args = buildClaudeArgs({
      prompt: 'test',
      jsonSchema: '{}',
      maxTurns: 5,
      maxBudgetUsd: 2.5,
    })

    const turnsIdx = args.indexOf('--max-turns')
    expect(args[turnsIdx + 1]).toBe('5')

    const budgetIdx = args.indexOf('--max-budget-usd')
    expect(args[budgetIdx + 1]).toBe('2.5')
  })

  it('should use default maxTurns=3 and maxBudgetUsd=1', () => {
    const args = buildClaudeArgs({ prompt: 'test', jsonSchema: '{}' })

    const turnsIdx = args.indexOf('--max-turns')
    expect(args[turnsIdx + 1]).toBe('3')

    const budgetIdx = args.indexOf('--max-budget-usd')
    expect(args[budgetIdx + 1]).toBe('1')
  })

  it('should include model flag when specified', () => {
    const args = buildClaudeArgs({
      prompt: 'test',
      jsonSchema: '{}',
      model: 'opus',
    })
    expect(args).toContain('--model')
    expect(args).toContain('opus')
  })

  it('should include system prompt file flag', () => {
    const args = buildClaudeArgs({ prompt: 'test', jsonSchema: '{}' })
    const idx = args.indexOf('--system-prompt')
    expect(idx).toBeGreaterThan(-1)
    // system prompt content should be a non-empty string
    expect(args[idx + 1].length).toBeGreaterThan(0)
  })
})
