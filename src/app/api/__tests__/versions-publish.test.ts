import { beforeEach, describe, expect, it } from 'vitest'
import './prisma-mock'
import { resetMockDb } from './prisma-mock'
import { POST as createSkill } from '@/app/api/skills/route'
import { PUT as updateSkill, GET as getSkill } from '@/app/api/skills/[id]/route'
import { GET as listVersions } from '@/app/api/skills/[id]/versions/route'
import { GET as getVersion } from '@/app/api/skills/[id]/versions/[versionId]/route'
import { POST as rollbackSkill } from '@/app/api/skills/[id]/rollback/route'
import { POST as publishSkill } from '@/app/api/skills/[id]/publish/route'
import { GET as listPublications } from '@/app/api/skills/[id]/publications/route'

function makeRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as unknown as import('next/server').NextRequest
}

const validSkillBody = {
  title: 'Versioned Skill',
  summary: 'Skill for version tests',
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
  tags: ['alpha'],
}

describe('Skill versions and publication API', () => {
  beforeEach(() => {
    resetMockDb()
  })

  it('creates initial version on skill creation and adds new version on update', async () => {
    const createRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
    )
    expect(createRes.status).toBe(201)
    const created = await createRes.json()

    const firstListRes = await listVersions(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/versions`),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(firstListRes.status).toBe(200)
    const firstList = await firstListRes.json()
    expect(firstList.total).toBe(1)
    expect(firstList.items[0].version).toBe(1)
    const firstVersionId = firstList.items[0].id as number

    const updateRes = await updateSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Versioned Skill Updated' }),
      }),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(updateRes.status).toBe(200)

    const secondListRes = await listVersions(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/versions`),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(secondListRes.status).toBe(200)
    const secondList = await secondListRes.json()
    expect(secondList.total).toBe(2)
    expect(secondList.items[0].version).toBe(2)

    const versionDetailRes = await getVersion(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/versions/${firstVersionId}`),
      { params: Promise.resolve({ id: String(created.id), versionId: String(firstVersionId) }) }
    )
    expect(versionDetailRes.status).toBe(200)
    const versionDetail = await versionDetailRes.json()
    expect(versionDetail.snapshot.title).toBe('Versioned Skill')
  })

  it('rolls back to target version and creates a new version after rollback', async () => {
    const createRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
    )
    const created = await createRes.json()

    await updateSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Changed Title' }),
      }),
      { params: Promise.resolve({ id: String(created.id) }) }
    )

    const beforeRollback = await listVersions(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/versions`),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    const beforeData = await beforeRollback.json()
    const targetVersionId = beforeData.items[1].id as number

    const rollbackRes = await rollbackSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: targetVersionId, reason: 'recover baseline' }),
      }),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(rollbackRes.status).toBe(200)
    const rollbackData = await rollbackRes.json()
    expect(rollbackData.title).toBe('Versioned Skill')
    expect(rollbackData.createdVersion).toBe(3)

    const skillRes = await getSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}`),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    const skill = await skillRes.json()
    expect(skill.status).toBe('draft')
  })

  it('publishes current latest version and returns publication list', async () => {
    const createRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
    )
    const created = await createRes.json()

    const publishRes = await publishSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'first publish' }),
      }),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(publishRes.status).toBe(201)
    const published = await publishRes.json()
    expect(published.skillStatus).toBe('published')
    expect(published.version).toBe(1)

    const publicationsRes = await listPublications(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/publications`),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(publicationsRes.status).toBe(200)
    const publications = await publicationsRes.json()
    expect(publications.total).toBe(1)
    expect(publications.items[0].version).toBe(1)
    expect(publications.items[0].note).toBe('first publish')

    const skillRes = await getSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}`),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    const skill = await skillRes.json()
    expect(skill.status).toBe('published')
  })

  it('returns 404 when rollback version does not exist', async () => {
    const createRes = await createSkill(
      makeRequest('http://localhost:3000/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSkillBody),
      })
    )
    const created = await createRes.json()

    const rollbackRes = await rollbackSkill(
      makeRequest(`http://localhost:3000/api/skills/${created.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: 999 }),
      }),
      { params: Promise.resolve({ id: String(created.id) }) }
    )
    expect(rollbackRes.status).toBe(404)
  })
})
