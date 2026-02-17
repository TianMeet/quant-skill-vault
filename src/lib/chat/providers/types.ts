export interface ChatProviderRequest {
  messages: unknown[]
}

export type ToolUseEvent = {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export type TextDeltaEvent = {
  type: 'text_delta'
  text: string
}

export type DoneEvent = {
  type: 'done'
}

export type ChatStreamEvent = TextDeltaEvent | ToolUseEvent | DoneEvent

export interface ChatProviderAdapter {
  stream(req: ChatProviderRequest): AsyncGenerator<ChatStreamEvent>
}
