#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function normalizeTagName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function main() {
  const tags = await prisma.tag.findMany({
    orderBy: { id: 'asc' },
    include: { skills: { select: { skillId: true } } },
  })

  if (tags.length === 0) {
    console.log('No tags found. Nothing to normalize.')
    return
  }

  const groups = new Map()
  for (const tag of tags) {
    const normalized = normalizeTagName(tag.name)
    const list = groups.get(normalized) || []
    list.push(tag)
    groups.set(normalized, list)
  }

  let renamed = 0
  let merged = 0
  let removedEmpty = 0

  for (const [normalized, group] of groups.entries()) {
    if (!normalized) {
      for (const tag of group) {
        await prisma.$transaction(async (tx) => {
          await tx.skillTag.deleteMany({ where: { tagId: tag.id } })
          await tx.tag.delete({ where: { id: tag.id } })
        })
        removedEmpty += 1
      }
      continue
    }

    const keeper = group[0]
    const duplicates = group.slice(1)

    if (keeper.name !== normalized) {
      await prisma.tag.update({
        where: { id: keeper.id },
        data: { name: normalized },
      })
      renamed += 1
    }

    for (const source of duplicates) {
      await prisma.$transaction(async (tx) => {
        for (const rel of source.skills) {
          await tx.skillTag.upsert({
            where: { skillId_tagId: { skillId: rel.skillId, tagId: keeper.id } },
            update: {},
            create: { skillId: rel.skillId, tagId: keeper.id },
          })
        }
        await tx.skillTag.deleteMany({ where: { tagId: source.id } })
        await tx.tag.delete({ where: { id: source.id } })
      })
      merged += 1
    }
  }

  console.log(`Tag normalization completed: renamed=${renamed}, merged=${merged}, removed_empty=${removedEmpty}`)
}

main()
  .catch((err) => {
    console.error('Tag normalization failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
