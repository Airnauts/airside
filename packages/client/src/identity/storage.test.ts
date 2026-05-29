import { beforeEach, describe, expect, it } from 'vitest'
import { loadIdentity, saveIdentity } from './storage'

describe('identity storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(loadIdentity()).toBeNull()
  })

  it('round-trips an identity', () => {
    saveIdentity({ email: 'a@b.com', name: 'Ada' })
    expect(loadIdentity()).toEqual({ email: 'a@b.com', name: 'Ada' })
  })

  it('omits a missing name', () => {
    saveIdentity({ email: 'a@b.com' })
    expect(loadIdentity()).toEqual({ email: 'a@b.com', name: undefined })
  })

  it('returns null on malformed json', () => {
    localStorage.setItem('comments:identity', '{not json')
    expect(loadIdentity()).toBeNull()
  })

  it('returns null when email is missing', () => {
    localStorage.setItem('comments:identity', JSON.stringify({ name: 'no email' }))
    expect(loadIdentity()).toBeNull()
  })
})
