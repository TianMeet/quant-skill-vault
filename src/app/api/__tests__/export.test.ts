import { describe, it, expect, beforeEach } from 'vitest'
import './prisma-mock'
import { resetMockDb, seedMockSkill } from './prisma-mock'

import { GET as exportMd } from '@/app/api/skills/[id]/export.md/route'
import { GET as exportJson } from '@/app/api/skills/[id]/export.json/route'
import { GET as exportZip } from '@/app/api/skills/[id]/export.zip/route'

function makeRequest(url: string) {
  return new Request(url) as unknown as import('next/server').NextRequest
}

const validSkillData = {
  title: 'Test Skill',
  slug: 'test-skill',
  summary: 'A test skill for validation',
  inputs: 'Query string',
  outputs: 'Cleaned result',
  steps: ['Parse input', 'Process data', 'Return output'],
  risks: 'May timeout',
  triggers: ['deduplicate news', 'clean data', 'parse logs'],
  guardrails: {
    allowed_tools: ['Read'],
    disable_model_invocation: false,
    user_invocable: true,
    stop_conditions: ['Stop when empty'],
    escalation: 'ASK_HUMAN',
  },
  tests: [{ name: 'basic', input: 'hello', expected_output: 'world' }],
  _tags: ['NLP'],
}

const invalidSkillData = {
  title: 'Bad Skill',
  slug: 'INVALID_SLUG!',
  summary: 'Bad',
  inputs: '',
  outputs: '',
  steps: ['one'],
  risks: '',
  triggers: ['only one'],
  guardrails: {
    allowed_tools: [],
    disable_model_invocation: false,
    user_invocable: true,
    stop_conditions: [],
    escalation: 'INVALID',
  },
  tests: [],
  _tags: [],
}

describe('Export API', () => {
  beforeEach(() => {
    resetMockDb()
  })

  describe('GET /api/skills/:id/export.md', () => {
    it('should return markdown with frontmatter for valid skill', async () => {
      const skill = seedMockSkill(validSkillData)
      const req = makeRequest(`http://localhost:3000/api/skills/${skill.id}/export.md`)
      const res = await exportMd(req, { params: Promise.resolve({ id: String(skill.id) }) })

      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).toMatch(/^---\n/)
      expect(text).toContain('name: test-skill')
      expect(text).toContain('This skill should be used when')
    })

    it('should return 400 when lint fails', async () => {
      const skill = seedMockSkill(invalidSkillData)
      const req = makeRequest(`http://localhost:3000/api/skills/${skill.id}/export.md`)
      const res = await exportMd(req, { params: Promise.resolve({ id: String(skill.id) }) })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.errors).toBeDefined()
      expect(data.errors.length).toBeGreaterThan(0)
    })

    it('should return 404 for non-existent skill', async () => {
      const req = makeRequest('http://localhost:3000/api/skills/999/export.md')
      const res = await exportMd(req, { params: Promise.resolve({ id: '999' }) })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/skills/:id/export.json', () => {
    it('should return structured JSON for valid skill', async () => {
      const skill = seedMockSkill(validSkillData)
      const req = makeRequest(`http://localhost:3000/api/skills/${skill.id}/export.json`)
      const res = await exportJson(req, { params: Promise.resolve({ id: String(skill.id) }) })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.name).toBe('test-skill')
      expect(data.description).toMatch(/^This skill should be used when/)
      expect(data.triggers).toEqual(['deduplicate news', 'clean data', 'parse logs'])
    })

    it('should return 400 when lint fails', async () => {
      const skill = seedMockSkill(invalidSkillData)
      const req = makeRequest(`http://localhost:3000/api/skills/${skill.id}/export.json`)
      const res = await exportJson(req, { params: Promise.resolve({ id: String(skill.id) }) })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.errors.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/skills/:id/export.zip', () => {
    it('should return zip with correct content-type for valid skill', async () => {
      const skill = seedMockSkill(validSkillData)
      const req = makeRequest(`http://localhost:3000/api/skills/${skill.id}/export.zip`)
      const res = await exportZip(req, { params: Promise.resolve({ id: String(skill.id) }) })

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/zip')
      expect(res.headers.get('Content-Disposition')).toContain('test-skill.zip')
    })

    it('should return 400 with errors when lint fails', async () => {
      const skill = seedMockSkill(invalidSkillData)
      const req = makeRequest(`http://localhost:3000/api/skills/${skill.id}/export.zip`)
      const res = await exportZip(req, { params: Promise.resolve({ id: String(skill.id) }) })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Lint failed')
      expect(data.errors).toBeDefined()
      expect(Array.isArray(data.errors)).toBe(true)
    })

    it('should return 404 for non-existent skill', async () => {
      const req = makeRequest('http://localhost:3000/api/skills/999/export.zip')
      const res = await exportZip(req, { params: Promise.resolve({ id: '999' }) })
      expect(res.status).toBe(404)
    })
  })
})
