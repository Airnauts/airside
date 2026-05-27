import { describe, expect, it } from 'vitest'
import { CaptureContext, Provenance } from './capture'

describe('capture & provenance', () => {
  it('parses a full capture context', () => {
    const ctx = { viewportW: 1713, viewportH: 1262, devicePixelRatio: 1, userAgent: 'Mozilla/5.0' }
    expect(CaptureContext.parse(ctx).viewportW).toBe(1713)
  })
  it('rejects a non-positive viewport', () => {
    expect(() =>
      CaptureContext.parse({ viewportW: 0, viewportH: 1262, devicePixelRatio: 1, userAgent: 'x' }),
    ).toThrow()
  })
  it('treats every provenance field as optional', () => {
    expect(Provenance.parse({})).toEqual({})
    expect(Provenance.parse({ commitSha: 'a9a79', branch: 'dev' }).branch).toBe('dev')
  })
})
