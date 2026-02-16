/**
 * AI 变更提案（ChangeSet）类型定义
 * 由 Claude CLI 返回，经 json-schema 强制约束
 */

export interface ChangeSetSkillPatch {
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
    escalation?: string
  }
  tests?: Array<{ name: string; input: string; expected_output: string }>
  tags?: string[]
}

export interface FileOp {
  op: 'upsert' | 'delete'
  path: string
  mime?: string
  content_text?: string
  content_base64?: string
}

export interface ChangeSet {
  skillPatch: ChangeSetSkillPatch
  fileOps: FileOp[]
  notes?: string
}

export interface ClaudeRunnerOptions {
  prompt: string
  jsonSchema: string
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  timeoutMs?: number
}

export interface ClaudeRunnerResult {
  ok: boolean
  rawJson?: unknown
  structuredOutput?: ChangeSet
  usage?: { input_tokens?: number; output_tokens?: number }
  errors?: string[]
}

export type AiAction = 'update-skill' | 'fix-lint' | 'create-supporting-files'
