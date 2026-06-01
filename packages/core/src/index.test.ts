import { describe, expect, it } from 'vitest'
import {
  ANCHOR_SCHEMA_VERSION,
  Anchor,
  buildOpenApiDocument,
  KEY_HEADER_NAME,
  normalizePageKey,
  operations,
  ThreadId,
} from './index'

describe('@airnauts/comments-core public surface', () => {
  it('re-exports the frozen contract entry points', () => {
    expect(typeof normalizePageKey).toBe('function')
    expect(typeof buildOpenApiDocument).toBe('function')
    expect(ANCHOR_SCHEMA_VERSION).toBe(1)
    expect(KEY_HEADER_NAME).toBe('x-comments-key')
    expect(Array.isArray(operations)).toBe(true)
    expect(ThreadId.parse('t1')).toBe('t1')
    expect(Anchor).toBeDefined()
  })
})
