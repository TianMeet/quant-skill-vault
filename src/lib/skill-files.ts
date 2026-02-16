/**
 * Skill 文件路径校验与工具函数
 */

const ALLOWED_DIRS = ['references', 'examples', 'scripts', 'assets', 'templates']

export interface PathValidation {
  valid: boolean
  errors: string[]
}

/**
 * 校验 supporting file 的相对路径是否合法
 */
export function validateSkillFilePath(path: string): PathValidation {
  const errors: string[] = []

  if (!path || path.trim() === '') {
    return { valid: false, errors: ['path must not be empty'] }
  }

  // 禁止 SKILL.md
  const lower = path.toLowerCase()
  if (lower === 'skill.md' || lower.endsWith('/skill.md')) {
    return { valid: false, errors: ['SKILL.md is auto-generated and cannot be created as a file'] }
  }

  if (path.startsWith('/')) {
    errors.push('path must not start with /')
  }

  if (path.includes('..')) {
    errors.push('path must not contain ..')
  }

  if (path.includes('\\')) {
    errors.push('path must not contain backslash')
  }

  if (errors.length > 0) return { valid: false, errors }

  const topDir = path.split('/')[0]
  if (!ALLOWED_DIRS.includes(topDir)) {
    errors.push(`path must start with one of: ${ALLOWED_DIRS.join(', ')}`)
  }

  // 文件名不能为空
  const parts = path.split('/')
  const filename = parts[parts.length - 1]
  if (!filename || filename.trim() === '') {
    errors.push('filename must not be empty')
  }

  return { valid: errors.length === 0, errors }
}
