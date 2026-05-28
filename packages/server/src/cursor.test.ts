import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'

describe('cursor codec', () => {
  it('round-trips updatedAt + id', () => {
    const input = { updatedAt: '2026-05-28T10:00:00.000Z', id: 'thread-123' }
    const token = encodeCursor(input)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/) // base64url, no padding
    expect(decodeCursor(token)).toEqual(input)
  })

  it('produces stable output for the same input', () => {
    const a = encodeCursor({ updatedAt: '2026-05-28T10:00:00.000Z', id: 'x' })
    const b = encodeCursor({ updatedAt: '2026-05-28T10:00:00.000Z', id: 'x' })
    expect(a).toBe(b)
  })

  it('returns undefined for malformed cursors', () => {
    expect(decodeCursor('!!!not-base64!!!')).toBeUndefined()
    expect(decodeCursor('Zm9v')).toBeUndefined() // base64url of "foo", not JSON
    expect(decodeCursor('')).toBeUndefined()
  })

  it('returns undefined when payload is wrong shape', () => {
    const bad = Buffer.from(JSON.stringify({ u: 123, i: 'x' })).toString('base64url')
    expect(decodeCursor(bad)).toBeUndefined()
  })
})
