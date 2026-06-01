// packages/client/src/panel/navigate.test.ts
import { describe, expect, it, vi } from 'vitest'
import { FOCUS_STORAGE_KEY, goToThread, takeFocusHandoff } from './navigate'

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('focus handoff', () => {
  it('takeFocusHandoff reads then clears the key (one-shot)', () => {
    const storage = fakeStorage({ [FOCUS_STORAGE_KEY]: 't1' })
    expect(takeFocusHandoff(storage)).toBe('t1')
    expect(takeFocusHandoff(storage)).toBeNull()
  })

  it('goToThread stashes the id and navigates to the page url', () => {
    const storage = fakeStorage()
    const assign = vi.fn()
    goToThread({ id: 't1', pageUrl: 'https://x.test/pricing' }, { storage, assign })
    expect(storage.getItem(FOCUS_STORAGE_KEY)).toBe('t1')
    expect(assign).toHaveBeenCalledWith('https://x.test/pricing')
  })
})
