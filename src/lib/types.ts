/**
 * Quant Skill Vault - 核心类型定义
 * 定义 Skill 数据模型及相关类型
 */

export interface SkillGuardrails {
  allowed_tools: string[]
  disable_model_invocation: boolean
  user_invocable: boolean
  stop_conditions: string[]
  escalation: 'REVIEW' | 'BLOCK' | 'ASK_HUMAN'
}

export interface SkillTestCase {
  name: string
  input: string
  expected_output: string
}

export interface SkillData {
  id?: number
  title: string
  slug?: string
  summary: string
  inputs: string
  outputs: string
  steps: string[]
  risks: string
  triggers: string[]
  guardrails: SkillGuardrails
  tests: SkillTestCase[]
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

export interface LintError {
  field: string
  message: string
}

export interface LintResult {
  valid: boolean
  errors: LintError[]
}
