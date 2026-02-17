import { beforeEach, describe, expect, it } from 'vitest'
import './prisma-mock'
import { getMockSkills, getMockTags, resetMockDb } from './prisma-mock'
import { POST as createSkill } from '@/app/api/skills/route'
import { GET as getTags, POST as createTag } from '@/app/api/tags/route'
import { PATCH as patchTag, DELETE as deleteTag } from '@/app/api/tags/[id]/route'
import { GET as getLinkedSkills } from '@/app/api/tags/[id]/skills/route'
import { POST as mergeTags } from '@/app/api/tags/merge/route'

function makeRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as unknown as import('next/server').NextRequest
}

const validSkillBody = {
  title: 'Tag Test Skill',
  summary: 'Skill for tag api tests',
  inputs: 'input',
  outputs: 'output',
  steps: ['s1', 's2', 's3'],
  risks: '',
  triggers: ['t1', 't2', 't3'],
  guardrails: {
    allowed_tools: [],
    disable_model_invocation: false,
    user_invocable: true,
    stop_conditions: ['stop'],
    escalation: 'ASK_HUMAN',
  },
  tests: [{ name: 'ok', input: 'a', expected_output: 'b' }],
}

describe('Tags API', () => {
  beforeEach(() => {
    resetMockDb()
  })

  it('POST /api/tags should normalize name to lower-case', async () => {
    const req = makeRequest('http://localhost:3000/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '  Quant Alpha  ' }),
    })
    const res = await createTag(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.tag.name).toBe('quant alpha')
  })

  it('PATCH /api/tags/:id returns 409 when target name exists', async () => {
    await createTag(
      makeRequest('http://localhost:3000/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'alpha' }),
      })
    )
    await createTag(
      makeRequest('http://localhost:3000/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'beta' }),
      })
    )

    const alpha = Array.from(getMockTags().values()).find((tag) => tag.name === 'alpha')
    expect(alpha).toBeTruthy()

    const res = await patchTag(
      makeRequest(`http://localhost:3000/api/tags/${alpha!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'beta' }),
      }),
      { params: Promise.resolve({ id: String(alpha!.id) }) }
    )

    expect(res.status).toBe(409)
  })

  it('GET /api/tags/:id/skills returns linked skills', async () => {
    const createRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'S1', tags: ['alpha'] }),
      })
    )
    expect(createRes.status).toBe(201)

    const alpha = Array.from(getMockTags().values()).find((tag) => tag.name === 'alpha')
    expect(alpha).toBeTruthy()

    const res = await getLinkedSkills(
      makeRequest(`http://localhost:3000/api/tags/${alpha!.id}/skills`),
      { params: Promise.resolve({ id: String(alpha!.id) }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tag.name).toBe('alpha')
    expect(Array.isArray(data.skills)).toBe(true)
    expect(data.skills.length).toBe(1)
  })

  it('DELETE /api/tags/:id should detach tag from skills', async () => {
    const createRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'Delete Case', tags: ['alpha', 'beta'] }),
      })
    )
    expect(createRes.status).toBe(201)

    const alpha = Array.from(getMockTags().values()).find((tag) => tag.name === 'alpha')
    expect(alpha).toBeTruthy()

    const res = await deleteTag(
      makeRequest(`http://localhost:3000/api/tags/${alpha!.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(alpha!.id) }) }
    )
    expect(res.status).toBe(200)

    const skill = Array.from(getMockSkills().values())[0]
    expect(skill._tags).toContain('beta')
    expect(skill._tags).not.toContain('alpha')
  })

  it('POST /api/tags/merge should merge source into target', async () => {
    await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'M1', tags: ['source'] }),
      })
    )
    await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validSkillBody, title: 'M2', tags: ['source', 'target'] }),
      })
    )

    const source = Array.from(getMockTags().values()).find((tag) => tag.name === 'source')
    const target = Array.from(getMockTags().values()).find((tag) => tag.name === 'target')
    expect(source).toBeTruthy()
    expect(target).toBeTruthy()

    const res = await mergeTags(
      makeRequest('http://localhost:3000/api/tags/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceTagId: source!.id, targetTagId: target!.id }),
      })
    )
    expect(res.status).toBe(200)

    const sourceAfter = Array.from(getMockTags().values()).find((tag) => tag.name === 'source')
    expect(sourceAfter).toBeUndefined()

    const skills = Array.from(getMockSkills().values())
    for (const skill of skills) {
      expect(skill._tags).toContain('target')
      expect(skill._tags).not.toContain('source')
    }
  })

  it('GET /api/tags returns object with items and total', async () => {
    const res = await getTags(makeRequest('http://localhost:3000/api/tags'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
    expect(typeof data.total).toBe('number')
  })
})
