#!/usr/bin/env node

const path = require('path')
const AdmZip = require('adm-zip')
const { validateSkillDirectory, collectFilesRecursively } = require('./skill-local-utils')

function usageAndExit() {
  console.log('Usage: node scripts/package-local-skill.js <skill-dir | SKILL.md> [output-dir]')
  process.exit(1)
}

function packageSkill(skillDir, outputDir, skillName) {
  const zip = new AdmZip()
  const files = collectFilesRecursively(skillDir)

  for (const absPath of files) {
    const relInSkill = path.relative(skillDir, absPath)
    const zipEntryPath = path.join(skillName, relInSkill)
    zip.addLocalFile(absPath, path.dirname(zipEntryPath), path.basename(zipEntryPath))
  }

  const outFile = path.join(outputDir, `${skillName}.skill`)
  zip.writeZip(outFile)
  return outFile
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--')
  const [target, rawOutputDir] = args
  if (!target) usageAndExit()

  let result
  try {
    result = validateSkillDirectory(target)
  } catch (err) {
    console.error(`❌ ${err.message}`)
    process.exit(1)
  }

  if (result.errors.length > 0) {
    console.error('❌ Validation failed, abort packaging:')
    for (const e of result.errors) {
      console.error(`  - ${e}`)
    }
    process.exit(1)
  }

  if (result.warnings.length > 0) {
    console.log('⚠️ Warnings (packaging continues):')
    for (const w of result.warnings) {
      console.log(`  - ${w}`)
    }
  }

  const outputDir = path.resolve(rawOutputDir || path.dirname(result.skillDir))
  const outFile = packageSkill(result.skillDir, outputDir, result.skillDirName)

  console.log(`✅ Packaged skill: ${outFile}`)
}

main()
