/**
 * 聊天面板类型定义
 */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCall?: ToolCallData | null
  toolResult?: { success: boolean; skillId?: number } | null
  draftToolCalls?: ToolCallData[]
}

export type ToolName = 'create_skill' | 'update_skill' | 'update_skill_draft' | 'create_file' | 'delete_file'

export interface ToolCallData {
  id: string
  name: ToolName
  input: SkillToolInput | FileToolInput | DeleteFileToolInput
}

export interface SkillToolInput {
  title: string
  summary: string
  inputs?: string
  outputs?: string
  steps: string[]
  risks?: string
  triggers: string[]
  guardrails: {
    allowed_tools?: string[]
    disable_model_invocation?: boolean
    user_invocable?: boolean
    stop_conditions: string[]
    escalation: 'REVIEW' | 'BLOCK' | 'ASK_HUMAN'
  }
  tests: { name: string; input: string; expected_output: string }[]
  tags?: string[]
}

export interface FileToolInput {
  path: string
  content: string
  mime?: string
}

export interface DeleteFileToolInput {
  path: string
}

/** SkillDraft — 所有字段可选，用于渐进渲染 */
export interface SkillDraft {
  title?: string
  summary?: string
  inputs?: string
  outputs?: string
  steps?: string[]
  risks?: string
  triggers?: string[]
  guardrails?: {
    allowed_tools?: string[]
    disable_model_invocation?: boolean
    user_invocable?: boolean
    stop_conditions?: string[]
    escalation?: 'REVIEW' | 'BLOCK' | 'ASK_HUMAN'
  }
  tests?: { name?: string; input?: string; expected_output?: string }[]
  tags?: string[]
}

/** SSE 事件类型 */
export type SSEEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_input_delta'; partial_json: string }
  | { type: 'tool_use'; id: string; name: ToolName; input: SkillToolInput }
  | { type: 'done' }
  | { type: 'error'; message: string }
