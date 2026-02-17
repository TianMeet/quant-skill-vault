const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const SKILL_NAME_REGEX = /^[a-z0-9-]{1,64}$/
const MAX_DESCRIPTION_LENGTH = 1024
const REQUIRED_SECTIONS = ['## Purpose', '## Inputs', '## Outputs', '## Workflow', '## Guardrails', '## Tests']

function ensureSkillDir(inputPath) {
  if (!inputPath) {
    throw new Error('skill path is required')
  }
  const resolved = path.resolve(inputPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`path does not exist: ${resolved}`)
  }
  const stat = fs.statSync(resolved)
  if (stat.isDirectory()) return resolved
  if (stat.isFile() && path.basename(resolved).toLowerCase() === 'skill.md') {
    return path.dirname(resolved)
  }
  throw new Error(`expected a skill directory or SKILL.md path, got: ${resolved}`)
}

function readSkillMarkdown(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillFile)) {
    throw new Error(`SKILL.md not found in: ${skillDir}`)
  }
  return fs.readFileSync(skillFile, 'utf8')
}

function parseFrontmatter(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('SKILL.md frontmatter missing or malformed')
  }
  const frontmatter = yaml.load(match[1])
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new Error('frontmatter must be a YAML object')
  }
  return {
    frontmatter,
    body: match[2],
  }
}

function extractRelativeLinks(markdownBody) {
  const links = []
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g
  let m = null
  while ((m = linkRegex.exec(markdownBody)) !== null) {
    const href = (m[2] || '').trim()
    if (!href) continue
    if (href.startsWith('http://') || href.startsWith('https://')) continue
    if (!links.includes(href)) links.push(href)
  }
  return links
}

function validateSkillFrontmatter(frontmatter, skillDirName) {
  const errors = []
  const warnings = []

  const allowedKeys = new Set([
    'name',
    'description',
    'allowed-tools',
    'disable-model-invocation',
    'user-invocable',
    'metadata',
    'compatibility',
    'license',
  ])

  for (const key of Object.keys(frontmatter)) {
    if (!allowedKeys.has(key)) {
      warnings.push(`unexpected frontmatter key: ${key}`)
    }
  }

  if (typeof frontmatter.name !== 'string' || !frontmatter.name.trim()) {
    errors.push('frontmatter.name is required')
  } else {
    if (!SKILL_NAME_REGEX.test(frontmatter.name)) {
      errors.push('frontmatter.name must match ^[a-z0-9-]{1,64}$')
    }
    if (frontmatter.name !== skillDirName) {
      warnings.push(`frontmatter.name (${frontmatter.name}) differs from folder name (${skillDirName})`)
    }
  }

  if (typeof frontmatter.description !== 'string' || !frontmatter.description.trim()) {
    errors.push('frontmatter.description is required')
  } else {
    if (frontmatter.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`frontmatter.description must be <= ${MAX_DESCRIPTION_LENGTH} chars`)
    }
    if (!frontmatter.description.startsWith('This skill should be used when')) {
      warnings.push('description should start with: "This skill should be used when"')
    }
  }

  if (
    frontmatter['allowed-tools'] !== undefined &&
    (!Array.isArray(frontmatter['allowed-tools']) ||
      frontmatter['allowed-tools'].some((t) => typeof t !== 'string'))
  ) {
    errors.push('frontmatter.allowed-tools must be string[]')
  }

  for (const key of ['disable-model-invocation', 'user-invocable']) {
    if (frontmatter[key] !== undefined && typeof frontmatter[key] !== 'boolean') {
      errors.push(`frontmatter.${key} must be boolean`)
    }
  }

  return { errors, warnings }
}

function validateSkillDirectory(skillInputPath) {
  const skillDir = ensureSkillDir(skillInputPath)
  const skillDirName = path.basename(skillDir)
  const markdown = readSkillMarkdown(skillDir)
  const { frontmatter, body } = parseFrontmatter(markdown)

  const errors = []
  const warnings = []

  const fmValidation = validateSkillFrontmatter(frontmatter, skillDirName)
  errors.push(...fmValidation.errors)
  warnings.push(...fmValidation.warnings)

  for (const section of REQUIRED_SECTIONS) {
    if (!body.includes(section)) {
      warnings.push(`missing recommended section: ${section}`)
    }
  }

  if (/<[^>\n]+>/.test(body)) {
    warnings.push('template placeholders detected in body (e.g., <...>)')
  }

  const relativeLinks = extractRelativeLinks(body)
  for (const link of relativeLinks) {
    if (link.startsWith('/') || link.includes('..') || link.includes('\\')) {
      errors.push(`unsafe relative link path: ${link}`)
      continue
    }
    const resolved = path.join(skillDir, link)
    if (!fs.existsSync(resolved)) {
      errors.push(`missing linked file: ${link}`)
    }
  }

  return {
    skillDir,
    skillDirName,
    frontmatter,
    markdown,
    errors,
    warnings,
  }
}

function collectFilesRecursively(rootDir) {
  const allFiles = []
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
      } else if (entry.isFile()) {
        allFiles.push(abs)
      }
    }
  }
  walk(rootDir)
  return allFiles
}

module.exports = {
  ensureSkillDir,
  parseFrontmatter,
  validateSkillDirectory,
  collectFilesRecursively,
}
