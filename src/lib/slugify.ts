/**
 * slugify - 将标题转换为 Claude Code Skills 合规的 slug
 * 规则：小写字母/数字/连字符，<=64 字符
 */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      // 移除非 ASCII 字母数字字符（中文等），替换为连字符
      .replace(/[^a-z0-9-]/g, '-')
      // 压缩连续连字符
      .replace(/-{2,}/g, '-')
      // 去除首尾连字符
      .replace(/^-+|-+$/g, '')
      // 截断到 64 字符
      .slice(0, 64)
      // 截断后可能末尾是连字符，再 trim
      .replace(/-+$/, '')
  )
}
