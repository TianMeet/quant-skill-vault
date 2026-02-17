import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from '@/lib/chat/system-prompt'
import { CREATE_SKILL_TOOL, UPDATE_SKILL_DRAFT_TOOL } from '@/lib/chat/tool-definitions'
import type { ChatProviderAdapter, ChatProviderRequest, ChatStreamEvent } from './types'

const MODEL = process.env.CHAT_MODEL || 'claude-sonnet-4-20250514'

export class AnthropicChatProvider implements ChatProviderAdapter {
  private client: Anthropic

  constructor(apiKey: string, baseURL?: string) {
    this.client = new Anthropic({ apiKey, baseURL })
  }

  async *stream(req: ChatProviderRequest): AsyncGenerator<ChatStreamEvent> {
    const stream = await this.client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [UPDATE_SKILL_DRAFT_TOOL, CREATE_SKILL_TOOL],
      messages: req.messages as Anthropic.MessageParam[],
    })

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
            yield { type: 'text_delta', text: event.delta.text }
          } else if (event.delta.type === 'input_json_delta') {
            toolInputJson += event.delta.partial_json
          }
          break
        case 'content_block_stop':
          if (currentToolId && toolInputJson) {
            const input = JSON.parse(toolInputJson)
            yield {
              type: 'tool_use',
              id: currentToolId,
              name: currentToolName,
              input,
            }
            currentToolId = ''
            currentToolName = ''
            toolInputJson = ''
          }
          break
        case 'message_stop':
          yield { type: 'done' }
          break
      }
    }
  }
}
