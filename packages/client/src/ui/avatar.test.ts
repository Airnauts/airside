// packages/client/src/ui/avatar.test.ts
import type { Author } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { avatarColor, initials } from './avatar'

const a = (email: string, name?: string) => ({ email, name }) as Author

describe('initials', () => {
  it('uses two name parts', () => expect(initials(a('x@y.z', 'Ada Lovelace'))).toBe('AL'))
  it('uses one name part', () => expect(initials(a('x@y.z', 'Ada'))).toBe('A'))
  it('falls back to the email local part', () => expect(initials(a('ada@y.z'))).toBe('AD'))
})

describe('avatarColor', () => {
  it('is deterministic for the same seed', () =>
    expect(avatarColor('a@b.c')).toBe(avatarColor('a@b.c')))
  it('returns an hsl string', () => expect(avatarColor('a@b.c')).toMatch(/^hsl\(/))
})
