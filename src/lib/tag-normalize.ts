export const TAG_NAME_MAX_LENGTH = 100

export function normalizeTagName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeTagNames(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return []

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    const next = normalizeTagName(String(value))
    if (!next || seen.has(next)) continue
    seen.add(next)
    normalized.push(next)
  }

  return normalized
}

export function validateTagName(name: string): string | null {
  if (!name) return 'Tag name is required'
  if (name.length > TAG_NAME_MAX_LENGTH) {
    return `Tag name too long (max ${TAG_NAME_MAX_LENGTH} characters)`
  }
  return null
}
