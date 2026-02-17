import type { LintError } from '@/lib/types'

export interface FriendlyValidationIssue {
  field: string
  fieldLabel: string
  message: string
  suggestion?: string
}

const FIELD_LABELS: Record<string, string> = {
  slug: '标识名',
  title: '标题',
  summary: '摘要',
  triggers: '触发词',
  steps: '步骤',
  tests: '测试',
  description: '描述',
  files: '支持文件',
  'guardrails.stop_conditions': '停止条件',
  'guardrails.escalation': '升级策略',
  guardrails: '安全护栏',
  body: '请求内容',
}

function parseGotCount(message: string): number | null {
  const match = message.match(/got:\s*(\d+)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function parseBracketCount(message: string): number | null {
  const match = message.match(/\((\d+)\)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function mapPathValidationDetail(detail: string): string {
  if (detail.includes('path must not start with /')) {
    return '文件路径不能以 / 开头，请使用相对路径。'
  }
  if (detail.includes('path must not contain ..')) {
    return '文件路径不能包含 ..，请避免越级目录。'
  }
  if (detail.includes('path must not contain backslash')) {
    return '文件路径请使用 /，不要使用 \\。'
  }
  if (detail.includes('path must start with one of')) {
    return '文件必须位于 references/examples/scripts/assets/templates 目录下。'
  }
  if (detail.includes('filename must not be empty')) {
    return '文件名不能为空。'
  }
  if (detail.includes('SKILL.md is auto-generated')) {
    return 'SKILL.md 由系统自动生成，无需手动创建。'
  }
  if (detail.includes('path must not be empty')) {
    return '文件路径不能为空。'
  }
  return '文件路径不符合要求，请检查目录和文件名格式。'
}

function mapLintError(error: LintError): FriendlyValidationIssue {
  const fieldLabel = FIELD_LABELS[error.field] || '配置项'
  const raw = error.message || ''

  if (error.field === 'slug') {
    return {
      field: error.field,
      fieldLabel,
      message: '请先填写标题，系统会自动生成可导出的标识名。',
      suggestion: '标识名仅支持小写字母、数字和短横线，长度不超过 64。',
    }
  }

  if (error.field === 'triggers') {
    const count = parseGotCount(raw)
    return {
      field: error.field,
      fieldLabel,
      message: `触发词至少需要 3 条${count !== null ? `（当前 ${count} 条）` : ''}。`,
      suggestion: '建议写成用户真实会输入的短句，避免过于抽象。',
    }
  }

  if (error.field === 'steps') {
    const count = parseGotCount(raw)
    return {
      field: error.field,
      fieldLabel,
      message: `步骤需要 3 到 7 条${count !== null ? `（当前 ${count} 条）` : ''}。`,
      suggestion: '每条步骤尽量写成可直接执行的动作。',
    }
  }

  if (error.field === 'tests') {
    return {
      field: error.field,
      fieldLabel,
      message: '至少需要 1 条完整测试用例。',
      suggestion: '请填写测试名称、输入和预期输出。',
    }
  }

  if (error.field === 'guardrails.stop_conditions') {
    return {
      field: error.field,
      fieldLabel,
      message: '请至少添加 1 条停止条件。',
      suggestion: '用于明确何时终止执行，避免风险继续扩大。',
    }
  }

  if (error.field === 'guardrails.escalation') {
    return {
      field: error.field,
      fieldLabel,
      message: '升级策略未正确设置。',
      suggestion: '请选择 REVIEW、BLOCK 或 ASK_HUMAN。',
    }
  }

  if (error.field === 'description' && raw.includes('exceeds 1024')) {
    const count = parseBracketCount(raw)
    return {
      field: error.field,
      fieldLabel,
      message: `描述过长${count !== null ? `（当前 ${count} 字符）` : ''}，需要控制在 1024 字符内。`,
      suggestion: '可以适当精简摘要或触发词。',
    }
  }

  if (error.field === 'files' && raw.startsWith('missing file:')) {
    const file = raw.replace('missing file:', '').trim()
    return {
      field: error.field,
      fieldLabel,
      message: `检测到引用文件不存在：${file}。`,
      suggestion: '请先创建该文件，或删除 SKILL.md 中对应的相对链接。',
    }
  }

  if (error.field === 'files' && raw.startsWith('invalid path:')) {
    const afterPrefix = raw.replace('invalid path:', '').trim()
    const [pathPart, detailPart = ''] = afterPrefix.split('—')
    return {
      field: error.field,
      fieldLabel,
      message: `文件路径不合法：${(pathPart || '').trim()}`,
      suggestion: mapPathValidationDetail(detailPart.trim()),
    }
  }

  if (error.field === 'body') {
    return {
      field: error.field,
      fieldLabel,
      message: '提交内容格式不正确。',
      suggestion: '请刷新页面后重试。',
    }
  }

  return {
    field: error.field,
    fieldLabel,
    message: raw || `${fieldLabel}配置需要调整。`,
  }
}

export function toFriendlyLintIssues(errors: LintError[]): FriendlyValidationIssue[] {
  return errors.map(mapLintError)
}

export function toFriendlyLintSummary(errors: LintError[]): string {
  const issues = toFriendlyLintIssues(errors)
  if (issues.length === 0) return '校验未通过，请检查后重试。'
  return issues
    .slice(0, 3)
    .map((issue, i) => `${i + 1}. ${issue.message}`)
    .join('\n')
}

export function toUserFriendlyErrorMessage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    return '操作失败，请稍后重试。'
  }
  const message = raw.trim()

  if (message === 'Validation failed' || message.startsWith('Validation failed')) {
    return '提交内容未通过校验，请补齐必填项后重试。'
  }
  if (message === 'Cannot generate valid slug from title' || message.startsWith('Cannot generate valid slug from title')) {
    return '标题暂时无法生成有效标识名，请调整标题后再试。'
  }
  if (message === 'Slug already exists' || message.startsWith('Slug already exists')) {
    return '已存在同名 Skill，请修改标题后重试。'
  }
  if (message === 'Lint check failed') {
    return '校验请求失败，请稍后重试。'
  }
  if (message === 'Invalid changeSet') {
    return 'AI 生成的变更格式不正确，请重新生成建议。'
  }
  if (message === 'Claude CLI failed') {
    return 'AI 服务调用失败，请稍后重试。'
  }
  if (message.startsWith('Prompt exceeds')) {
    return '当前内容过长，AI 暂时无法处理，请精简后重试。'
  }
  if (message === 'Binary file exceeds 2MB limit') {
    return '二进制文件过大（超过 2MB），请压缩后再上传。'
  }
  if (message === 'Text file exceeds 200KB limit') {
    return '文本文件过大（超过 200KB），请拆分后再上传。'
  }
  if (message === 'File path already exists') {
    return '该文件路径已存在，请更换文件名。'
  }
  if (message === 'path query required') {
    return '缺少文件路径参数，请刷新后重试。'
  }
  if (message === 'File not found') {
    return '目标文件不存在，可能已被删除。'
  }
  if (message === 'Skill not found') {
    return '未找到当前 Skill，可能已被删除。'
  }
  if (message === 'Invalid skill id') {
    return '链接中的 Skill 标识无效，请返回列表后重试。'
  }
  if (message === 'Invalid JSON body') {
    return '请求格式不正确，请刷新页面后重试。'
  }
  if (message === 'Tag not found') {
    return '标签不存在，可能已被删除。'
  }
  if (message === 'Source tag not found') {
    return '源标签不存在，请刷新后重试。'
  }
  if (message === 'Target tag not found') {
    return '目标标签不存在，请刷新后重试。'
  }
  if (message === 'Invalid tag id') {
    return '标签标识无效，请刷新后重试。'
  }
  if (message === 'Invalid source tag id' || message === 'Invalid target tag id') {
    return '标签参数无效，请重新选择后重试。'
  }
  if (message === 'Tag name is required') {
    return '请输入标签名称。'
  }
  if (message.startsWith('Tag name too long')) {
    return '标签名称过长，请控制在 100 字符以内。'
  }
  if (message === 'Tag name already exists') {
    return '该标签名称已存在，可直接使用或改为“合并标签”。'
  }
  if (message === 'Source and target tags cannot be the same') {
    return '源标签和目标标签不能相同。'
  }
  if (message === 'path is required') {
    return '缺少文件路径，请填写后重试。'
  }
  if (message === 'content must be string') {
    return '文件内容格式不正确，请重试。'
  }
  if (message === 'Network error' || message.includes('Network error')) {
    return '网络连接异常，请检查网络后重试。'
  }
  if (message.includes('path must') || message.includes('filename must')) {
    return mapPathValidationDetail(message)
  }

  return message
}
