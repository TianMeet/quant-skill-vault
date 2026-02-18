import { beforeEach, describe, expect, it } from 'vitest'
import './prisma-mock'
import { resetMockDb } from './prisma-mock'
import { GET as listDrafts } from '@/app/api/skill-drafts/route'
import { GET as getDraft, PUT as putDraft, DELETE as deleteDraft } from '@/app/api/skill-drafts/[key]/route'
import { POST as createSkill } from '@/app/api/skills/route'

function makeRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as unknown as import('next/server').NextRequest
}

const validSkillBody = {
  title: 'Draft Owner Skill',
  summary: 'Skill for draft tests',
  inputs: 'input',
  outputs: 'output',
  steps: ['step 1', 'step 2', 'step 3'],
  risks: '',
  triggers: ['trigger 1', 'trigger 2', 'trigger 3'],
  guardrails: {
    allowed_tools: [],
    disable_model_invocation: false,
    user_invocable: true,
    stop_conditions: ['stop'],
    escalation: 'ASK_HUMAN',
  },
  tests: [{ name: 'case', input: 'a', expected_output: 'b' }],
  tags: [],
}

describe('Skill Drafts API', () => {
  beforeEach(() => {
    resetMockDb()
  })

  it('PUT /api/skill-drafts/:key creates a new draft and GET returns it', async () => {
    const putRes = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new',
          payload: { title: 'My Draft', activeTab: 'author' },
        }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(putRes.status).toBe(200)
    const putData = await putRes.json()
    expect(putData.version).toBe(1)
    expect(putData.mode).toBe('new')

    const getRes = await getDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1'),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(getRes.status).toBe(200)
    const getData = await getRes.json()
    expect(getData.payload.title).toBe('My Draft')
    expect(getData.version).toBe(1)
  })

  it('PUT /api/skill-drafts/:key increments version and enforces expectedVersion', async () => {
    await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new',
          payload: { title: 'v1' },
        }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )

    const v2Res = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new',
          expectedVersion: 1,
          payload: { title: 'v2' },
        }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(v2Res.status).toBe(200)
    const v2 = await v2Res.json()
    expect(v2.version).toBe(2)

    const conflictRes = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new',
          expectedVersion: 1,
          payload: { title: 'stale update' },
        }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(conflictRes.status).toBe(409)
    const conflict = await conflictRes.json()
    expect(conflict.currentVersion).toBe(2)
  })

  it('PUT /api/skill-drafts/:key validates request body', async () => {
    const badKey = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/invalid key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new',
          payload: { title: 'x' },
        }),
      }),
      { params: Promise.resolve({ key: 'invalid key' }) }
    )
    expect(badKey.status).toBe(400)

    const badMode = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'unknown',
          payload: { title: 'x' },
        }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(badMode.status).toBe(400)

    const badPayload = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'new',
          payload: 'not-object',
        }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(badPayload.status).toBe(400)
  })

  it('PUT /api/skill-drafts/:key validates edit mode skillId existence', async () => {
    const notFoundSkill = await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/edit:999:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'edit',
          skillId: 999,
          payload: { title: 'x' },
        }),
      }),
      { params: Promise.resolve({ key: 'edit:999:client-1' }) }
    )
    expect(notFoundSkill.status).toBe(404)

    const createdRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
    )
    const created = await createdRes.json()

    const okRes = await putDraft(
      makeRequest(`http://localhost:3000/api/skill-drafts/edit:${created.id}:client-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'edit',
          skillId: created.id,
          payload: { title: 'edited draft' },
        }),
      }),
      { params: Promise.resolve({ key: `edit:${created.id}:client-1` }) }
    )
    expect(okRes.status).toBe(200)
  })

  it('GET /api/skill-drafts returns filtered list and DELETE removes draft', async () => {
    await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'new', payload: { title: 'new' } }),
      }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    await putDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/edit:12:client-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'edit', payload: { title: 'edit' } }),
      }),
      { params: Promise.resolve({ key: 'edit:12:client-1' }) }
    )

    const listAll = await listDrafts(makeRequest('http://localhost:3000/api/skill-drafts'))
    expect(listAll.status).toBe(200)
    const allData = await listAll.json()
    expect(allData.total).toBe(2)

    const listNew = await listDrafts(makeRequest('http://localhost:3000/api/skill-drafts?mode=new'))
    expect(listNew.status).toBe(200)
    const newData = await listNew.json()
    expect(newData.total).toBe(1)
    expect(newData.items[0].mode).toBe('new')

    const delRes = await deleteDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1', { method: 'DELETE' }),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(delRes.status).toBe(200)

    const afterDelete = await getDraft(
      makeRequest('http://localhost:3000/api/skill-drafts/new:client-1'),
      { params: Promise.resolve({ key: 'new:client-1' }) }
    )
    expect(afterDelete.status).toBe(404)
  })
})
