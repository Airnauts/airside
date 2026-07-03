import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAUNCHER_POSITION } from '../launcher/storage'
import { getSetting, initSettings, resetSettings, setSetting } from './store'

/** A spy-able in-memory Storage so we can assert the read-once behaviour. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    getItem: vi.fn((k: string) => (map.has(k) ? (map.get(k) as string) : null)),
    setItem: vi.fn((k: string, v: string) => void map.set(k, v)),
    removeItem: vi.fn((k: string) => void map.delete(k)),
    clear: vi.fn(() => map.clear()),
    key: vi.fn(() => null),
    get length() {
      return map.size
    },
  } as unknown as Storage & { getItem: ReturnType<typeof vi.fn> }
}

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSettings()
  })

  it('reads every known key exactly once on init and never re-reads on get', () => {
    const storage = fakeStorage()
    initSettings(storage)
    // One getItem per known key during hydration.
    expect(storage.getItem).toHaveBeenCalledTimes(4)
    storage.getItem.mockClear()
    // Reads now come from the cache — no further storage access.
    getSetting('activationKey')
    getSetting('identity')
    getSetting('launcherPosition')
    getSetting('pinsHidden')
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it('returns each key’s default when nothing is stored', () => {
    initSettings(fakeStorage())
    expect(getSetting('activationKey')).toBeNull()
    expect(getSetting('identity')).toBeNull()
    expect(getSetting('launcherPosition')).toEqual(DEFAULT_LAUNCHER_POSITION)
    expect(getSetting('pinsHidden')).toBe(false)
  })

  it('round-trips set/get for every key against localStorage', () => {
    initSettings()
    setSetting('activationKey', 'dev-key')
    setSetting('identity', { email: 'a@b.com', name: 'Ada' })
    setSetting('launcherPosition', { edge: 'left', top: 40 })
    setSetting('pinsHidden', true)
    expect(getSetting('activationKey')).toBe('dev-key')
    expect(getSetting('identity')).toEqual({ email: 'a@b.com', name: 'Ada' })
    expect(getSetting('launcherPosition')).toEqual({ edge: 'left', top: 40 })
    expect(getSetting('pinsHidden')).toBe(true)
    // Writes are persisted to the bound storage under the established on-disk keys.
    expect(localStorage.getItem('airside:key')).toBe(JSON.stringify('dev-key'))
    expect(localStorage.getItem('airside:pins-hidden')).toBe(JSON.stringify(true))
  })

  it('falls back to the per-key default on malformed JSON', () => {
    initSettings(
      fakeStorage({
        'airside:key': '{not json',
        'airside:identity': '{not json',
        'airside:launcher-position': '{not json',
        'airside:pins-hidden': '{not json',
      }),
    )
    expect(getSetting('activationKey')).toBeNull()
    expect(getSetting('identity')).toBeNull()
    expect(getSetting('launcherPosition')).toEqual(DEFAULT_LAUNCHER_POSITION)
    expect(getSetting('pinsHidden')).toBe(false)
  })

  it('falls back to the per-key default on wrong-type values', () => {
    initSettings(
      fakeStorage({
        'airside:key': JSON.stringify({ key: 'nope' }),
        'airside:identity': JSON.stringify({ name: 'no email' }),
        'airside:pins-hidden': JSON.stringify('yes'),
      }),
    )
    expect(getSetting('activationKey')).toBeNull()
    expect(getSetting('identity')).toBeNull()
    expect(getSetting('pinsHidden')).toBe(false)
  })

  it('clamps an out-of-range launcher top to the on-screen band', () => {
    initSettings(
      fakeStorage({ 'airside:launcher-position': JSON.stringify({ edge: 'right', top: 999 }) }),
    )
    expect(getSetting('launcherPosition')).toEqual({ edge: 'right', top: 95 })
  })

  it('omits a missing identity name', () => {
    initSettings(fakeStorage({ 'airside:identity': JSON.stringify({ email: 'a@b.com' }) }))
    expect(getSetting('identity')).toEqual({ email: 'a@b.com', name: undefined })
  })

  it('lazily hydrates from localStorage when init has not run', () => {
    localStorage.setItem('airside:pins-hidden', JSON.stringify(true))
    // No initSettings() call — getSetting must hydrate on first access.
    expect(getSetting('pinsHidden')).toBe(true)
  })

  it('resetSettings drops the cache so a later seed + access re-hydrates', () => {
    initSettings()
    expect(getSetting('pinsHidden')).toBe(false)
    // Seed AFTER the first read — without a reset the stale cached value would leak.
    localStorage.setItem('airside:pins-hidden', JSON.stringify(true))
    expect(getSetting('pinsHidden')).toBe(false)
    resetSettings()
    expect(getSetting('pinsHidden')).toBe(true)
  })

  it('does not throw when a write fails (storage unavailable)', () => {
    const storage = fakeStorage()
    ;(storage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    initSettings(storage)
    expect(() => setSetting('pinsHidden', true)).not.toThrow()
    // The in-memory cache still updates even though the persist failed.
    expect(getSetting('pinsHidden')).toBe(true)
  })
})
