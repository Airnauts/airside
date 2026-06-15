import { describe, expect, it } from 'vitest'
import { createMemoryRepository, InMemoryRepository } from './index'

describe('createMemoryRepository', () => {
  it('returns a fresh InMemoryRepository on each call (no shared state)', () => {
    const a = createMemoryRepository()
    const b = createMemoryRepository()
    expect(a).toBeInstanceOf(InMemoryRepository)
    expect(a).not.toBe(b)
  })
})
