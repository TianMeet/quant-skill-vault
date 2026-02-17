#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function usageAndExit() {
  console.log('Usage: node scripts/init-local-skill.js <skill-name> [target-dir]')
  console.log('Example: node scripts/init-local-skill.js "factor-research" ./local-skills')
  process.exit(1)
}

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const [rawName, rawTargetDir] = args
if (!rawName) usageAndExit()

const skillName = slugify(rawName)
if (!skillName) {
  console.error('Invalid skill name after slugify')
  process.exit(1)
}

const targetBase = path.resolve(rawTargetDir || 'local-skills')
const skillDir = path.join(targetBase, skillName)

if (fs.existsSync(skillDir)) {
  console.error(`Skill directory already exists: ${skillDir}`)
  process.exit(1)
}

fs.mkdirSync(skillDir, { recursive: true })
for (const dir of ['references', 'examples', 'scripts', 'assets', 'templates']) {
  fs.mkdirSync(path.join(skillDir, dir), { recursive: true })
  fs.writeFileSync(path.join(skillDir, dir, '.gitkeep'), '')
}

const skillMd = `---
name: ${skillName}
description: This skill should be used when you need to ${skillName.replace(/-/g, ' ')}.
allowed-tools: []
disable-model-invocation: false
user-invocable: true
---

# ${skillName.replace(/-/g, ' ').replace(/\\b\\w/g, (s) => s.toUpperCase())}

## Purpose

Briefly explain what this skill solves and when to use it.

## Inputs

- Input 1
- Input 2

## Outputs

- Output format and quality bar

## Workflow

1. Step 1 in imperative style.
2. Step 2 in imperative style.
3. Step 3 in imperative style.

## Guardrails

- Escalation: ASK_HUMAN
- Stop conditions:
  - Missing required input
  - Risky operation detected

## Tests

### Basic smoke test

- Input: \`sample request\`
- Expected: \`stable, structured response\`

## Supporting files

### references

- [references/README.md](references/README.md)
`

fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf8')
fs.writeFileSync(path.join(skillDir, 'references', 'README.md'), '# References\n\nPut background references here.\n', 'utf8')

console.log(`✅ Initialized skill at: ${skillDir}`)
console.log('')
console.log('Next steps:')
console.log(`1) Edit: ${path.join(skillDir, 'SKILL.md')}`)
console.log(`2) Validate: pnpm skill:validate -- ${skillDir}`)
console.log(`3) Package:  pnpm skill:package -- ${skillDir}`)
