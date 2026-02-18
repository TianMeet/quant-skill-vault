#!/usr/bin/env node

/**
 * Sync official Anthropic skills (anthropics/skills -> skills/*) into local DB.
 *
 * Usage:
 *   node scripts/sync-anthropic-official-skills.js --dry-run
 *   node scripts/sync-anthropic-official-skills.js --apply
 *   node scripts/sync-anthropic-official-skills.js --apply --ref main
 */

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const yaml = require('js-yaml')
const AdmZip = require('adm-zip')
const { PrismaClient } = require('@prisma/client')

const UPSTREAM_REPO = 'anthropics/skills'
const DEFAULT_REF = 'main'
const OFFICIAL_TAG = 'anthropic-official'

const ALLOWED_DIRS = new Set(['references', 'examples', 'scripts', 'assets', 'templates'])
const TEXT_MAX = 200 * 1024
const BINARY_MAX = 2 * 1024 * 1024

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.xsd', '.csv', '.tsv', '.ini', '.cfg', '.conf',
  '.py', '.js', '.ts', '.tsx', '.jsx', '.sh', '.bash', '.zsh', '.sql', '.html', '.htm', '.css', '.scss', '.less',
  '.java', '.kt', '.go', '.rs', '.rb', '.php', '.swift', '.c', '.h', '.cpp', '.hpp', '.cs', '.ps1', '.bat', '.pl',
])

function loadEnvFiles() {
  const candidates = ['.env.local', '.env']

  for (const filename of candidates) {
    const fullPath = path.resolve(process.cwd(), filename)
    if (!fs.existsSync(fullPath)) continue

    const content = fs.readFileSync(fullPath, 'utf8')
    const lines = content.split(/\r?\n/)

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue

      const eq = line.indexOf('=')
      if (eq <= 0) continue

      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (!key) continue
      if (process.env[key] !== undefined) continue

      value = value.replace(/^['"]|['"]$/g, '')
      process.env[key] = value
    }
  }
}

function parseArgs(argv) {
  const args = argv.slice(2)
  let apply = false
  let dryRun = true
  let ref = DEFAULT_REF

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--apply') {
      apply = true
      dryRun = false
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      apply = false
      continue
    }
    if (arg === '--ref') {
      ref = args[i + 1] || DEFAULT_REF
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0)
    }
  }

  return { apply, dryRun, ref }
}

function printUsageAndExit(code) {
  console.log('Usage: node scripts/sync-anthropic-official-skills.js [--dry-run|--apply] [--ref <git-ref>]')
  process.exit(code)
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n')
}

function toSha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function normalizeSlug(raw, fallback) {
  const base = String(raw || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)

  if (base) return base
  return String(fallback || 'skill').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 64) || 'skill'
}

function toTitle(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

function sanitizeText(raw) {
  return String(raw || '').replace(/\u0000/g, '').trim()
}

function sectionKey(name) {
  return sanitizeText(name).toLowerCase()
}

function parseFrontmatter(markdown) {
  const normalized = normalizeNewlines(markdown)
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: normalized }
  }

  let frontmatter = {}
  try {
    const parsed = yaml.load(match[1])
    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed
    }
  } catch {
    frontmatter = {}
  }

  return { frontmatter, body: match[2] }
}

function parseSections(body) {
  const sections = {}
  const matches = []
  const regex = /^##\s+(.+?)\s*$/gm
  let m
  while ((m = regex.exec(body)) !== null) {
    matches.push({ title: m[1], index: m.index, end: regex.lastIndex })
  }

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i]
    const next = matches[i + 1]
    const content = body.slice(current.end, next ? next.index : body.length).trim()
    sections[sectionKey(current.title)] = content
  }

  return sections
}

function pickSection(sections, names) {
  for (const name of names) {
    const key = sectionKey(name)
    if (sections[key] && sections[key].trim()) return sections[key].trim()
  }
  return ''
}

function descriptionToSummary(description) {
  const cleaned = sanitizeText(description)
    .replace(/^This skill should be used when\s*/i, '')
    .replace(/\.?\s*Trigger phrases?:[\s\S]*$/i, '')
    .replace(/^"|"$/g, '')
    .trim()

  return cleaned || 'Official skill imported from anthropics/skills.'
}

function extractWorkflowSteps(text) {
  const steps = []
  const lines = normalizeNewlines(text || '').split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/)
    const bulleted = trimmed.match(/^[-*]\s+(.+)$/)
    const value = numbered ? numbered[1] : bulleted ? bulleted[1] : ''
    const step = sanitizeText(value)
    if (step && !steps.includes(step)) steps.push(step)
  }

  while (steps.length < 3) {
    steps.push(`Follow official workflow step ${steps.length + 1}.`)
  }

  return steps.slice(0, 7)
}

function normalizeEscalation(raw) {
  const value = sanitizeText(raw).toUpperCase()
  if (value === 'REVIEW' || value === 'BLOCK' || value === 'ASK_HUMAN') return value
  return 'ASK_HUMAN'
}

function extractStopConditions(guardrailsText) {
  const lines = normalizeNewlines(guardrailsText || '').split('\n')
  const stopConditions = []
  let capture = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^[-*]?\s*stop conditions?\s*:?$/i.test(trimmed) || /stop conditions?/i.test(trimmed)) {
      capture = true
      continue
    }

    if (!capture) continue

    const bullet = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/)
    if (bullet) {
      const condition = sanitizeText(bullet[1])
      if (condition && !stopConditions.includes(condition)) stopConditions.push(condition)
      continue
    }

    if (/^[A-Za-z][A-Za-z ]+:/.test(trimmed)) {
      capture = false
    }
  }

  if (stopConditions.length > 0) return stopConditions

  for (const line of lines) {
    const trimmed = line.trim()
    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (!bullet) continue
    const condition = sanitizeText(bullet[1])
    if (!condition) continue
    if (/^escalation\s*:/i.test(condition)) continue
    if (/^stop conditions?\s*:?$/i.test(condition)) continue
    if (!stopConditions.includes(condition)) stopConditions.push(condition)
  }

  if (stopConditions.length === 0) {
    return ['Task completed successfully']
  }

  return stopConditions
}

function extractTests(testsText, slug) {
  const normalized = normalizeNewlines(testsText || '')
  const items = []
  const headingRegex = /^###\s+(.+?)\s*$/gm
  const headings = []
  let m

  while ((m = headingRegex.exec(normalized)) !== null) {
    headings.push({ title: sanitizeText(m[1]), index: m.index, end: headingRegex.lastIndex })
  }

  const parseBlock = (name, content) => {
    const inputMatch = content.match(/(?:^|\n)\s*[-*]\s*Input:\s*`?([^`\n]+)`?\s*(?:\n|$)/i)
    const expectedMatch = content.match(/(?:^|\n)\s*[-*]\s*(?:Expected|Expected output):\s*`?([^`\n]+)`?\s*(?:\n|$)/i)
    const input = sanitizeText(inputMatch ? inputMatch[1] : '')
    const expected = sanitizeText(expectedMatch ? expectedMatch[1] : '')
    if (!input || !expected) return
    items.push({
      name: name || 'Official test case',
      input,
      expected_output: expected,
    })
  }

  if (headings.length > 0) {
    for (let i = 0; i < headings.length; i += 1) {
      const current = headings[i]
      const next = headings[i + 1]
      const content = normalized.slice(current.end, next ? next.index : normalized.length)
      parseBlock(current.title, content)
    }
  } else if (normalized.trim()) {
    parseBlock('Official test case', normalized)
  }

  if (items.length === 0) {
    return [
      {
        name: 'Basic validity check',
        input: `Trigger the ${slug} skill in a realistic request.`,
        expected_output: 'The skill executes its documented workflow correctly.',
      },
    ]
  }

  return items
}

function extractTriggers(description, slug, title) {
  const triggers = []
  const desc = sanitizeText(description)

  const quotedRegex = /"([^"]{2,120})"/g
  let m
  while ((m = quotedRegex.exec(desc)) !== null) {
    const phrase = sanitizeText(m[1])
    if (phrase && !triggers.includes(phrase)) triggers.push(phrase)
  }

  if (triggers.length < 3) {
    const marker = desc.match(/Trigger phrases?:\s*([\s\S]+)$/i)
    if (marker) {
      const candidates = marker[1]
        .split(',')
        .map((item) => sanitizeText(item.replace(/^"|"$/g, '')))
        .filter(Boolean)
      for (const candidate of candidates) {
        if (!triggers.includes(candidate)) triggers.push(candidate)
      }
    }
  }

  const fallback = [
    `Use the ${slug} skill`,
    `Help me with ${title.toLowerCase()}`,
    `Run ${slug.replace(/-/g, ' ')}`,
  ]

  for (const phrase of fallback) {
    if (triggers.length >= 5) break
    if (!triggers.includes(phrase)) triggers.push(phrase)
  }

  while (triggers.length < 3) {
    triggers.push(`Use ${slug} scenario ${triggers.length + 1}`)
  }

  return triggers.slice(0, 5)
}

function isLikelyText(filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return true
  if (buffer.includes(0)) return false

  const sample = buffer.subarray(0, Math.min(2048, buffer.length)).toString('utf8')
  const replacements = (sample.match(/\uFFFD/g) || []).length
  const ratio = sample.length === 0 ? 0 : replacements / sample.length
  return ratio < 0.02
}

function guessMime(filePath, isText) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.xml': 'application/xml',
    '.xsd': 'application/xml',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.py': 'text/x-python',
    '.sh': 'text/x-shellscript',
    '.sql': 'application/sql',
    '.ttf': 'font/ttf',
    '.pdf': 'application/pdf',
    '.gz': 'application/gzip',
  }
  if (map[ext]) return map[ext]
  return isText ? 'text/plain' : 'application/octet-stream'
}

function mapSupportingFilePath(relativePath) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = clean.split('/').filter(Boolean)
  const top = parts[0] || ''

  if (top === 'reference' && parts.length > 1) {
    return ['references', ...parts.slice(1)].join('/')
  }

  if (ALLOWED_DIRS.has(top)) {
    return parts.join('/')
  }

  return ['assets', 'upstream', ...parts].join('/')
}

function dedupePath(targetPath, usedPaths) {
  if (!usedPaths.has(targetPath)) {
    usedPaths.add(targetPath)
    return targetPath
  }

  const ext = path.extname(targetPath)
  const noExt = ext ? targetPath.slice(0, -ext.length) : targetPath
  let i = 2
  while (true) {
    const candidate = `${noExt}__dup${i}${ext}`
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate)
      return candidate
    }
    i += 1
  }
}

function buildSkillSourceSha(skillMarkdownSha, files) {
  const payload = [
    `skill_md:${skillMarkdownSha}`,
    ...files
      .map((f) => `${f.sourcePath}:${f.sourceSha}`)
      .sort(),
  ].join('\n')
  return toSha256(payload)
}

function parseSkillMarkdown(skillName, markdownText) {
  const { frontmatter, body } = parseFrontmatter(markdownText)
  const h1Match = body.match(/^#\s+(.+)$/m)

  const sections = parseSections(body)

  const fmName = sanitizeText(frontmatter.name)
  const slug = normalizeSlug(fmName, skillName)
  const title = sanitizeText(h1Match ? h1Match[1] : '') || toTitle(slug)

  const fmDesc = sanitizeText(frontmatter.description)
  const summary =
    pickSection(sections, ['purpose']) ||
    descriptionToSummary(fmDesc) ||
    `Official ${title} skill.`

  const inputs = pickSection(sections, ['inputs']) || 'Follow the user request and provided context.'
  const outputs = pickSection(sections, ['outputs']) || 'Return the expected artifact as defined by the skill.'
  const workflow = pickSection(sections, ['workflow'])
  const steps = extractWorkflowSteps(workflow)
  const risks = pickSection(sections, ['pitfalls', 'risks']) || 'Follow the guardrails and stop when risk is identified.'

  const guardrailsText = pickSection(sections, ['guardrails'])
  const escalationMatch = guardrailsText.match(/Escalation:\s*([A-Za-z_]+)/i)
  const escalation = normalizeEscalation(escalationMatch ? escalationMatch[1] : 'ASK_HUMAN')
  const stop_conditions = extractStopConditions(guardrailsText)

  const allowedTools = Array.isArray(frontmatter['allowed-tools'])
    ? frontmatter['allowed-tools'].map((item) => String(item)).filter(Boolean)
    : []

  const guardrails = {
    allowed_tools: allowedTools,
    disable_model_invocation: Boolean(frontmatter['disable-model-invocation']),
    user_invocable: frontmatter['user-invocable'] === undefined ? true : Boolean(frontmatter['user-invocable']),
    stop_conditions,
    escalation,
  }

  const testsText = pickSection(sections, ['tests'])
  const tests = extractTests(testsText, slug)

  const triggers = extractTriggers(fmDesc, slug, title)

  return {
    slug,
    title,
    summary: sanitizeText(summary),
    inputs: sanitizeText(inputs),
    outputs: sanitizeText(outputs),
    steps,
    risks: sanitizeText(risks),
    triggers,
    guardrails,
    tests,
  }
}

async function downloadUpstreamZip(repo, ref) {
  const url = `https://codeload.github.com/${repo}/zip/${encodeURIComponent(ref)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download upstream zip: ${response.status} ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return new AdmZip(bytes)
}

function collectOfficialSkillsFromZip(zip) {
  const groups = new Map()

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue

    const rawPath = String(entry.entryName || '').replace(/^\/+/, '')
    const parts = rawPath.split('/').filter(Boolean)
    if (parts.length < 4) continue
    if (parts[1] !== 'skills') continue

    const skillName = parts[2]
    if (!skillName || skillName.startsWith('.')) continue

    const relativePath = parts.slice(3).join('/')
    if (!relativePath) continue

    if (!groups.has(skillName)) groups.set(skillName, [])
    groups.get(skillName).push({
      relativePath,
      buffer: entry.getData(),
    })
  }

  return groups
}

function buildSkillPackage(skillName, entries) {
  const warnings = []
  const files = []
  const usedPaths = new Set()

  const skillMarkdownEntry = entries.find((item) => item.relativePath.toLowerCase() === 'skill.md')
  if (!skillMarkdownEntry) {
    throw new Error('SKILL.md not found')
  }

  const markdownBuffer = skillMarkdownEntry.buffer
  const markdownText = markdownBuffer.toString('utf8')
  const skillData = parseSkillMarkdown(skillName, markdownText)
  const skillMarkdownSha = toSha256(markdownBuffer)

  for (const item of entries) {
    if (item.relativePath.toLowerCase() === 'skill.md') continue

    const sourcePath = item.relativePath.replace(/\\/g, '/')
    let mappedPath = mapSupportingFilePath(sourcePath)
    mappedPath = dedupePath(mappedPath, usedPaths)

    const fileSha = toSha256(item.buffer)
    const isText = isLikelyText(sourcePath, item.buffer)

    if (!isText && item.buffer.length > BINARY_MAX) {
      warnings.push(`Skip oversized binary file (>2MB): ${sourcePath}`)
      continue
    }

    if (isText && item.buffer.length > TEXT_MAX) {
      warnings.push(`File exceeds 200KB text threshold, stored as binary: ${sourcePath}`)
    }

    const storeAsBinary = !isText || item.buffer.length > TEXT_MAX
    files.push({
      path: mappedPath,
      mime: guessMime(sourcePath, !storeAsBinary),
      isBinary: storeAsBinary,
      contentText: storeAsBinary ? null : item.buffer.toString('utf8'),
      contentBytes: storeAsBinary ? item.buffer : null,
      sourcePath,
      sourceSha: fileSha,
    })
  }

  const sourceSha = buildSkillSourceSha(skillMarkdownSha, files)

  return {
    skillName,
    skillData,
    files,
    sourceSha,
    warnings,
  }
}

function classifySyncAction(existingSkill, packageInfo) {
  if (!existingSkill) return { action: 'create', reason: 'new skill' }

  if (existingSkill.sourceManaged !== true) {
    return { action: 'conflict', reason: 'existing local skill is not source-managed' }
  }

  if (existingSkill.sourceRepo && existingSkill.sourceRepo !== UPSTREAM_REPO) {
    return { action: 'conflict', reason: `existing source repo differs (${existingSkill.sourceRepo})` }
  }

  if (existingSkill.sourceSha && existingSkill.sourceSha === packageInfo.sourceSha) {
    return { action: 'skip', reason: 'source sha unchanged' }
  }

  return { action: 'update', reason: 'source changed' }
}

function printReportHeader(options, skillCount) {
  console.log('=== Anthropic Official Skills Sync ===')
  console.log(`repo: ${UPSTREAM_REPO}`)
  console.log(`ref: ${options.ref}`)
  console.log(`mode: ${options.apply ? 'apply' : 'dry-run'}`)
  console.log(`skills discovered: ${skillCount}`)
  console.log('')
}

function printSkillLine(status, skillSlug, message) {
  const prefix = {
    create: '[CREATE]',
    update: '[UPDATE]',
    skip: '[SKIP]',
    conflict: '[CONFLICT]',
    error: '[ERROR]',
  }[status] || '[INFO]'

  console.log(`${prefix} ${skillSlug} - ${message}`)
}

function isPrismaCode(err, code) {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === code)
}

function toSkillSnapshot(skill) {
  const guardrailsRaw = skill && typeof skill.guardrails === 'object' && skill.guardrails ? skill.guardrails : {}
  const escalation = normalizeEscalation(guardrailsRaw.escalation || 'ASK_HUMAN')

  const stopConditions = Array.isArray(guardrailsRaw.stop_conditions)
    ? guardrailsRaw.stop_conditions.map((item) => String(item))
    : ['Task completed successfully']

  return {
    slug: String(skill.slug || ''),
    title: String(skill.title || ''),
    status: String(skill.status || 'draft'),
    summary: String(skill.summary || ''),
    inputs: String(skill.inputs || ''),
    outputs: String(skill.outputs || ''),
    steps: Array.isArray(skill.steps) ? skill.steps.map((item) => String(item)) : [],
    risks: String(skill.risks || ''),
    triggers: Array.isArray(skill.triggers) ? skill.triggers.map((item) => String(item)) : [],
    guardrails: {
      allowed_tools: Array.isArray(guardrailsRaw.allowed_tools)
        ? guardrailsRaw.allowed_tools.map((item) => String(item))
        : [],
      disable_model_invocation: Boolean(guardrailsRaw.disable_model_invocation),
      user_invocable: guardrailsRaw.user_invocable === undefined ? true : Boolean(guardrailsRaw.user_invocable),
      stop_conditions: stopConditions.length > 0 ? stopConditions : ['Task completed successfully'],
      escalation,
    },
    tests: Array.isArray(skill.tests)
      ? skill.tests.map((test) => ({
          name: String(test.name || ''),
          input: String(test.input || ''),
          expected_output: String(test.expected_output || ''),
        }))
      : [],
    tags: Array.isArray(skill.tags) ? skill.tags.map((item) => String(item.tag.name)) : [],
  }
}

async function createVersionIfAvailable(tx, skillId, snapshot) {
  if (!tx || typeof tx !== 'object' || !('skillVersion' in tx)) return

  try {
    const latest = await tx.skillVersion.findFirst({
      where: { skillId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latest ? latest.version : 0) + 1
    await tx.skillVersion.create({
      data: {
        skillId,
        version: nextVersion,
        snapshot,
      },
    })
  } catch (err) {
    if (isPrismaCode(err, 'P2021') || isPrismaCode(err, 'P2022')) return
    throw err
  }
}

async function main() {
  loadEnvFiles()
  const options = parseArgs(process.argv)

  const prisma = new PrismaClient()
  try {
    const zip = await downloadUpstreamZip(UPSTREAM_REPO, options.ref)
    const groups = collectOfficialSkillsFromZip(zip)

    const skillNames = Array.from(groups.keys()).sort()
    printReportHeader(options, skillNames.length)

    const packages = []
    for (const skillName of skillNames) {
      try {
        const pkg = buildSkillPackage(skillName, groups.get(skillName) || [])
        packages.push(pkg)
      } catch (err) {
        printSkillLine('error', skillName, err instanceof Error ? err.message : 'unknown parse error')
      }
    }

    const slugs = packages.map((pkg) => pkg.skillData.slug)
    const existingSkills = await prisma.skill.findMany({
      where: { slug: { in: slugs } },
      include: {
        tags: { include: { tag: true } },
      },
    })
    const existingBySlug = new Map(existingSkills.map((skill) => [skill.slug, skill]))

    const decisions = packages.map((pkg) => {
      const existing = existingBySlug.get(pkg.skillData.slug)
      const decision = classifySyncAction(existing, pkg)
      return { pkg, existing, decision }
    })

    const summary = {
      create: 0,
      update: 0,
      skip: 0,
      conflict: 0,
      error: 0,
      filesImported: 0,
      warnings: 0,
    }

    if (!options.apply) {
      for (const row of decisions) {
        summary[row.decision.action] += 1
        summary.filesImported += row.pkg.files.length
        summary.warnings += row.pkg.warnings.length
        printSkillLine(row.decision.action, row.pkg.skillData.slug, `${row.decision.reason}; files=${row.pkg.files.length}`)
        for (const warning of row.pkg.warnings.slice(0, 2)) {
          console.log(`  - note: ${warning}`)
        }
      }

      console.log('')
      console.log('--- Dry-run summary ---')
      console.log(`create: ${summary.create}`)
      console.log(`update: ${summary.update}`)
      console.log(`skip: ${summary.skip}`)
      console.log(`conflict: ${summary.conflict}`)
      console.log(`warnings: ${summary.warnings}`)
      console.log(`supporting files (post-mapping): ${summary.filesImported}`)
      return
    }

    const officialTag = await prisma.tag.upsert({
      where: { name: OFFICIAL_TAG },
      update: {},
      create: { name: OFFICIAL_TAG },
    })

    for (const row of decisions) {
      const { pkg, existing, decision } = row
      summary[decision.action] += 1
      summary.filesImported += pkg.files.length
      summary.warnings += pkg.warnings.length

      if (decision.action === 'skip') {
        printSkillLine('skip', pkg.skillData.slug, decision.reason)
        continue
      }
      if (decision.action === 'conflict') {
        printSkillLine('conflict', pkg.skillData.slug, decision.reason)
        continue
      }

      try {
        await prisma.$transaction(async (tx) => {
          const now = new Date()
          let skillId = existing ? existing.id : null

          if (decision.action === 'create') {
            const created = await tx.skill.create({
              data: {
                title: pkg.skillData.title,
                slug: pkg.skillData.slug,
                status: 'draft',
                summary: pkg.skillData.summary,
                inputs: pkg.skillData.inputs,
                outputs: pkg.skillData.outputs,
                steps: pkg.skillData.steps,
                risks: pkg.skillData.risks,
                triggers: pkg.skillData.triggers,
                guardrails: pkg.skillData.guardrails,
                tests: pkg.skillData.tests,
                sourceRepo: UPSTREAM_REPO,
                sourcePath: `skills/${pkg.skillName}`,
                sourceRef: options.ref,
                sourceSha: pkg.sourceSha,
                sourceManaged: true,
                lastSyncedAt: now,
                createdBy: 'SYS:anthropic-sync',
                updatedBy: 'SYS:anthropic-sync',
                tags: {
                  create: [{ tagId: officialTag.id }],
                },
              },
            })
            skillId = created.id
          } else if (decision.action === 'update' && skillId) {
            await tx.skill.update({
              where: { id: skillId },
              data: {
                title: pkg.skillData.title,
                status: 'draft',
                summary: pkg.skillData.summary,
                inputs: pkg.skillData.inputs,
                outputs: pkg.skillData.outputs,
                steps: pkg.skillData.steps,
                risks: pkg.skillData.risks,
                triggers: pkg.skillData.triggers,
                guardrails: pkg.skillData.guardrails,
                tests: pkg.skillData.tests,
                sourceRepo: UPSTREAM_REPO,
                sourcePath: `skills/${pkg.skillName}`,
                sourceRef: options.ref,
                sourceSha: pkg.sourceSha,
                sourceManaged: true,
                lastSyncedAt: now,
                updatedBy: 'SYS:anthropic-sync',
              },
            })

            await tx.skillTag.upsert({
              where: { skillId_tagId: { skillId, tagId: officialTag.id } },
              update: {},
              create: { skillId, tagId: officialTag.id },
            })
          }

          if (!skillId) {
            throw new Error('failed to resolve skill id')
          }

          await tx.skillFile.deleteMany({ where: { skillId } })

          if (pkg.files.length > 0) {
            await tx.skillFile.createMany({
              data: pkg.files.map((file) => ({
                skillId,
                path: file.path,
                mime: file.mime,
                isBinary: file.isBinary,
                contentText: file.contentText,
                contentBytes: file.contentBytes,
                sourcePath: file.sourcePath,
                sourceSha: file.sourceSha,
              })),
            })
          }

          const snapshotSkill = await tx.skill.findUnique({
            where: { id: skillId },
            include: {
              tags: { include: { tag: true } },
            },
          })

          if (snapshotSkill) {
            await createVersionIfAvailable(tx, skillId, toSkillSnapshot(snapshotSkill))
          }
        })

        printSkillLine(decision.action, pkg.skillData.slug, `${decision.reason}; files=${pkg.files.length}`)
        for (const warning of pkg.warnings.slice(0, 2)) {
          console.log(`  - note: ${warning}`)
        }
      } catch (err) {
        summary.error += 1
        printSkillLine('error', pkg.skillData.slug, err instanceof Error ? err.message : 'unknown write error')
      }
    }

    console.log('')
    console.log('--- Apply summary ---')
    console.log(`create: ${summary.create}`)
    console.log(`update: ${summary.update}`)
    console.log(`skip: ${summary.skip}`)
    console.log(`conflict: ${summary.conflict}`)
    console.log(`error: ${summary.error}`)
    console.log(`warnings: ${summary.warnings}`)
    console.log(`supporting files synced: ${summary.filesImported}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err)
  process.exit(1)
})
