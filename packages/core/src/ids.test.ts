import { describe, expect, it } from 'vitest'
import { AttachmentId, AuthorId, CommentId, ThreadId } from './ids'

describe('branded ids', () => {
  it('parse non-empty strings and return the value', () => {
    expect(ThreadId.parse('3kXLTXxq-P9l')).toBe('3kXLTXxq-P9l')
    expect(CommentId.parse('fpWlAEqHzj96')).toBe('fpWlAEqHzj96')
    expect(AuthorId.parse('a1')).toBe('a1')
    expect(AttachmentId.parse('img1')).toBe('img1')
  })
  it('reject empty strings', () => {
    expect(() => ThreadId.parse('')).toThrow()
  })
})
