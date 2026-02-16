import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '@/lib/chat/system-prompt'
import { CREATE_SKILL_TOOL } from '@/lib/chat/tool-definitions'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
})
const MODEL = process.env.CHAT_MODEL || 'claude-sonnet-4-20250514'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [CREATE_SKILL_TOOL],
      messages,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          let currentToolId = ''
          let currentToolName = ''
          let toolInputJson = ''

          for await (const event of stream) {
            switch (event.type) {
              case 'content_block_start':
                if (event.content_block.type === 'tool_use') {
                  currentToolId = event.content_block.id
                  currentToolName = event.content_block.name
                  toolInputJson = ''
                }
                break

              case 'content_block_delta':
                if (event.delta.type === 'text_delta') {
                  send('text_delta', { text: event.delta.text })
                } else if (event.delta.type === 'input_json_delta') {
                  toolInputJson += event.delta.partial_json
                }
                break

              case 'content_block_stop':
                if (currentToolId && toolInputJson) {
                  try {
                    const input = JSON.parse(toolInputJson)
                    send('tool_use', { id: currentToolId, name: currentToolName, input })
                  } catch {
                    send('error', { message: 'Failed to parse tool input' })
                  }
                  currentToolId = ''
                  currentToolName = ''
                  toolInputJson = ''
                }
                break

              case 'message_stop':
                send('done', {})
                break
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Stream error'
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`),
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
