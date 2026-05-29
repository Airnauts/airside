import { describe, expect, it } from 'vitest'
import { isActivated } from './gate'

describe('isActivated', () => {
  it('activates when the default param is present and equals the key', () => {
    expect(isActivated({ search: '?comments-key=secret', key: 'secret' })).toBe(true)
  })

  it('does not activate when the param is absent', () => {
    expect(isActivated({ search: '', key: 'secret' })).toBe(false)
    expect(isActivated({ search: '?other=1', key: 'secret' })).toBe(false)
  })

  it('does not activate when the param value differs from the key', () => {
    expect(isActivated({ search: '?comments-key=wrong', key: 'secret' })).toBe(false)
  })

  it('honors a custom param name', () => {
    expect(isActivated({ search: '?ck=secret', key: 'secret', keyParam: 'ck' })).toBe(true)
  })
})
