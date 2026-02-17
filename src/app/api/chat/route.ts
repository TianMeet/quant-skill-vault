import { resolveChatProvider } from '@/lib/chat/providers'
import type { ChatStreamEvent } from '@/lib/chat/providers/types'

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
    const provider = resolveChatProvider()

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        try {
          for await (const event of provider.stream({ messages })) {
            switch (event.type) {
              case 'text_delta':
                send('text_delta', { text: event.text })
                break
              case 'tool_use':
                send('tool_use', { id: event.id, name: event.name, input: event.input })
                break
              case 'done':
                send('done', {})
                break
              default: {
                const unreachable: never = event as never
                send('error', { message: `Unknown event ${(unreachable as ChatStreamEvent).type}` })
              }
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
