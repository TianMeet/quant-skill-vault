import { describe, it, expect } from 'vitest'
import { slugify } from '../slugify'

describe('slugify', () => {
  it('should convert spaces to hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('should convert to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('should handle special characters by replacing with hyphens', () => {
    expect(slugify('hello@world!')).toBe('hello-world')
  })

  it('should compress multiple consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world')
  })

  it('should trim leading and trailing hyphens', () => {
    expect(slugify('--hello-world--')).toBe('hello-world')
  })

  it('should handle Chinese characters by replacing with hyphens', () => {
    expect(slugify('量化技能库')).toBe('')
  })

  it('should handle mixed Chinese and English', () => {
    expect(slugify('hello 量化 world')).toBe('hello-world')
  })

  it('should truncate to 64 characters max', () => {
    const longName = 'a'.repeat(100)
    const result = slugify(longName)
    expect(result.length).toBeLessThanOrEqual(64)
  })

  it('should handle empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('should handle numbers', () => {
    expect(slugify('skill 123')).toBe('skill-123')
  })

  it('should handle already valid slugs', () => {
    expect(slugify('valid-slug-123')).toBe('valid-slug-123')
  })

  it('should not end with hyphen after truncation', () => {
    const input = 'a-'.repeat(40)
    const result = slugify(input)
    expect(result.length).toBeLessThanOrEqual(64)
    expect(result).not.toMatch(/-$/)
  })
})
