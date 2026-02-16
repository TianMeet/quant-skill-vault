import { describe, it, expect } from 'vitest'
import { lintSkill } from '../lint'
import type { SkillData } from '../types'

function makeValidSkill(overrides: Partial<SkillData> = {}): SkillData {
  return {
    title: 'Test Skill',
    summary: 'A test skill for validation',
    inputs: '## Input\nSome input',
    outputs: '## Output\nSome output',
    steps: ['Step 1', 'Step 2', 'Step 3'],
    risks: 'Some risks',
    triggers: ['deduplicate news', 'clean data', 'parse logs'],
    guardrails: {
      allowed_tools: [],
      disable_model_invocation: false,
      user_invocable: true,
      stop_conditions: ['Stop when output is empty'],
      escalation: 'ASK_HUMAN',
    },
    tests: [
      { name: 'basic test', input: 'hello', expected_output: 'world' },
    ],
    slug: 'test-skill',
    ...overrides,
  }
}

describe('lintSkill', () => {
  it('should pass for a valid skill', () => {
    const result = lintSkill(makeValidSkill())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  // name/slug validation
  describe('name (slug) validation', () => {
    it('should fail if slug is missing', () => {
      const result = lintSkill(makeValidSkill({ slug: '' }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'slug')).toBe(true)
    })

    it('should fail if slug contains uppercase', () => {
      const result = lintSkill(makeValidSkill({ slug: 'Test-Skill' }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'slug')).toBe(true)
    })

    it('should fail if slug contains special characters', () => {
      const result = lintSkill(makeValidSkill({ slug: 'test_skill!' }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'slug')).toBe(true)
    })

    it('should fail if slug exceeds 64 characters', () => {
      const result = lintSkill(makeValidSkill({ slug: 'a'.repeat(65) }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'slug')).toBe(true)
    })
  })

  // description validation (built from summary + triggers)
  describe('description validation', () => {
    it('should fail if triggers < 3', () => {
      const result = lintSkill(makeValidSkill({ triggers: ['one', 'two'] }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'triggers')).toBe(true)
    })

    it('should pass with exactly 3 triggers', () => {
      const result = lintSkill(makeValidSkill({ triggers: ['a', 'b', 'c'] }))
      expect(result.valid).toBe(true)
    })
  })

  // steps validation
  describe('steps validation', () => {
    it('should fail if steps < 3', () => {
      const result = lintSkill(makeValidSkill({ steps: ['Step 1', 'Step 2'] }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'steps')).toBe(true)
    })

    it('should fail if steps > 7', () => {
      const steps = Array.from({ length: 8 }, (_, i) => `Step ${i + 1}`)
      const result = lintSkill(makeValidSkill({ steps }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'steps')).toBe(true)
    })

    it('should pass with 3 steps', () => {
      const result = lintSkill(makeValidSkill({ steps: ['a', 'b', 'c'] }))
      expect(result.valid).toBe(true)
    })

    it('should pass with 7 steps', () => {
      const steps = Array.from({ length: 7 }, (_, i) => `Step ${i + 1}`)
      const result = lintSkill(makeValidSkill({ steps }))
      expect(result.valid).toBe(true)
    })
  })

  // tests validation
  describe('tests validation', () => {
    it('should fail if tests is empty', () => {
      const result = lintSkill(makeValidSkill({ tests: [] }))
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'tests')).toBe(true)
    })
  })

  // guardrails validation
  describe('guardrails validation', () => {
    it('should fail if stop_conditions is empty', () => {
      const result = lintSkill(
        makeValidSkill({
          guardrails: {
            allowed_tools: [],
            disable_model_invocation: false,
            user_invocable: true,
            stop_conditions: [],
            escalation: 'ASK_HUMAN',
          },
        })
      )
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'guardrails.stop_conditions')).toBe(true)
    })

    it('should fail if escalation is invalid', () => {
      const result = lintSkill(
        makeValidSkill({
          guardrails: {
            allowed_tools: [],
            disable_model_invocation: false,
            user_invocable: true,
            stop_conditions: ['stop'],
            escalation: 'INVALID' as 'REVIEW',
          },
        })
      )
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'guardrails.escalation')).toBe(true)
    })
  })

  // description length
  describe('description length', () => {
    it('should fail if generated description exceeds 1024 characters', () => {
      const longTrigger = 'a'.repeat(500)
      const result = lintSkill(
        makeValidSkill({
          triggers: [longTrigger, longTrigger, longTrigger],
        })
      )
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'description')).toBe(true)
    })
  })
})
