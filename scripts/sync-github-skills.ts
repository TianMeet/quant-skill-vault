/**
 * 从 /tmp/skills-sync/ 目录读取所有 SKILL.md，解析 frontmatter 并同步到数据库
 */
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const SYNC_DIR = '/tmp/skills-sync'

interface SkillFrontmatter {
  name: string
  description: string
}

function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error('No frontmatter found')

  const raw = match[1]
  const body = match[2].trim()

  // Simple YAML parse for name and description
  let name = ''
  let description = ''

  for (const line of raw.split('\n')) {
    if (line.startsWith('name:')) {
      name = line.replace('name:', '').trim()
    }
    if (line.startsWith('description:')) {
      description = line.replace('description:', '').trim()
      // Remove surrounding quotes
      if ((description.startsWith('"') && description.endsWith('"')) ||
          (description.startsWith("'") && description.endsWith("'"))) {
        description = description.slice(1, -1)
      }
    }
  }

  // Handle multi-line description (indented continuation)
  if (!description) {
    const descMatch = raw.match(/description:\s*["|']?([\s\S]*?)["|']?\n(?=\w|$)/m)
    if (descMatch) description = descMatch[1].trim()
  }

  return { frontmatter: { name, description }, body }
}

function extractTitle(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function extractSections(body: string): { summary: string; steps: string[] } {
  // Take first paragraph as summary
  const paragraphs = body.split('\n\n').filter((p) => p.trim() && !p.startsWith('#'))
  const summary = paragraphs[0]?.replace(/\n/g, ' ').trim().slice(0, 500) || ''

  // Extract numbered or bulleted items as steps
  const stepMatches = body.match(/^\d+\.\s+.+$/gm) || []
  const steps = stepMatches.slice(0, 7).map((s) => s.replace(/^\d+\.\s+/, '').trim())
  if (steps.length < 3) {
    // Fallback: use headings as steps
    const headings = body.match(/^##\s+.+$/gm) || []
    for (const h of headings) {
      if (steps.length >= 7) break
      const step = h.replace(/^#+\s+/, '').trim()
      if (!steps.includes(step)) steps.push(step)
    }
  }
  // Ensure at least 3 steps
  while (steps.length < 3) steps.push(`Step ${steps.length + 1}: Follow skill instructions`)

  return { summary, steps: steps.slice(0, 7) }
}

function extractTriggers(description: string, name: string): string[] {
  // Try to extract trigger phrases from description
  const triggers: string[] = []

  // Common patterns
  triggers.push(`use the ${name} skill`)
  triggers.push(`help me with ${name.replace(/-/g, ' ')}`)

  // Extract "when" clauses
  const whenMatch = description.match(/when\s+(.{10,80}?)(?:\.|,|$)/gi)
  if (whenMatch) {
    for (const m of whenMatch.slice(0, 3)) {
      triggers.push(m.trim().replace(/^when\s+/i, '').replace(/\.$/, ''))
    }
  }

  // Ensure at least 3
  if (triggers.length < 3) {
    triggers.push(`create ${name.replace(/-/g, ' ')}`)
  }

  return triggers.slice(0, 5)
}

async function main() {
  const files = fs.readdirSync(SYNC_DIR).filter((f) => f.endsWith('.md'))
  console.log(`Found ${files.length} skills to sync`)

  // Upsert a tag for synced skills
  const tag = await prisma.tag.upsert({
    where: { name: 'anthropic-official' },
    update: {},
    create: { name: 'anthropic-official' },
  })

  let synced = 0
  let skipped = 0

  for (const file of files) {
    const content = fs.readFileSync(path.join(SYNC_DIR, file), 'utf-8')
    const slug = file.replace('.md', '')

    try {
      const { frontmatter, body } = parseFrontmatter(content)
      const title = extractTitle(frontmatter.name || slug)
      const { summary, steps } = extractSections(body)
      const triggers = extractTriggers(frontmatter.description, frontmatter.name || slug)
      const description = frontmatter.description || summary

      // Check if already exists
      const existing = await prisma.skill.findUnique({ where: { slug } })
      if (existing) {
        console.log(`  Skip (exists): ${slug}`)
        skipped++
        continue
      }

      await prisma.skill.create({
        data: {
          title,
          slug,
          summary: description.slice(0, 1024),
          inputs: 'User request matching skill triggers',
          outputs: `Skill-specific output for ${title}`,
          steps,
          risks: 'Follow skill guardrails and escalation policies',
          triggers,
          guardrails: {
            escalation: 'ASK_HUMAN',
            user_invocable: true,
            disable_model_invocation: false,
            allowed_tools: [],
            stop_conditions: ['User requests to stop', 'Task completed successfully', 'Error encountered that requires human intervention'],
          },
          tests: [
            {
              name: `Basic ${title} test`,
              input: `Trigger: "${triggers[0]}"`,
              expected_output: `Skill activates and produces ${slug} output`,
            },
          ],
          tags: {
            create: [{ tagId: tag.id }],
          },
        },
      })
      console.log(`  Synced: ${slug}`)
      synced++
    } catch (err) {
      console.error(`  Error syncing ${slug}:`, (err as Error).message)
    }
  }

  console.log(`\nDone: ${synced} synced, ${skipped} skipped`)
  await prisma.$disconnect()
}

main()
