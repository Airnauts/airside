// packages/client/src/panel/navigate.test.ts
import { describe, expect, it, vi } from 'vitest'
import { FOCUS_STORAGE_KEY, goToThread, takeFocusHandoff } from './navigate'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('focus handoff', () => {
  it('round-trips an openDetail handoff', () => {
    const storage = memStorage()
    goToThread(
      { id: 't1', pageUrl: 'https://x/a', openDetail: true },
      { storage, assign: () => {} },
    )
    const handoff = takeFocusHandoff(storage)
    expect(handoff).toEqual({ id: 't1', openDetail: true })
    expect(takeFocusHandoff(storage)).toBeNull() // consumed once
  })

  it('tolerates a legacy bare-string id', () => {
    const storage = memStorage()
    storage.setItem('airside:focus', 't9')
    expect(takeFocusHandoff(storage)).toEqual({ id: 't9', openDetail: false })
  })

  it('defaults openDetail to false when omitted', () => {
    const storage = memStorage()
    goToThread({ id: 't2', pageUrl: 'https://x/b' }, { storage, assign: () => {} })
    expect(takeFocusHandoff(storage)).toEqual({ id: 't2', openDetail: false })
  })

  it('goToThread stashes the id and navigates to the page url', () => {
    const storage = memStorage()
    const assign = vi.fn()
    goToThread({ id: 't1', pageUrl: 'https://x.test/pricing' }, { storage, assign })
    expect(storage.getItem(FOCUS_STORAGE_KEY)).toBe(JSON.stringify({ id: 't1', openDetail: false }))
    expect(assign).toHaveBeenCalledWith('https://x.test/pricing')
  })
})
