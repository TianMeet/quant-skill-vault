#!/usr/bin/env node

const { validateSkillDirectory } = require('./skill-local-utils')

function usageAndExit() {
  console.log('Usage: node scripts/quick-validate-skill.js <skill-dir | SKILL.md>')
  process.exit(1)
}

function printMessages(prefix, messages) {
  for (const msg of messages) {
    console.log(`${prefix} ${msg}`)
  }
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const [target] = args
  if (!target) usageAndExit()

  let result
  try {
    result = validateSkillDirectory(target)
  } catch (err) {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  }

  console.log(`Skill path: ${result.skillDir}`)
  console.log(`Skill name: ${result.frontmatter.name || '(missing)'}`)

  if (result.errors.length === 0) {
    console.log('✅ Validation passed')
  } else {
    console.log('❌ Validation failed')
    printMessages('  -', result.errors)
  }

  if (result.warnings.length > 0) {
    console.log('⚠️ Warnings:')
    printMessages('  -', result.warnings)
  }

  process.exit(result.errors.length > 0 ? 1 : 0)
}

main()
