// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest'
import { resetMockDb, seedMockSkill } from './prisma-mock'

// Valid skill data for seeding
const validSkillData = {
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
  _tags: ['test'],
}

describe('Files API', () => {
  beforeEach(() => {
    resetMockDb()
  })

  describe('POST /api/skills/:id/files - create file', () => {
    it('creates a text file', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST } = await import('../skills/[id]/files/route')
      const req = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/rules.md',
          content: '# Rules\n\nFollow these rules.',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.path).toBe('references/rules.md')
      expect(data.mime).toBe('text/markdown')
    })

    it('rejects invalid path', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST } = await import('../skills/[id]/files/route')
      const req = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'other/bad.md',
          content: 'test',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(400)
    })

    it('rejects SKILL.md path', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST } = await import('../skills/[id]/files/route')
      const req = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'SKILL.md',
          content: 'test',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(400)
    })

    it('rejects text file > 200KB', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST } = await import('../skills/[id]/files/route')
      const bigContent = 'x'.repeat(200 * 1024 + 1)
      const req = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/big.md',
          content: bigContent,
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(413)
    })

    it('returns 404 for non-existent skill', async () => {
      const { POST } = await import('../skills/[id]/files/route')
      const req = new Request('http://localhost/api/skills/999/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/rules.md',
          content: 'test',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      const res = await POST(req, { params: Promise.resolve({ id: '999' }) })
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/skills/:id/files - list & read', () => {
    it('lists all files for a skill', async () => {
      const skill = seedMockSkill(validSkillData)
      // Seed a file via mock
      const { POST, GET } = await import('../skills/[id]/files/route')
      const createReq = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/rules.md',
          content: '# Rules',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      await POST(createReq, { params: Promise.resolve({ id: String(skill.id) }) })

      const listReq = new Request('http://localhost/api/skills/1/files')
      const res = await GET(listReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.length).toBe(1)
      expect(data[0].path).toBe('references/rules.md')
    })

    it('reads a specific file by path query', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST, GET } = await import('../skills/[id]/files/route')
      const createReq = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/rules.md',
          content: '# Rules',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      await POST(createReq, { params: Promise.resolve({ id: String(skill.id) }) })

      const readReq = new Request('http://localhost/api/skills/1/files?path=references/rules.md')
      const res = await GET(readReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.contentText).toBe('# Rules')
    })
  })

  describe('PUT /api/skills/:id/files?path=... - update', () => {
    it('updates file content', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST, PUT } = await import('../skills/[id]/files/route')
      const createReq = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/rules.md',
          content: '# Rules v1',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      await POST(createReq, { params: Promise.resolve({ id: String(skill.id) }) })

      const updateReq = new Request('http://localhost/api/skills/1/files?path=references/rules.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Rules v2' }),
      })
      const res = await PUT(updateReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.contentText).toBe('# Rules v2')
    })
  })

  describe('PATCH /api/skills/:id/files - rename / move', () => {
    it('renames a file path', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST, PATCH, GET } = await import('../skills/[id]/files/route')

      await POST(
        new Request('http://localhost/api/skills/1/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'references/rules.md',
            content: '# Rules',
            mime: 'text/markdown',
            isBinary: false,
          }),
        }),
        { params: Promise.resolve({ id: String(skill.id) }) }
      )

      const patchReq = new Request('http://localhost/api/skills/1/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPath: 'references/rules.md',
          toPath: 'examples/rules-v2.md',
        }),
      })
      const patchRes = await PATCH(patchReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(patchRes.status).toBe(200)
      const patchData = await patchRes.json()
      expect(patchData.path).toBe('examples/rules-v2.md')

      const listRes = await GET(new Request('http://localhost/api/skills/1/files'), {
        params: Promise.resolve({ id: String(skill.id) }),
      })
      const files = await listRes.json()
      expect(files[0].path).toBe('examples/rules-v2.md')
    })

    it('returns 409 when target path already exists', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST, PATCH } = await import('../skills/[id]/files/route')

      await POST(
        new Request('http://localhost/api/skills/1/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'references/rules.md',
            content: '# Rules',
            mime: 'text/markdown',
            isBinary: false,
          }),
        }),
        { params: Promise.resolve({ id: String(skill.id) }) }
      )
      await POST(
        new Request('http://localhost/api/skills/1/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'examples/rules.md',
            content: '# Rules 2',
            mime: 'text/markdown',
            isBinary: false,
          }),
        }),
        { params: Promise.resolve({ id: String(skill.id) }) }
      )

      const patchReq = new Request('http://localhost/api/skills/1/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPath: 'references/rules.md',
          toPath: 'examples/rules.md',
        }),
      })
      const patchRes = await PATCH(patchReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(patchRes.status).toBe(409)
    })
  })

  describe('DELETE /api/skills/:id/files?path=... - delete', () => {
    it('deletes a file', async () => {
      const skill = seedMockSkill(validSkillData)
      const { POST, DELETE: DEL, GET } = await import('../skills/[id]/files/route')
      const createReq = new Request('http://localhost/api/skills/1/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'references/rules.md',
          content: '# Rules',
          mime: 'text/markdown',
          isBinary: false,
        }),
      })
      await POST(createReq, { params: Promise.resolve({ id: String(skill.id) }) })

      const delReq = new Request('http://localhost/api/skills/1/files?path=references/rules.md', { method: 'DELETE' })
      const res = await DEL(delReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(200)

      // Verify deleted
      const listReq = new Request('http://localhost/api/skills/1/files')
      const listRes = await GET(listReq, { params: Promise.resolve({ id: String(skill.id) }) })
      const data = await listRes.json()
      expect(data.length).toBe(0)
    })

    it('returns 404 when deleting a non-existent file', async () => {
      const skill = seedMockSkill(validSkillData)
      const { DELETE: DEL } = await import('../skills/[id]/files/route')
      const delReq = new Request('http://localhost/api/skills/1/files?path=references/missing.md', { method: 'DELETE' })
      const res = await DEL(delReq, { params: Promise.resolve({ id: String(skill.id) }) })
      expect(res.status).toBe(404)
    })
  })
})

describe('Export ZIP with supporting files', () => {
  beforeEach(() => {
    resetMockDb()
  })

  it('includes supporting files in zip when lint passes', async () => {
    const skill = seedMockSkill(validSkillData)
    // Create a supporting file
    const { POST: createFile } = await import('../skills/[id]/files/route')
    const createReq = new Request('http://localhost/api/skills/1/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'references/rules.md',
        content: '# Rules',
        mime: 'text/markdown',
        isBinary: false,
      }),
    })
    await createFile(createReq, { params: Promise.resolve({ id: String(skill.id) }) })

    const { GET } = await import('../skills/[id]/export.zip/route')
    const req = new Request('http://localhost/api/skills/1/export.zip')
    const res = await GET(req, { params: Promise.resolve({ id: String(skill.id) }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')
  })

  it('returns 400 when SKILL.md has broken relative links', async () => {
    // Skill with a manual relative link in inputs but no matching file
    const skill = seedMockSkill({
      ...validSkillData,
      inputs: 'See [config](references/config.yaml) for details',
    })

    const { GET } = await import('../skills/[id]/export.zip/route')
    const req = new Request('http://localhost/api/skills/1/export.zip')
    const res = await GET(req, { params: Promise.resolve({ id: String(skill.id) }) })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.errors.some((e: { message: string }) => e.message.includes('missing file'))).toBe(true)
  })
})
