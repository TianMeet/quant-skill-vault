import { describe, it, expect, beforeEach } from 'vitest'
import './prisma-mock'
import { prismaMock, resetMockDb } from './prisma-mock'

// Import route handlers
import { GET as getSkills, POST as createSkill } from '@/app/api/skills/route'
import { GET as getSkill, PUT as updateSkill, DELETE as deleteSkill } from '@/app/api/skills/[id]/route'
import { POST as duplicateSkill } from '@/app/api/skills/[id]/duplicate/route'
import { POST as batchSkills } from '@/app/api/skills/batch/route'
import { GET as getTags } from '@/app/api/tags/route'

function makeRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as unknown as import('next/server').NextRequest
}

const validSkillBody = {
  title: 'Test Skill',
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
  tags: ['NLP', 'Testing'],
}

describe('Skills API', () => {
  beforeEach(() => {
    resetMockDb()
  })

  describe('POST /api/skills', () => {
    it('should create a skill and return 201', async () => {
      const req = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })

      const res = await createSkill(req)
      expect(res.status).toBe(201)

      const data = await res.json()
      expect(data.title).toBe('Test Skill')
      expect(data.slug).toBe('test-skill')
      expect(data.tags).toContain('nlp')
      expect(data.tags).toContain('testing')
    })

    it('should return 400 for invalid body', async () => {
      const req = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      })

      const res = await createSkill(req)
      expect(res.status).toBe(400)
    })

    it('should auto-create tags on skill creation', async () => {
      const req = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })

      await createSkill(req)
      expect(prismaMock.tag.upsert).toHaveBeenCalledTimes(2)
    })

    it('returns 409 when slug conflicts', async () => {
      const firstReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      await createSkill(firstReq)

      const secondReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, tags: ['Another'] }),
      })
      const res = await createSkill(secondReq)
      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/skills', () => {
    it('should return empty list initially', async () => {
      const req = makeRequest('http://localhost:3000/api/skills')
      const res = await getSkills(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual([])
    })

    it('should support query filter', async () => {
      // Create a skill first
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      await createSkill(createReq)

      const req = makeRequest('http://localhost:3000/api/skills?query=Test')
      const res = await getSkills(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.length).toBeGreaterThanOrEqual(1)
    })

    it('should support tags filter', async () => {
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      await createSkill(createReq)

      const req = makeRequest('http://localhost:3000/api/skills?tags=NLP')
      const res = await getSkills(req)
      expect(res.status).toBe(200)
    })

    it('should support paginated response with sorting', async () => {
      await createSkill(
        makeRequest('http://localhost:3000/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validSkillBody, title: 'Z Skill' }),
        })
      )
      await createSkill(
        makeRequest('http://localhost:3000/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validSkillBody, title: 'A Skill' }),
        })
      )

      const req = makeRequest('http://localhost:3000/api/skills?page=1&limit=1&sort=title_asc')
      const res = await getSkills(req)
      expect(res.status).toBe(200)

      const data = await res.json()
      expect(Array.isArray(data.items)).toBe(true)
      expect(data.items.length).toBe(1)
      expect(data.items[0].title).toBe('A Skill')
      expect(data.total).toBe(2)
      expect(data.totalPages).toBe(2)
      expect(data.sort).toBe('title_asc')
    })
  })

  describe('GET /api/skills/:id', () => {
    it('should return a skill by id', async () => {
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      const createRes = await createSkill(createReq)
      const created = await createRes.json()

      const req = makeRequest(`http://localhost:3000/api/skills/${created.id}`)
      const res = await getSkill(req, { params: Promise.resolve({ id: String(created.id) }) })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.title).toBe('Test Skill')
    })

    it('should return 404 for non-existent skill', async () => {
      const req = makeRequest('http://localhost:3000/api/skills/999')
      const res = await getSkill(req, { params: Promise.resolve({ id: '999' }) })
      expect(res.status).toBe(404)
    })
  })

  describe('PUT /api/skills/:id', () => {
    it('should update a skill', async () => {
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      const createRes = await createSkill(createReq)
      const created = await createRes.json()

      const updateReq = makeRequest(`http://localhost:3000/api/skills/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Skill' }),
      })
      const res = await updateSkill(updateReq, { params: Promise.resolve({ id: String(created.id) }) })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.title).toBe('Updated Skill')
    })

    it('returns 400 when title cannot generate a valid slug', async () => {
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      const createRes = await createSkill(createReq)
      const created = await createRes.json()

      const updateReq = makeRequest(`http://localhost:3000/api/skills/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '量化技能库' }),
      })
      const res = await updateSkill(updateReq, { params: Promise.resolve({ id: String(created.id) }) })
      expect(res.status).toBe(400)
    })

    it('returns 409 when updated title conflicts on slug', async () => {
      const firstReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      const firstRes = await createSkill(firstReq)
      const first = await firstRes.json()

      const secondReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'Another Skill', tags: ['Extra'] }),
      })
      const secondRes = await createSkill(secondReq)
      const second = await secondRes.json()

      const updateReq = makeRequest(`http://localhost:3000/api/skills/${second.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: first.title }),
      })
      const res = await updateSkill(updateReq, { params: Promise.resolve({ id: String(second.id) }) })
      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /api/skills/:id', () => {
    it('should delete a skill', async () => {
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      const createRes = await createSkill(createReq)
      const created = await createRes.json()

      const deleteReq = makeRequest(`http://localhost:3000/api/skills/${created.id}`, { method: 'DELETE' })
      const res = await deleteSkill(deleteReq, { params: Promise.resolve({ id: String(created.id) }) })
      expect(res.status).toBe(200)
    })

    it('should return 404 for non-existent skill', async () => {
      const req = makeRequest('http://localhost:3000/api/skills/999', { method: 'DELETE' })
      const res = await deleteSkill(req, { params: Promise.resolve({ id: '999' }) })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/skills/:id/duplicate', () => {
    it('should duplicate skill with a unique slug', async () => {
      const createReq = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
      const createdRes = await createSkill(createReq)
      const created = await createdRes.json()

      const duplicateReq = makeRequest(`http://localhost:3000/api/skills/${created.id}/duplicate`, {
        method: 'POST',
      })
      const res = await duplicateSkill(duplicateReq, { params: Promise.resolve({ id: String(created.id) }) })
      expect(res.status).toBe(201)
      const duplicated = await res.json()

      expect(duplicated.id).not.toBe(created.id)
      expect(duplicated.title).toContain('副本')
      expect(duplicated.slug).not.toBe(created.slug)
      expect(duplicated.tags).toContain('nlp')
      expect(duplicated.tags).toContain('testing')
    })
  })

  describe('GET /api/tags', () => {
    it('should return tags list', async () => {
      const req = makeRequest('http://localhost:3000/api/tags')
      const res = await getTags(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.total).toBe('number')
    })
  })

  describe('POST /api/skills/batch', () => {
    it('should bulk add tags to selected skills', async () => {
      const createReq1 = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'Batch Skill A', tags: ['alpha'] }),
      })
      const createReq2 = makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'Batch Skill B', tags: ['beta'] }),
      })
      const res1 = await createSkill(createReq1)
      const res2 = await createSkill(createReq2)
      const skill1 = await res1.json()
      const skill2 = await res2.json()

      const batchReq = makeRequest('http://localhost:3000/api/skills/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk-add-tags',
          skillIds: [skill1.id, skill2.id],
          tags: ['shared'],
        }),
      })

      const batchRes = await batchSkills(batchReq)
      expect(batchRes.status).toBe(200)

      const get1 = await getSkill(makeRequest(`http://localhost:3000/api/skills/${skill1.id}`), {
        params: Promise.resolve({ id: String(skill1.id) }),
      })
      const get2 = await getSkill(makeRequest(`http://localhost:3000/api/skills/${skill2.id}`), {
        params: Promise.resolve({ id: String(skill2.id) }),
      })
      const data1 = await get1.json()
      const data2 = await get2.json()
      expect(data1.tags).toContain('shared')
      expect(data2.tags).toContain('shared')
    })

    it('should bulk delete selected skills', async () => {
      const res1 = await createSkill(
        makeRequest('http://localhost:3000/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validSkillBody, title: 'Delete A' }),
        })
      )
      const res2 = await createSkill(
        makeRequest('http://localhost:3000/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...validSkillBody, title: 'Delete B' }),
        })
      )
      const skill1 = await res1.json()
      const skill2 = await res2.json()

      const batchReq = makeRequest('http://localhost:3000/api/skills/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk-delete',
          skillIds: [skill1.id, skill2.id],
        }),
      })
      const batchRes = await batchSkills(batchReq)
      expect(batchRes.status).toBe(200)
      const batchData = await batchRes.json()
      expect(batchData.affected).toBe(2)

      const listRes = await getSkills(makeRequest('http://localhost:3000/api/skills'))
      const listData = await listRes.json()
      expect(listData.length).toBe(0)
    })
  })
})
