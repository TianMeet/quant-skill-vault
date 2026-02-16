/**
 * claudeRunner - 安全调用本机 Claude CLI（headless print 模式）
 *
 * 安全策略：
 * - 使用 spawn(command, argsArray, {shell:false}) 防止注入
 * - 禁用所有内置工具（--tools ""）
 * - 禁止 dangerously-skip-permissions
 * - prompt 长度限制 8k chars
 */
import { spawn } from 'child_process'
import path from 'path'
import type { ChangeSet, ClaudeRunnerOptions, ClaudeRunnerResult } from './types'
import { changeSetJsonSchema } from './schema'
import { validateSkillFilePath } from '../skill-files'

const PROMPT_MAX_LENGTH = 8192
const TEXT_MAX = 200 * 1024 // 200KB
const BINARY_MAX = 2 * 1024 * 1024 // 2MB

const SYSTEM_PROMPT = `You are a Skill editor for the Quant Skill Vault system.
You MUST output ONLY a valid JSON object matching the provided json-schema.
Do NOT output any extra text, markdown fences, or explanation outside the JSON.

Rules:
- Only modify fields in skillPatch that need changing. Omit unchanged fields.
- fileOps paths MUST be relative, starting with one of: references/, examples/, scripts/, assets/, templates/
- NEVER use absolute paths, "..", or backslashes in paths
- NEVER create or modify SKILL.md (it is auto-generated from skillPatch fields)
- steps: 3-7 items, imperative voice
- triggers: at least 3 items
- tests: at least 1 test case
- guardrails.escalation must be REVIEW, BLOCK, or ASK_HUMAN
- guardrails.stop_conditions: at least 1 item
- content_text for files must be under 200KB
- Write in a concise, protocol-card style: imperative, executable, with guardrails + tests`

/**
 * 解析 Claude headless JSON 输出，提取 structured_output
 */
export function parseClaudeHeadlessJson(raw: string): ClaudeRunnerResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, errors: ['Failed to parse Claude output as JSON'] }
  }

  const usage = parsed.usage as ClaudeRunnerResult['usage']

  if (!parsed.structured_output || typeof parsed.structured_output !== 'object') {
    return {
      ok: false,
      rawJson: parsed,
      usage,
      errors: ['structured_output missing or not an object in Claude response'],
    }
  }

  return {
    ok: true,
    rawJson: parsed,
    structuredOutput: parsed.structured_output as ChangeSet,
    usage,
  }
}

/**
 * 校验 ChangeSet 合法性（schema + path gate + size gate）
 */
export function validateChangeSet(cs: ChangeSet): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!cs || typeof cs !== 'object') {
    return { valid: false, errors: ['changeSet must be an object'] }
  }

  if (!cs.skillPatch || typeof cs.skillPatch !== 'object') {
    errors.push('changeSet.skillPatch is required and must be an object')
  }

  if (!Array.isArray(cs.fileOps)) {
    errors.push('changeSet.fileOps is required and must be an array')
  }

  if (errors.length > 0) return { valid: false, errors }

  // Validate each fileOp
  for (const fop of cs.fileOps) {
    if (!fop.op || !['upsert', 'delete'].includes(fop.op)) {
      errors.push(`fileOp.op must be "upsert" or "delete", got: "${fop.op}"`)
    }

    // Path gate: use existing validateSkillFilePath
    const pathResult = validateSkillFilePath(fop.path)
    if (!pathResult.valid) {
      errors.push(`fileOp path "${fop.path}": ${pathResult.errors.join('; ')}`)
    }

    // Size gate for upsert
    if (fop.op === 'upsert') {
      const hasText = typeof fop.content_text === 'string'
      const hasBase64 = typeof fop.content_base64 === 'string'

      if (!hasText && !hasBase64) {
        errors.push(`fileOp "${fop.path}": upsert requires content_text or content_base64`)
      }
      if (hasText && hasBase64) {
        errors.push(`fileOp "${fop.path}": provide only one of content_text or content_base64`)
      }

      if (hasText && Buffer.byteLength(fop.content_text!, 'utf-8') > TEXT_MAX) {
        errors.push(`fileOp "${fop.path}": content_text exceeds 200KB limit`)
      }

      if (hasBase64) {
        const bytes = Buffer.from(fop.content_base64!, 'base64')
        if (bytes.length > BINARY_MAX) {
          errors.push(`fileOp "${fop.path}": content_base64 exceeds 2MB limit`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 构建 Claude CLI 参数数组（安全：不含 shell 拼接）
 */
export function buildClaudeArgs(options: ClaudeRunnerOptions): string[] {
  const {
    prompt,
    jsonSchema,
    model,
    maxTurns = Number(process.env.CLAUDE_MAX_TURNS) || 3,
    maxBudgetUsd = Number(process.env.CLAUDE_MAX_BUDGET_USD) || 1,
  } = options

  const args: string[] = [
    '-p', prompt,
    '--output-format', 'json',
    '--json-schema', jsonSchema,
    '--tools', '',
    '--no-session-persistence',
    '--max-turns', String(maxTurns),
    '--max-budget-usd', String(maxBudgetUsd),
    '--system-prompt', SYSTEM_PROMPT,
  ]

  if (model || process.env.CLAUDE_MODEL) {
    args.push('--model', model || process.env.CLAUDE_MODEL!)
  }

  return args
}

/**
 * 执行 Claude CLI 并返回解析后的结果
 */
export async function runClaude(options: ClaudeRunnerOptions): Promise<ClaudeRunnerResult> {
  // Prompt 长度限制
  if (options.prompt.length > PROMPT_MAX_LENGTH) {
    return { ok: false, errors: [`Prompt exceeds ${PROMPT_MAX_LENGTH} character limit`] }
  }

  const claudeBin = process.env.CLAUDE_BIN || 'claude'
  const timeoutMs = options.timeoutMs || Number(process.env.CLAUDE_TIMEOUT_MS) || 60000

  const args = buildClaudeArgs({
    ...options,
    jsonSchema: options.jsonSchema || changeSetJsonSchema,
  })

  return new Promise((resolve) => {
    // 分离 CLAUDE_BIN 中可能的空格（如 "node script.js"）
    let command: string
    let spawnArgs: string[]

    const binParts = claudeBin.split(/\s+/)
    if (binParts.length > 1) {
      command = binParts[0]
      spawnArgs = [...binParts.slice(1), ...args]
    } else {
      command = claudeBin
      spawnArgs = args
    }

    // 安全：shell:false 防止命令注入
    const child = spawn(command, spawnArgs, {
      shell: false,
      timeout: timeoutMs,
      env: { ...process.env },
      cwd: path.resolve(process.cwd()),
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      resolve({ ok: false, errors: [`Failed to spawn claude: ${err.message}`] })
    })

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          errors: [`Claude exited with code ${code}`, stderr].filter(Boolean),
        })
        return
      }

      const result = parseClaudeHeadlessJson(stdout)
      resolve(result)
    })
  })
}
