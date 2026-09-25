/**
 * ID 生成。
 * crypto.randomUUID 需要安全上下文（https / localhost），GitHub Pages 满足，
 * 但本地用 IP 访问时不是安全上下文，所以保留降级实现。
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
