import { describe, expect, it } from 'vitest'
import { InMemoryRepository, memoryRepository } from './index'

describe('memoryRepository', () => {
  it('returns a fresh InMemoryRepository on each call (no shared state)', () => {
    const a = memoryRepository()
    const b = memoryRepository()
    expect(a).toBeInstanceOf(InMemoryRepository)
    expect(a).not.toBe(b)
  })
})
