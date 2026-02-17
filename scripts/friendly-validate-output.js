function extractMatch(text, regex, groupIndex = 1) {
  const match = text.match(regex)
  if (!match) return ''
  return match[groupIndex] || ''
}

function mapValidationError(raw) {
  if (raw === 'frontmatter.name is required') {
    return {
      area: 'name',
      message: 'Missing required field: frontmatter.name',
      suggestion: 'Set a slug-like skill name, for example: quant-review-skill.',
    }
  }

  if (raw === 'frontmatter.name must match ^[a-z0-9-]{1,64}$') {
    return {
      area: 'name',
      message: 'Skill name format is invalid.',
      suggestion: 'Use only lowercase letters, numbers, and hyphens (1-64 chars).',
    }
  }

  if (raw === 'frontmatter.description is required') {
    return {
      area: 'description',
      message: 'Missing required field: frontmatter.description',
      suggestion: 'Write one clear sentence about when this skill should be used.',
    }
  }

  if (raw.startsWith('frontmatter.description must be <=')) {
    const max = extractMatch(raw, /<=\s*(\d+)\s*chars/i)
    return {
      area: 'description',
      message: `Description is too long${max ? ` (max ${max} chars)` : ''}.`,
      suggestion: 'Shorten the description and remove repeated phrases.',
    }
  }

  if (raw === 'frontmatter.allowed-tools must be string[]') {
    return {
      area: 'allowed-tools',
      message: 'allowed-tools has an invalid format.',
      suggestion: 'Provide an array of strings, for example: ["Bash", "Read", "Write"].',
    }
  }

  if (raw === 'frontmatter.disable-model-invocation must be boolean') {
    return {
      area: 'disable-model-invocation',
      message: 'disable-model-invocation must be true or false.',
      suggestion: 'Use a YAML boolean, for example: disable-model-invocation: false',
    }
  }

  if (raw === 'frontmatter.user-invocable must be boolean') {
    return {
      area: 'user-invocable',
      message: 'user-invocable must be true or false.',
      suggestion: 'Use a YAML boolean, for example: user-invocable: true',
    }
  }

  if (raw.startsWith('unsafe relative link path:')) {
    const link = raw.replace('unsafe relative link path:', '').trim()
    return {
      area: 'links',
      message: `Unsafe relative link path: ${link}`,
      suggestion: 'Use a safe relative path without "/", "..", or backslashes.',
    }
  }

  if (raw.startsWith('missing linked file:')) {
    const link = raw.replace('missing linked file:', '').trim()
    return {
      area: 'links',
      message: `Linked file does not exist: ${link}`,
      suggestion: 'Create the file or remove/update the link in SKILL.md.',
    }
  }

  return {
    area: 'validation',
    message: raw,
  }
}

function mapValidationWarning(raw) {
  if (raw.startsWith('unexpected frontmatter key:')) {
    const key = raw.replace('unexpected frontmatter key:', '').trim()
    return {
      area: 'frontmatter',
      message: `Unexpected frontmatter key: ${key}`,
      suggestion: 'Remove it or move it into metadata if you still need it.',
    }
  }

  if (raw.startsWith('frontmatter.name (') && raw.includes('differs from folder name')) {
    return {
      area: 'name',
      message: 'frontmatter.name differs from the folder name.',
      suggestion: 'Keep them the same to avoid packaging confusion.',
    }
  }

  if (raw === 'description should start with: "This skill should be used when"') {
    return {
      area: 'description',
      message: 'Description does not follow the recommended starter phrase.',
      suggestion: 'Start with: "This skill should be used when ...".',
    }
  }

  if (raw.startsWith('missing recommended section:')) {
    const section = raw.replace('missing recommended section:', '').trim()
    return {
      area: 'sections',
      message: `Recommended section is missing: ${section}`,
      suggestion: 'Add the section to improve consistency and readability.',
    }
  }

  if (raw === 'template placeholders detected in body (e.g., <...>)') {
    return {
      area: 'content',
      message: 'Template placeholders are still present in SKILL.md.',
      suggestion: 'Replace placeholders like <...> with concrete content.',
    }
  }

  return {
    area: 'warning',
    message: raw,
  }
}

function mapFatalError(raw) {
  if (raw === 'skill path is required') {
    return 'A target path is required. Example: pnpm skill:validate -- ./local-skills/my-skill'
  }

  if (raw.startsWith('path does not exist:')) {
    return `The target path was not found. ${raw}`
  }

  if (raw.startsWith('expected a skill directory or SKILL.md path')) {
    return 'Target must be a skill folder or a SKILL.md file path.'
  }

  if (raw.startsWith('SKILL.md not found in:')) {
    return `${raw}. Add SKILL.md first.`
  }

  if (raw === 'SKILL.md frontmatter missing or malformed') {
    return 'SKILL.md frontmatter is missing or malformed. Use YAML frontmatter wrapped by "---".'
  }

  if (raw === 'frontmatter must be a YAML object') {
    return 'Frontmatter must be a YAML object (key/value map).'
  }

  return raw
}

function formatErrorBlock(errors) {
  return errors.map((raw) => mapValidationError(raw))
}

function formatWarningBlock(warnings) {
  return warnings.map((raw) => mapValidationWarning(raw))
}

module.exports = {
  formatErrorBlock,
  formatWarningBlock,
  mapFatalError,
}
