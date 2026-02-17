import { beforeEach, describe, expect, it } from 'vitest'
import { POST as chatPost } from '@/app/api/chat/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type ParsedEvent = { event: string; data: Record<string, unknown> }

function parseSsePayload(raw: string): ParsedEvent[] {
  return raw
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const eventLine = chunk
        .split('\n')
        .find((line) => line.startsWith('event: '))
      const dataLine = chunk
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!eventLine || !dataLine) {
        throw new Error(`Invalid SSE chunk: ${chunk}`)
      }

      return {
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)) as Record<string, unknown>,
      }
    })
}

describe('Chat API', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.CHAT_MOCK_SCENARIO
    process.env.CHAT_PROVIDER = 'mock'
  })

  it('streams mock SSE events with draft tool_use and done', async () => {
    const req = makeRequest({
      messages: [{ role: 'user', content: '帮我做一个代码审查 skill' }],
    })

    const res = await chatPost(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const body = await res.text()
    const events = parseSsePayload(body)

    const toolEvent = events.find((e) => e.event === 'tool_use')
    expect(toolEvent).toBeDefined()
    expect(toolEvent?.data.name).toBe('update_skill_draft')
    expect(toolEvent?.data.input).toBeTypeOf('object')

    const doneIndex = events.findIndex((e) => e.event === 'done')
    const toolIndex = events.findIndex((e) => e.event === 'tool_use')
    expect(toolIndex).toBeGreaterThan(-1)
    expect(doneIndex).toBeGreaterThan(toolIndex)
  })

  it('returns 500 when anthropic provider is selected without key', async () => {
    process.env.CHAT_PROVIDER = 'anthropic'

    const req = makeRequest({ messages: [{ role: 'user', content: 'test' }] })
    const res = await chatPost(req)

    expect(res.status).toBe(500)
    const data = await res.json() as { error: string }
    expect(data.error).toContain('ANTHROPIC_API_KEY')
  })

  it('emits SSE error event when mock provider throws', async () => {
    process.env.CHAT_PROVIDER = 'mock'
    process.env.CHAT_MOCK_SCENARIO = 'error'

    const req = makeRequest({ messages: [{ role: 'user', content: 'test' }] })
    const res = await chatPost(req)

    expect(res.status).toBe(200)
    const body = await res.text()
    const events = parseSsePayload(body)

    const errorEvent = events.find((e) => e.event === 'error')
    expect(errorEvent).toBeDefined()
    expect(String(errorEvent?.data.message || '')).toContain('Mock provider forced error')
  })
})
