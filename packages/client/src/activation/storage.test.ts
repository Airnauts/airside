import { beforeEach, describe, expect, it } from 'vitest'
import { loadActivationKey, saveActivationKey } from './storage'

describe('activation storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(loadActivationKey()).toBeNull()
  })

  it('round-trips a key', () => {
    saveActivationKey('dev-key')
    expect(loadActivationKey()).toBe('dev-key')
  })

  it('returns null on malformed json', () => {
    localStorage.setItem('airside:key', '{not json')
    expect(loadActivationKey()).toBeNull()
  })

  it('returns null when the stored value is not a string', () => {
    localStorage.setItem('airside:key', JSON.stringify({ key: 'nope' }))
    expect(loadActivationKey()).toBeNull()
  })
})
