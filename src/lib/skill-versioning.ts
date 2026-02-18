import { z } from 'zod/v4'

type SkillWithTags = {
  id: number
  slug: string
  title: string
  status: string
  summary: string
  inputs: string
  outputs: string
  steps: unknown
  risks: string
  triggers: unknown
  guardrails: unknown
  tests: unknown
  tags: Array<{ tag: { name: string } }>
}

export const VERSIONING_NOT_READY_MESSAGE =
  'Versioning is not initialized. Run pnpm db:generate:local and pnpm db:push:local, then restart dev server.'

export const skillSnapshotSchema = z.object({
  slug: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  status: z.string().min(1).max(20).default('draft'),
  summary: z.string(),
  inputs: z.string(),
  outputs: z.string(),
  steps: z.array(z.string()),
  risks: z.string(),
  triggers: z.array(z.string()),
  guardrails: z.object({
    allowed_tools: z.array(z.string()).default([]),
    disable_model_invocation: z.boolean().default(false),
    user_invocable: z.boolean().default(true),
    stop_conditions: z.array(z.string()).default([]),
    escalation: z.enum(['REVIEW', 'BLOCK', 'ASK_HUMAN']),
  }),
  tests: z.array(
    z.object({
      name: z.string(),
      input: z.string(),
      expected_output: z.string(),
    })
  ),
  tags: z.array(z.string()),
})

export type SkillSnapshot = z.infer<typeof skillSnapshotSchema>

export type SkillVersionRepo = {
  findFirst: (args: {
    where: { skillId: number }
    orderBy: { version: 'desc' }
    select: { version: true }
  }) => Promise<{ version: number } | null>
  create: (args: {
    data: { skillId: number; version: number; snapshot: SkillSnapshot }
  }) => Promise<{ id: number; version: number }>
}

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

export function isVersioningSchemaNotReadyError(err: unknown): boolean {
  if (isPrismaCode(err, 'P2021') || isPrismaCode(err, 'P2022')) return true
  const message = err instanceof Error ? err.message : ''
  return message.includes('skill_versions') || message.includes('skill_publications')
}

export function hasSkillVersioning(
  client: unknown
): client is { skillVersion: SkillVersionRepo } {
  return !!client && typeof client === 'object' && 'skillVersion' in client
}

export function hasSkillPublication(
  client: unknown
): client is {
  skillPublication: {
    findMany: (...args: unknown[]) => Promise<unknown>
    create: (...args: unknown[]) => Promise<unknown>
  }
} {
  return !!client && typeof client === 'object' && 'skillPublication' in client
}

export async function createSkillVersionIfAvailable(
  client: unknown,
  skillId: number,
  snapshot: SkillSnapshot
) {
  if (!hasSkillVersioning(client)) return null
  try {
    return await createSkillVersion(client.skillVersion, skillId, snapshot)
  } catch (err) {
    if (isVersioningSchemaNotReadyError(err)) return null
    throw err
  }
}

export function toSkillSnapshot(skill: SkillWithTags): SkillSnapshot {
  return {
    slug: skill.slug,
    title: skill.title,
    status: skill.status || 'draft',
    summary: skill.summary,
    inputs: skill.inputs,
    outputs: skill.outputs,
    steps: Array.isArray(skill.steps) ? skill.steps.map((item) => String(item)) : [],
    risks: skill.risks,
    triggers: Array.isArray(skill.triggers) ? skill.triggers.map((item) => String(item)) : [],
    guardrails:
      skill.guardrails && typeof skill.guardrails === 'object'
        ? (skill.guardrails as SkillSnapshot['guardrails'])
        : {
            allowed_tools: [],
            disable_model_invocation: false,
            user_invocable: true,
            stop_conditions: [],
            escalation: 'ASK_HUMAN',
          },
    tests: Array.isArray(skill.tests)
      ? (skill.tests as SkillSnapshot['tests'])
      : [],
    tags: skill.tags.map((item) => item.tag.name),
  }
}

export function parseSkillSnapshot(raw: unknown): SkillSnapshot | null {
  const parsed = skillSnapshotSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}

export async function createSkillVersion(
  repo: SkillVersionRepo,
  skillId: number,
  snapshot: SkillSnapshot
) {
  const latest = await repo.findFirst({
    where: { skillId },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const nextVersion = (latest?.version || 0) + 1
  return repo.create({
    data: {
      skillId,
      version: nextVersion,
      snapshot,
    },
  })
}
