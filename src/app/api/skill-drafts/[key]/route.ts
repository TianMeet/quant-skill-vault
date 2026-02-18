import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ key: string }> }

type DraftPutBody = {
  mode?: string
  skillId?: number | null
  payload?: Record<string, unknown>
  expectedVersion?: number
}

const DRAFT_KEY_REGEX = /^[a-z0-9:_-]{1,120}$/i
const ALLOWED_MODES = new Set(['new', 'edit'])

function isPrismaCode(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === code
}

function parseSkillId(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

function validateDraftKey(rawKey: string): string | null {
  const key = (rawKey || '').trim()
  if (!DRAFT_KEY_REGEX.test(key)) return null
  return key
}

/**
 * GET /api/skill-drafts/:key
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { key: rawKey } = await params
  const key = validateDraftKey(rawKey)
  if (!key) return NextResponse.json({ error: 'Invalid draft key' }, { status: 400 })

  const draft = await prisma.skillDraft.findUnique({ where: { draftKey: key } })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  return NextResponse.json({
    id: draft.id,
    key: draft.draftKey,
    mode: draft.mode,
    skillId: draft.skillId,
    payload: draft.payload,
    version: draft.version,
    updatedAt: draft.updatedAt.toISOString(),
  })
}

/**
 * PUT /api/skill-drafts/:key
 * upsert 草稿，并维护 version
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { key: rawKey } = await params
  const key = validateDraftKey(rawKey)
  if (!key) return NextResponse.json({ error: 'Invalid draft key' }, { status: 400 })

  let body: DraftPutBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : ''
  if (!ALLOWED_MODES.has(mode)) {
    return NextResponse.json({ error: 'mode must be new or edit' }, { status: 400 })
  }

  const skillId = parseSkillId(body.skillId)
  if (body.skillId !== undefined && body.skillId !== null && skillId === null) {
    return NextResponse.json({ error: 'Invalid skillId' }, { status: 400 })
  }

  if (skillId) {
    const existingSkill = await prisma.skill.findUnique({ where: { id: skillId } })
    if (!existingSkill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  }

  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    return NextResponse.json({ error: 'payload must be an object' }, { status: 400 })
  }

  const expectedVersion =
    body.expectedVersion === undefined || body.expectedVersion === null
      ? null
      : Number(body.expectedVersion)
  if (
    expectedVersion !== null &&
    (!Number.isInteger(expectedVersion) || expectedVersion <= 0)
  ) {
    return NextResponse.json({ error: 'expectedVersion must be a positive integer' }, { status: 400 })
  }

  const existing = await prisma.skillDraft.findUnique({ where: { draftKey: key } })
  if (existing && expectedVersion !== null && existing.version !== expectedVersion) {
    return NextResponse.json(
      {
        error: 'Draft version conflict',
        currentVersion: existing.version,
      },
      { status: 409 }
    )
  }

  const saved = existing
    ? await prisma.skillDraft.update({
        where: { draftKey: key },
        data: {
          mode,
          skillId,
          payload: body.payload,
          version: existing.version + 1,
        },
      })
    : await prisma.skillDraft.create({
        data: {
          draftKey: key,
          mode,
          skillId,
          payload: body.payload,
          version: 1,
        },
      })

  return NextResponse.json({
    id: saved.id,
    key: saved.draftKey,
    mode: saved.mode,
    skillId: saved.skillId,
    payload: saved.payload,
    version: saved.version,
    updatedAt: saved.updatedAt.toISOString(),
  })
}

/**
 * DELETE /api/skill-drafts/:key
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { key: rawKey } = await params
  const key = validateDraftKey(rawKey)
  if (!key) return NextResponse.json({ error: 'Invalid draft key' }, { status: 400 })

  try {
    await prisma.skillDraft.delete({ where: { draftKey: key } })
  } catch (err) {
    if (isPrismaCode(err, 'P2025')) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
